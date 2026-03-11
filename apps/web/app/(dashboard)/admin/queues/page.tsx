import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Queue } from 'bullmq'
import { QUEUES } from '@webmonitor/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Queue Monitor' }
export const dynamic = 'force-dynamic'

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  enableReadyCheck: false,
  maxRetriesPerRequest: null as null,
}

async function getQueueStats() {
  const queues = Object.values(QUEUES).map((name) => new Queue(name, { connection }))

  const stats = await Promise.all(
    queues.map(async (q) => {
      const [counts, failedJobs] = await Promise.all([
        q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
        q.getFailed(0, 9),
      ])
      return { name: q.name, counts, failedJobs }
    })
  )

  await Promise.all(queues.map((q) => q.close()))
  return stats
}

export default async function QueueMonitorPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/')

  const stats = await getQueueStats()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Queue Monitor</h1>
        <p className="text-muted-foreground text-sm mt-1">BullMQ job queue stats</p>
      </div>

      <div className="space-y-6">
        {stats.map(({ name, counts, failedJobs }) => (
          <Card key={name}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-mono">{name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Count badges */}
              <div className="flex flex-wrap gap-3">
                <StatChip label="Waiting" value={counts.waiting} variant="secondary" />
                <StatChip label="Active" value={counts.active} variant="warning" />
                <StatChip label="Completed" value={counts.completed} variant="success" />
                <StatChip label="Failed" value={counts.failed} variant="error" />
                <StatChip label="Delayed" value={counts.delayed} variant="muted" />
              </div>

              {/* Failed jobs */}
              {failedJobs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Recent failures (latest 10)
                  </p>
                  <div className="space-y-2">
                    {failedJobs.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
                      >
                        <p className="font-medium font-mono">{job.name}</p>
                        <p className="text-destructive mt-1">{job.failedReason}</p>
                        <p className="text-muted-foreground mt-1">
                          {job.processedOn ? new Date(job.processedOn).toISOString() : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'secondary' | 'warning' | 'success' | 'error' | 'muted'
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  )
}
