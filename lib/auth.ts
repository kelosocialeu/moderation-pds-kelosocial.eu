import 'server-only'
import crypto from 'node:crypto'

const COOKIE = 'kelo_mod_session'
const MAX_AGE = 60 * 60 * 8

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  return value
}

export function verifyPassword(password: string) {
  const direct = process.env.ADMIN_PASSWORD
  if (direct) {
    const a = Buffer.from(password)
    const b = Buffer.from(direct)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  const expected = process.env.ADMIN_PASSWORD_HASH
  if (!expected) throw new Error('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is missing')
  const [salt, hash] = expected.split(':')
  if (!salt || !hash) return false
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'))
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createSessionValue() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const nonce = crypto.randomBytes(24).toString('base64url')
  const payload = `${exp}.${nonce}`
  return `${payload}.${sign(payload)}`
}

export function isValidSession(value?: string) {
  if (!value) return false
  const [exp, nonce, signature] = value.split('.')
  if (!exp || !nonce || !signature) return false
  const payload = `${exp}.${nonce}`
  const expected = sign(payload)
  if (signature.length !== expected.length) return false
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
  return Number(exp) > Math.floor(Date.now() / 1000)
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
