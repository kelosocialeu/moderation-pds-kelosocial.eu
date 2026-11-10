import 'server-only'

const PDS_URL = process.env.PDS_URL
const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD

function parseResponse(text: string) {
  try {
    return text ? JSON.parse(text) as unknown : null
  } catch {
    return { error: text }
  }
}

export async function pdsPublicRequest(path: string) {
  if (!PDS_URL) throw new Error('PDS_URL is missing')
  const response = await fetch(`${PDS_URL.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  const data = parseResponse(await response.text())
  return { response, data }
}

export async function pdsRequest(path: string, body?: unknown) {
  if (!PDS_URL || !PDS_ADMIN_PASSWORD) {
    throw new Error('PDS_URL or PDS_ADMIN_PASSWORD is missing')
  }
  const response = await fetch(`${PDS_URL.replace(/\/$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`admin:${PDS_ADMIN_PASSWORD}`).toString('base64')}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  const data = parseResponse(await response.text())
  return { response, data }
}
