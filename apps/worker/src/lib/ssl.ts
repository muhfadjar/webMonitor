import tls from 'tls'

const SSL_TIMEOUT_MS = 10_000

export interface SslResult {
  isValid: boolean
  issuer: string | null
  subject: string | null
  validFrom: Date | null
  validTo: Date | null
  daysUntilExpiry: number | null
  serialNumber: string | null
  fingerprintSha256: string | null
  protocol: string | null
  cipherSuite: string | null
  subjectAltNames: string[]
  errorMessage: string | null
}

export function checkSsl(hostname: string): Promise<SslResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(errorResult('TLS connection timed out'))
    }, SSL_TIMEOUT_MS)

    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
      () => {
        clearTimeout(timer)
        try {
          const cert = socket.getPeerCertificate(true)

          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy()
            resolve(errorResult('No certificate returned'))
            return
          }

          const validFrom = cert.valid_from ? new Date(cert.valid_from) : null
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null
          const now = Date.now()
          const daysUntilExpiry =
            validTo ? Math.floor((validTo.getTime() - now) / (1000 * 60 * 60 * 24)) : null

          const subjectAltNames = parseSANs(cert.subjectaltname)
          const issuer = formatCertEntity(cert.issuer)
          const subject = formatCertEntity(cert.subject)

          // socket.authorized is true only if the full chain validates
          const isValid = socket.authorized && daysUntilExpiry !== null && daysUntilExpiry >= 0

          const cipher = socket.getCipher()
          const protocol = socket.getProtocol() ?? null

          socket.destroy()
          resolve({
            isValid: !!isValid,
            issuer,
            subject,
            validFrom,
            validTo,
            daysUntilExpiry,
            serialNumber: cert.serialNumber ?? null,
            fingerprintSha256: cert.fingerprint256 ?? null,
            protocol,
            cipherSuite: cipher?.name ?? null,
            subjectAltNames,
            errorMessage: socket.authorized ? null : (socket.authorizationError?.message ?? String(socket.authorizationError ?? '')),
          })
        } catch (err) {
          socket.destroy()
          resolve(errorResult(err instanceof Error ? err.message : String(err)))
        }
      }
    )

    socket.on('error', (err) => {
      clearTimeout(timer)
      socket.destroy()
      resolve(errorResult(err.message))
    })
  })
}

function errorResult(errorMessage: string): SslResult {
  return {
    isValid: false,
    issuer: null,
    subject: null,
    validFrom: null,
    validTo: null,
    daysUntilExpiry: null,
    serialNumber: null,
    fingerprintSha256: null,
    protocol: null,
    cipherSuite: null,
    subjectAltNames: [],
    errorMessage,
  }
}

function formatCertEntity(entity: tls.Certificate | undefined): string | null {
  if (!entity) return null
  const parts: string[] = []
  if (entity.CN) parts.push(`CN=${entity.CN}`)
  if (entity.O) parts.push(`O=${entity.O}`)
  if (entity.OU) parts.push(`OU=${entity.OU}`)
  return parts.length > 0 ? parts.join(', ') : null
}

/** Parse "DNS:example.com, DNS:www.example.com" → ["example.com", "www.example.com"] */
function parseSANs(subjectaltname: string | undefined): string[] {
  if (!subjectaltname) return []
  return subjectaltname
    .split(',')
    .map((s) => s.trim().replace(/^DNS:/i, ''))
    .filter((s) => s.length > 0)
}
