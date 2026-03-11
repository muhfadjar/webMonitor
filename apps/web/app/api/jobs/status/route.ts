import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { siteDiscoveryQueue, pageCheckQueue, sslCheckQueue } from '@/lib/queues'

export const GET = withAuthAndErrors(async () => {
  const [discovery, pageCheck, ssl] = await Promise.all([
    siteDiscoveryQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    pageCheckQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    sslCheckQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ])

  return NextResponse.json({
    queues: {
      'site-discovery': discovery,
      'page-check': pageCheck,
      'ssl-check': ssl,
    },
  })
})
