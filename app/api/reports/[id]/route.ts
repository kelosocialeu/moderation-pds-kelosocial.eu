import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isValidSession, sessionCookie } from '@/lib/auth'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })

  const base = process.env.MODERATION_API_URL
  const token = process.env.MODERATION_API_TOKEN
  if (!base || !token) return NextResponse.json({ error: 'Moderation service is not configured' }, { status: 503 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const response = await fetch(`${base.replace(/\/$/, '')}/reports/${id}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  })

  const text = await response.text()
  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  })
}
