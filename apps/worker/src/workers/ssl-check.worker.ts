import { Worker, type Job } from 'bullmq'
import { QUEUES } from '@webmonitor/shared'
import type { SslCheckJobData } from '@webmonitor/shared'
import { connection } from '../queues'
import { db } from '../lib/db'
import { checkSsl } from '../lib/ssl'
import { checkAndTriggerAlerts } from '../lib/alerts'

const CONCURRENCY = Number(process.env.SSL_CHECK_CONCURRENCY ?? 10)
const SSL_EXPIRY_ALERT_DAYS = 30

export const sslCheckWorker = new Worker<SslCheckJobData, void, string>(
  QUEUES.SSL_CHECK,
  processJob,
  { connection, concurrency: CONCURRENCY }
)

sslCheckWorker.on('failed', (job, err) => {
  console.error(`[ssl-check] Job ${job?.id} failed:`, err.message)
})

async function processJob(job: Job<SslCheckJobData>): Promise<void> {
  const { siteId, domain } = job.data

  const result = await checkSsl(domain)

  await db.sslCertificate.create({
    data: {
      siteId,
      isValid: result.isValid,
      issuer: result.issuer,
      subject: result.subject,
      validFrom: result.validFrom,
      validTo: result.validTo,
      daysUntilExpiry: result.daysUntilExpiry,
      serialNumber: result.serialNumber,
      fingerprintSha256: result.fingerprintSha256,
      protocol: result.protocol,
      cipherSuite: result.cipherSuite,
      subjectAltNames: result.subjectAltNames,
      errorMessage: result.errorMessage,
    },
  })

  console.log(`[ssl-check] ${domain}: valid=${result.isValid} expires=${result.daysUntilExpiry}d`)

  // Alert if expiring soon
  if (
    result.isValid &&
    result.daysUntilExpiry !== null &&
    result.daysUntilExpiry <= SSL_EXPIRY_ALERT_DAYS
  ) {
    await checkAndTriggerAlerts({
      siteId,
      type: 'SSL_EXPIRY',
      details: { domain, daysUntilExpiry: result.daysUntilExpiry },
    })
  }
}
