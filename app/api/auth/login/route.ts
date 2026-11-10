import { NextRequest, NextResponse } from 'next/server'
import { createSessionValue, sessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'

const ALLOWED_HANDLES = new Set(['kelosocial.eu', 'moderation.kelosocial.eu'])
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

function normalizeUrl(value: string) {
  return new URL(value).origin.replace(/\/$/, '').toLowerCase()
}

async function resolveAccount(handle: string, pdsUrl: string): Promise<string | null> {
  const response = await fetch(`${pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return null
  const result = await response.json() as { did?: string }
  const did = result.did
  if (!did || (!did.startsWith('did:plc:') && !did.startsWith('did:web:'))) return null

  let documentUrl: string
  if (did.startsWith('did:plc:')) {
    documentUrl = `https://plc.directory/${encodeURIComponent(did)}`
  } else {
    const methodSpecificId = did.slice('did:web:'.length)
    const parts = methodSpecificId.split(':').map((part) => decodeURIComponent(part))
    const host = parts.shift()
    if (!host) return null
    documentUrl = parts.length
      ? `https://${host}/${parts.join('/')}/did.json`
      : `https://${host}/.well-known/did.json`
  }

  const didResponse = await fetch(documentUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!didResponse.ok) return null
  const document = await didResponse.json() as {
    id?: string
    alsoKnownAs?: string[]
    service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>
  }
  if (document.id !== did || !Array.isArray(document.alsoKnownAs) || !Array.isArray(document.service)) return null
  const hasHandle = document.alsoKnownAs.some((alias) => alias.toLowerCase() === `at://${handle}`)
  const pdsService = document.service.find((service) =>
    (service.id === '#atproto_pds' || service.id?.endsWith('#atproto_pds')) &&
    service.type === 'AtprotoPersonalDataServer' &&
    typeof service.serviceEndpoint === 'string'
  )
  if (!hasHandle || !pdsService?.serviceEndpoint) return null
  try {
    if (normalizeUrl(pdsService.serviceEndpoint) !== normalizeUrl(pdsUrl)) return null
  } catch {
    return null
  }
  return did
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.redirect(new URL('/?error=rate', req.url), 303)

  let identifier = ''
  let password = ''
  let authFactorToken = ''
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      identifier = String(body?.identifier || body?.handle || '')
      password = String(body?.password || '')
      authFactorToken = String(body?.authFactorToken || '')
    } else {
      const form = await req.formData()
      identifier = String(form.get('identifier') || form.get('handle') || '')
      password = String(form.get('password') || '')
      authFactorToken = String(form.get('authFactorToken') || '')
    }
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid', req.url), 303)
  }

  const handle = identifier.trim().replace(/^@/, '').toLowerCase()
  const pdsUrl = process.env.PDS_URL
  if (!ALLOWED_HANDLES.has(handle) || !password || password.length > 256 || authFactorToken.length > 256 || !pdsUrl) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return NextResponse.redirect(new URL('/?error=invalid', req.url), 303)
  }

  try {
    const normalizedPds = normalizeUrl(pdsUrl)
    const did = await resolveAccount(handle, normalizedPds)
    if (!did) return NextResponse.redirect(new URL('/?error=denied', req.url), 303)

    const loginResponse = await fetch(`${normalizedPds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        identifier: handle,
        password,
        ...(authFactorToken ? { authFactorToken } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    const session = await loginResponse.json().catch(() => ({})) as {
      did?: string
      handle?: string
      accessJwt?: string
      refreshJwt?: string
      error?: string
      message?: string
    }

    if (!loginResponse.ok) {
      const errorCode = String(session.error || '')
      if (errorCode === 'AuthFactorTokenRequired' || errorCode === 'AuthFactorTokenInvalid') {
        return NextResponse.redirect(new URL(`/?error=factor${authFactorToken ? '-invalid' : ''}`, req.url), 303)
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
      return NextResponse.redirect(new URL('/?error=invalid', req.url), 303)
    }

    if (session.did !== did || session.handle?.toLowerCase() !== handle || !session.accessJwt || !session.refreshJwt) {
      return NextResponse.redirect(new URL('/?error=denied', req.url), 303)
    }

    attempts.delete(ip)
    const response = NextResponse.redirect(new URL('/dashboard', req.url), 303)
    response.cookies.set(sessionCookie.name, createSessionValue({ did, handle, pdsUrl: normalizedPds }), sessionCookie.options)
    return response
  } catch (error) {
    console.error('[Kelo Moderation] AT Protocol login failed:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.redirect(new URL('/?error=unavailable', req.url), 303)
  }
}
