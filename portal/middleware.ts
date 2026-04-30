import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Set SKIP_AUTH=true in .env to bypass login during local development
export default process.env.SKIP_AUTH === 'true'
  ? () => NextResponse.next()
  : withAuth({ pages: { signIn: '/login' } })

export const config = {
  matcher: ['/brewery/:path*'],
}
