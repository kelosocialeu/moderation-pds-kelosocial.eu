import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsRequest } from '@/lib/pds'

export async function POST(request: Request) {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (typeof body?.did !== 'string' || !/^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(body.did)) {
      return NextResponse.json({ error: 'A valid DID is required' }, { status: 400 })
    }
    if (body.action !== 'suspend' && body.action !== 'reactivate') {
      return NextResponse.json({ error: 'Unsupported account action' }, { status: 400 })
    }

    const result = await pdsRequest('/xrpc/com.atproto.admin.updateSubjectStatus', {
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: body.did },
      deactivated: { applied: body.action === 'suspend' },
    })
    return NextResponse.json(result.data, { status: result.response.status })
  } catch {
    return NextResponse.json({ error: 'Unable to contact the PDS. Check the server-side PDS credentials.' }, { status: 503 })
  }
}
