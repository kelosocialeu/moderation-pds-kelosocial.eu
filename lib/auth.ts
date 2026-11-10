import 'server-only'
import crypto from 'node:crypto'

const COOKIE = 'kelo_mod_session'
const MAX_AGE = 60 * 60 * 8
const ALLOWED_HANDLES = new Set(['kelosocial.eu', 'moderation.kelosocial.eu'])

export type AuthenticatedIdentity = {
  did: string
  handle: string
  pdsUrl: string
}

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  return value
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

function normalizePdsUrl(value: string) {
  return new URL(value).origin.replace(/\/$/, '').toLowerCase()
}

export function createSessionValue(identity: AuthenticatedIdentity) {
  const payload = Buffer.from(JSON.stringify({
    ...identity,
    handle: identity.handle.toLowerCase(),
    pdsUrl: normalizePdsUrl(identity.pdsUrl),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
    nonce: crypto.randomBytes(24).toString('base64url'),
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function isValidSession(value?: string): boolean {
  if (!value) return false
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra) return false
  const expected = sign(payload)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AuthenticatedIdentity> & { exp?: number; nonce?: string }
    const configuredPds = process.env.PDS_URL
    if (!configuredPds || !data.did || !data.handle || !data.pdsUrl || !data.exp || !data.nonce) return false
    if (!ALLOWED_HANDLES.has(data.handle.toLowerCase())) return false
    if (normalizePdsUrl(data.pdsUrl) !== normalizePdsUrl(configuredPds)) return false
    return data.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function getSessionIdentity(value?: string): AuthenticatedIdentity | null {
  if (!isValidSession(value)) return null
  try {
    const [payload] = value!.split('.')
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthenticatedIdentity
    return { did: data.did, handle: data.handle, pdsUrl: data.pdsUrl }
  } catch {
    return null
  }
}

export const sessionCookie = {
  name: COOKIE,
  maxAge: MAX_AGE,
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: MAX_AGE,
  },
}
