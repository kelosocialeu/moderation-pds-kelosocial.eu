import { NextRequest, NextResponse } from 'next/server'
import { sessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/?logout=success', req.url), 303)
  res.cookies.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 })
  return res
}
