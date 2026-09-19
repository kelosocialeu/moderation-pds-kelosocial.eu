import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { IdResolver } from '@atproto/identity'
import { verifyJwt } from '@atproto/xrpc-server'

const PORT = Number(process.env.REPORT_SERVICE_PORT || 3100)
const SERVICE_DID = process.env.REPORT_SERVICE_DID || ''
const API_TOKEN = process.env.MODERATION_API_TOKEN || ''
const DB_PATH = process.env.REPORT_DB_PATH || './data/reports.db'
const LXM = 'com.atproto.moderation.createReport'

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
`)

const idResolver = new IdResolver({ timeout: 5000 })

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

  const allowedAudiences = new Set([SERVICE_DID, `${SERVICE_DID}#atproto_labeler`])
  if (!allowedAudiences.has(aud)) throw new Error('Invalid JWT audience')

  const payload = await verifyJwt(
    token,
    null,
    LXM,
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: SERVICE_DID })
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/did.json') {
      const doc = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: SERVICE_DID,
        service: [{
          id: `${SERVICE_DID}#atproto_labeler`,
          type: 'BskyLabeler',
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
      return json(res, 200, { labels: [] })
    }

    if (req.method === 'POST' && url.pathname === `/xrpc/${LXM}`) {
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
