import 'server-only'

const PDS_URL = process.env.PDS_URL
const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD

function authHeader() {
  if (!PDS_URL || !PDS_ADMIN_PASSWORD) {
    throw new Error('PDS_URL or PDS_ADMIN_PASSWORD is missing')
  }
  return `Basic ${Buffer.from(`admin:${PDS_ADMIN_PASSWORD}`).toString('base64')}`
}

export async function pdsRequest(path: string, body?: unknown) {
  const response = await fetch(`${PDS_URL!.replace(/\/$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: authHeader(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  })

  const text = await response.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = { error: text } }
  return { response, data }
}
