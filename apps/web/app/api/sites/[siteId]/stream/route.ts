import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createSubscriber, siteChannel } from '@/lib/redis'
import type { SiteDiscoveryEvent } from '@webmonitor/shared'

const HEARTBEAT_INTERVAL_MS = 25_000

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { siteId } = params
  const channel = siteChannel(siteId)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const subscriber = createSubscriber()

      function send(event: SiteDiscoveryEvent | { type: 'heartbeat' }) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // client already disconnected
        }
      }

      send({ type: 'heartbeat' })

      const heartbeat = setInterval(() => send({ type: 'heartbeat' }), HEARTBEAT_INTERVAL_MS)

      subscriber.on('message', (_ch: string, message: string) => {
        try {
          const event = JSON.parse(message) as SiteDiscoveryEvent
          send(event)
          if (event.type === 'complete' || event.type === 'error') {
            clearInterval(heartbeat)
            void subscriber.quit()
            controller.close()
          }
        } catch {
          // malformed message — ignore
        }
      })

      subscriber.on('error', () => {
        clearInterval(heartbeat)
        controller.close()
      })

      await subscriber.subscribe(channel)

      return () => {
        clearInterval(heartbeat)
        void subscriber.quit()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
