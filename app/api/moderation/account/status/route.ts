import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsRequest } from '@/lib/pds'
import { sendAccountModerationEmail, notificationMessage } from '@/lib/moderation-email'

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

    let accountInfo: { handle?: string; email?: string } = {}
    if (body.action === 'suspend') {
      try {
        const info = await pdsRequest('/xrpc/com.atproto.admin.getAccountInfo?did=' + encodeURIComponent(body.did))
        if (info.response.ok && info.data && typeof info.data === 'object') {
          accountInfo = info.data as { handle?: string; email?: string }
        }
      } catch (error) {
        console.error('[Kelo Moderation] Unable to retrieve account contact before suspension:', error instanceof Error ? error.message : 'unknown error')
      }
    }

    const result = await pdsRequest('/xrpc/com.atproto.admin.updateSubjectStatus', {
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: body.did },
      deactivated: { applied: body.action === 'suspend' },
    })
    if (!result.response.ok) {
      return NextResponse.json({ error: 'Le PDS a refusé cette opération.', details: result.data }, { status: result.response.status })
    }

    if (body.action === 'suspend') {
      const notification = await sendAccountModerationEmail({
        to: accountInfo.email,
        handle: accountInfo.handle,
        did: body.did,
        action: 'suspended',
      })
      return NextResponse.json({
        success: true,
        action: 'suspended',
        notification,
        message: notification.sent ? 'Compte suspendu et e-mail envoyé.' : notificationMessage(notification.reason),
      })
    }

    return NextResponse.json({ success: true, action: 'reactivated', message: 'Compte réactivé.' })
  } catch (error) {
    console.error('[Kelo Moderation] Account status action failed:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'Impossible de contacter le PDS. Vérifiez les identifiants serveur.' }, { status: 503 })
  }
}
