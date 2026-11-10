import { NextResponse } from 'next/server'
import { sessionCookie } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.redirect(new URL('/?logout=success', process.env.APP_URL || 'https://kelosocial.eu'), 303)
  res.cookies.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 })
  return res
}
