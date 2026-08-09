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
  if (limited(ip)) return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })

  let body: { password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }) }
  if (!body.password || body.password.length > 256 || !verifyPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 700))
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 })
  }

  attempts.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookie.name, createSessionValue(), sessionCookie.options)
  return res
}
