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
    if (typeof body?.uri !== 'string' || !body.uri.startsWith('at://')) {
      return NextResponse.json({ error: 'A valid AT URI is required' }, { status: 400 })
    }
    if (typeof body?.cid !== 'string' || !body.cid.startsWith('b')) {
      return NextResponse.json({ error: 'A valid record CID is required to apply a takedown.' }, { status: 400 })
    }
    if (body.action !== 'takedown' && body.action !== 'restore') {
      return NextResponse.json({ error: 'Unsupported content action' }, { status: 400 })
    }

    const result = await pdsRequest('/xrpc/com.atproto.admin.updateSubjectStatus', {
      subject: { $type: 'com.atproto.repo.strongRef', uri: body.uri, cid: body.cid },
      takedown: { applied: body.action === 'takedown' },
    })
    return NextResponse.json(result.data, { status: result.response.status })
  } catch {
    return NextResponse.json({ error: 'Unable to contact the PDS. Check the server-side PDS credentials.' }, { status: 503 })
  }
}
