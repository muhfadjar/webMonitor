import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

type RouteContext = { params: Record<string, string> }
type Handler = (req: NextRequest, ctx: RouteContext) => Promise<Response>

/** Wrap a handler to require a valid session. Returns 401 if unauthenticated. */
export function withAuth(handler: Handler): Handler {
  return async (req, ctx) => {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req, ctx)
  }
}

/** Wrap a handler with structured error handling. */
export function withErrorHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: 'Validation error', details: err.flatten() },
          { status: 400 }
        )
      }
      console.error('[API Error]', { url: req.url, err })
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/** Convenience: auth + error handler combined. */
export function withAuthAndErrors(handler: Handler): Handler {
  return withAuth(withErrorHandler(handler))
}

/** Parse query params from a request URL into a plain object. */
export function parseSearchParams(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries())
}

/** Standard paginated JSON response. */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) {
  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

/** Not implemented stub — used during Phase 2 scaffolding. */
export function notImplemented() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
