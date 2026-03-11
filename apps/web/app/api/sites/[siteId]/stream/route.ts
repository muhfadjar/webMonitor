import { withAuthAndErrors } from '@/lib/api-helpers'
import { NextResponse } from 'next/server'

// SSE endpoint — Phase 4 will implement full pub/sub via Redis
export const GET = withAuthAndErrors(async (_req, { params }) => {
  const siteId = params['siteId']

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      // Send a heartbeat immediately so the client knows connection is open
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', siteId })}\n\n`)
      )
      // In Phase 4 this will subscribe to Redis pub/sub
      // For now the stream stays open until client disconnects
    },
    cancel() {
      // cleanup — Phase 4: unsubscribe from Redis channel
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
