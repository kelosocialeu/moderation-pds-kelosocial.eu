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
    if (typeof body?.did !== 'string' || !body.did.startsWith('did:')) {
      return NextResponse.json({ error: 'A valid DID is required' }, { status: 400 })
    }

    const response = await pdsRequest('/xrpc/com.atproto.admin.updateSubjectStatus', {
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: body.did },
      deactivated: { applied: body.action === 'suspend' },
    })

    return NextResponse.json(response.data, { status: response.response.status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 500 })
  }
}
