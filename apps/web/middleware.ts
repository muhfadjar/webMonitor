import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Always allow auth routes through
  if (pathname.startsWith('/api/auth')) return NextResponse.next()

  // Redirect logged-in users away from /login
  if (pathname === '/login') {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/', req.nextUrl))
    }
    return NextResponse.next()
  }

  // All other routes require authentication
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)',
  ],
}
