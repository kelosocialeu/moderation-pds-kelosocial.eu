import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { IdResolver } from '@atproto/identity'
import { cborEncode, noUndefinedVals } from '@atproto/common'
import { Secp256k1Keypair } from '@atproto/crypto'
import { verifyJwt } from '@atproto/xrpc-server'

const PORT = Number(process.env.REPORT_SERVICE_PORT || 3100)
const SERVICE_DID = process.env.REPORT_SERVICE_DID || ''
const API_TOKEN = process.env.MODERATION_API_TOKEN || ''
const DB_PATH = process.env.REPORT_DB_PATH || './data/reports.db'
const REPORT_LXM = 'com.atproto.moderation.createReport'
const LABELER_SERVICE = '#atproto_labeler'
const LABELER_SERVICE_TYPE = 'AtprotoLabeler'
const LABEL_KEY_PATH = process.env.LABEL_SIGNING_KEY_PATH || path.join(path.dirname(DB_PATH), 'label-signing-key.hex')

if (!SERVICE_DID.startsWith('did:')) throw new Error('REPORT_SERVICE_DID is required')
if (!API_TOKEN) throw new Error('MODERATION_API_TOKEN is required')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reason_type TEXT NOT NULL,
  reason TEXT,
  subject_json TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  decision TEXT,
  decided_at TEXT,
  service_jti TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS reports_status_created ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  src TEXT NOT NULL,
  uri TEXT NOT NULL,
  cid TEXT,
  val TEXT NOT NULL,
  neg INTEGER NOT NULL DEFAULT 0,
  cts TEXT NOT NULL,
  exp TEXT,
  sig BLOB,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS labels_uri ON labels(uri);
CREATE INDEX IF NOT EXISTS labels_src_uri ON labels(src, uri);
`)

const idResolver = new IdResolver({ timeout: 5000 })

async function loadSigningKey() {
  let hex = process.env.LABEL_SIGNING_KEY_HEX?.trim()
  if (!hex) {
    try {
      hex = fs.readFileSync(LABEL_KEY_PATH, 'utf8').trim()
    } catch {}
  }
  let key: Secp256k1Keypair
  if (hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('LABEL_SIGNING_KEY_HEX must be 64 hex characters')
    key = await Secp256k1Keypair.import(hex, { exportable: true })
  } else {
    key = await Secp256k1Keypair.create({ exportable: true })
    const exported = await key.export()
    fs.writeFileSync(LABEL_KEY_PATH, Buffer.from(exported).toString('hex') + '\n', { mode: 0o600 })
  }
  return key
}

const signingKey = await loadSigningKey()
const labelPublicKeyMultibase = signingKey.did().replace('did:key:', '')

async function authenticateServiceJwt(req: http.IncomingMessage) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new Error('Authentication required')
  const token = header.slice(7)

  let aud = ''
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { aud?: unknown }
    aud = typeof payload.aud === 'string' ? payload.aud : ''
  } catch {
    throw new Error('Invalid JWT')
  }

  const allowedAudiences = new Set([SERVICE_DID, `${SERVICE_DID}${LABELER_SERVICE}`])
  if (!allowedAudiences.has(aud)) throw new Error('Invalid JWT audience')

  const payload = await verifyJwt(
    token,
    null,
    REPORT_LXM,
    async (iss, forceRefresh) => idResolver.did.resolveAtprotoKey(iss.split('#')[0], forceRefresh),
  )

  if (!allowedAudiences.has(payload.aud)) throw new Error('Invalid JWT audience')
  return payload
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function authorizedApi(req: http.IncomingMessage) {
  return req.headers.authorization === `Bearer ${API_TOKEN}`
}

async function body(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function readReports(status = 'open') {
  const rows = db.prepare(`
    SELECT id, reason_type AS reasonType, reason, subject_json AS subject,
           reported_by AS reportedBy, created_at AS createdAt,
           status, decision, decided_at AS decidedAt
    FROM reports
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(status) as Array<Record<string, unknown>>
  return rows.map((row) => ({ ...row, subject: JSON.parse(String(row.subject)) }))
}

function readLabels(uriPatterns: string[], limit: number) {
  const normalizedLimit = Math.max(1, Math.min(limit || 50, 250))
  const rows: Array<Record<string, unknown>> = []
  if (uriPatterns.length === 0 || uriPatterns.includes('*')) {
    rows.push(...(db.prepare(`
      SELECT src, uri, cid, val, neg, cts, exp, sig
      FROM labels
      ORDER BY id ASC
      LIMIT ?
    `).all(normalizedLimit) as Array<Record<string, unknown>>))
  } else {
    const stmt = db.prepare(`
      SELECT src, uri, cid, val, neg, cts, exp, sig
      FROM labels
      WHERE uri = ? OR (? LIKE '%' AND uri LIKE ?)
      ORDER BY id ASC
      LIMIT ?
    `)
    for (const pattern of uriPatterns.slice(0, 250)) {
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
      rows.push(...(stmt.all(pattern, pattern.endsWith('*') ? 1 : 0, prefix + (pattern.endsWith('*') ? '%' : ''), normalizedLimit) as Array<Record<string, unknown>>))
    }
  }
  return rows.slice(0, normalizedLimit).map((row) => ({
    src: row.src,
    uri: row.uri,
    ...(row.cid ? { cid: row.cid } : {}),
    val: row.val,
    ...(row.neg ? { neg: true } : {}),
    cts: row.cts,
    ...(row.exp ? { exp: row.exp } : {}),
    ...(row.sig ? { sig: Buffer.from(row.sig as Buffer).toString('base64') } : {}),
  }))
}

function labelBytes(label: Record<string, unknown>) {
  return cborEncode(noUndefinedVals({
    ver: 1,
    src: label.src,
    uri: label.uri,
    cid: label.cid,
    val: label.val,
    neg: label.neg === true ? true : undefined,
    cts: label.cts,
    exp: label.exp,
  }))
}

async function createSignedLabel(input: { uri: string; cid?: string; val: string; neg?: boolean; exp?: string }) {
  const label: Record<string, unknown> = noUndefinedVals({
    ver: 1,
    src: SERVICE_DID,
    uri: input.uri,
    cid: input.cid,
    val: input.val,
    neg: input.neg === true ? true : undefined,
    cts: new Date().toISOString(),
    exp: input.exp,
  })
  const sig = await signingKey.sign(labelBytes(label))
  return { ...label, sig }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: SERVICE_DID, labeler: true, labelKey: labelPublicKeyMultibase })
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/did.json') {
      const doc = {
        '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
        id: SERVICE_DID,
        verificationMethod: [{
          id: `${SERVICE_DID}#atproto_label`,
          type: 'Multikey',
          controller: SERVICE_DID,
          publicKeyMultibase: labelPublicKeyMultibase,
        }],
        service: [{
          id: `${SERVICE_DID}${LABELER_SERVICE}`,
          type: LABELER_SERVICE_TYPE,
          serviceEndpoint: `https://${process.env.REPORT_SERVICE_HOST || 'reports.kelosocial.eu'}`,
        }],
      }
      return json(res, 200, doc)
    }

    if (req.method === 'GET' && url.pathname === '/reports') {
      if (!authorizedApi(req)) return json(res, 401, { error: 'Unauthorized' })
      return json(res, 200, { reports: readReports(url.searchParams.get('status') || 'open') })
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/reports/')) {
      if (!authorizedApi(req)) return json(res, 401, { error: 'Unauthorized' })
      const id = Number(url.pathname.split('/').pop())
      const input = await body(req)
      const status = input?.status === 'closed' ? 'closed' : input?.status === 'open' ? 'open' : null
      if (!Number.isInteger(id) || !status) return json(res, 400, { error: 'Invalid report update' })
      db.prepare('UPDATE reports SET status = ?, decision = ?, decided_at = ? WHERE id = ?')
        .run(status, typeof input.decision === 'string' ? input.decision.slice(0, 500) : null, new Date().toISOString(), id)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/xrpc/com.atproto.label.queryLabels') {
      const uriPatterns = url.searchParams.getAll('uriPatterns')
      const limit = Number(url.searchParams.get('limit') || 50)
      return json(res, 200, { labels: readLabels(uriPatterns, limit) })
    }

    if (req.method === 'POST' && url.pathname === '/labels') {
      if (!authorizedApi(req)) return json(res, 401, { error: 'Unauthorized' })
      const input = await body(req)
      if (typeof input?.uri !== 'string' || typeof input?.val !== 'string') {
        return json(res, 400, { error: 'InvalidRequest', message: 'uri and val are required' })
      }
      const label = await createSignedLabel({
        uri: input.uri,
        cid: typeof input.cid === 'string' ? input.cid : undefined,
        val: input.val.slice(0, 128),
        neg: input.neg === true,
        exp: typeof input.exp === 'string' ? input.exp : undefined,
      })
      db.prepare(`
        INSERT INTO labels(src, uri, cid, val, neg, cts, exp, sig, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        label.src, label.uri, label.cid ?? null, label.val, label.neg === true ? 1 : 0,
        label.cts, label.exp ?? null, Buffer.from(label.sig), label.cts,
      )
      return json(res, 200, { label: { ...label, sig: Buffer.from(label.sig).toString('base64') } })
    }

    if (req.method === 'POST' && url.pathname === `/xrpc/${REPORT_LXM}`) {
      const auth = await authenticateServiceJwt(req)
      const input = await body(req)
      const subject = input?.subject
      if (!subject || typeof subject !== 'object' || typeof subject.uri !== 'string') {
        return json(res, 400, { error: 'InvalidRequest', message: 'subject is required' })
      }
      const reasonType = typeof input.reasonType === 'string' ? input.reasonType : 'com.atproto.moderation.defs#reasonOther'
      const reason = typeof input.reason === 'string' ? input.reason.slice(0, 1000) : null
      const createdAt = new Date().toISOString()

      try {
        const result = db.prepare(`
          INSERT INTO reports(reason_type, reason, subject_json, reported_by, created_at, service_jti)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(reasonType, reason, JSON.stringify(subject), auth.iss.split('#')[0], createdAt, auth.jti || null)

        return json(res, 200, {
          id: result.lastInsertRowid,
          reasonType,
          reason,
          subject,
          reportedBy: auth.iss.split('#')[0],
          createdAt,
        })
      } catch (error) {
        if (String(error).includes('UNIQUE')) return json(res, 409, { error: 'Conflict', message: 'Report already received' })
        throw error
      }
    }

    return json(res, 404, { error: 'NotFound' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    const status = message.includes('Authentication') || message.includes('JWT') || message.includes('audience') ? 401 : 500
    return json(res, status, { error: status === 401 ? 'AuthenticationRequired' : 'InternalServerError', message: status === 401 ? message : 'Request failed' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kelo report service listening on :${PORT}`)
})
