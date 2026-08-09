import { NextRequest, NextResponse } from 'next/server'
import { createSessionValue, sessionCookie, verifyPassword } from '@/lib/auth'

const attempts = new Map<string, { count: number; reset: number }>()

function limited(ip: string) {
  const now = Date.now()
  const current = attempts.get(ip)
  if (!current || current.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60_000 })
    return false
  }
  current.count += 1
  return current.count > 8
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.redirect(new URL('/?error=rate', req.url), 303)

  let password = ''
  const contentType = req.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      password = String(body?.password || '')
    } else {
      const form = await req.formData()
      password = String(form.get('password') || '')
    }
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid', req.url), 303)
  }

  if (!password || password.length > 256 || !verifyPassword(password)) {
    await new Promise((r) => setTimeout(r, 700))
    return NextResponse.redirect(new URL('/?error=invalid', req.url), 303)
  }

  attempts.delete(ip)
  const res = NextResponse.redirect(new URL('/dashboard', req.url), 303)
  res.cookies.set(sessionCookie.name, createSessionValue(), sessionCookie.options)
  return res
}
