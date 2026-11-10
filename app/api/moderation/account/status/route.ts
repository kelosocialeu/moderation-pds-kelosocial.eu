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
      console.error('[Kelo Moderation] updateSubjectStatus rejected:', result.response.status, result.data)
      const error = result.response.status === 401 ? 'Authentification administrateur refusée par le PDS. Vérifiez PDS_ADMIN_PASSWORD dans Vercel.' : result.response.status === 403 ? 'Le PDS refuse les droits administrateur/modérateur à ce compte.' : 'Le PDS a refusé cette opération.'
      return NextResponse.json({ error, details: result.data }, { status: result.response.status })
    }

    // Verify the effective status on the PDS instead of trusting only the write response.
    const verification = await pdsRequest('/xrpc/com.atproto.admin.getSubjectStatus?did=' + encodeURIComponent(body.did))
    if (!verification.response.ok || !verification.data || typeof verification.data !== 'object') {
      const error = verification.response.status === 401 ? 'Le PDS refuse l’authentification administrateur lors de la vérification. Vérifiez PDS_ADMIN_PASSWORD dans Vercel.' : verification.response.status === 403 ? 'Le compte administrateur ne peut pas lire le statut de ce compte.' : 'Le PDS a accepté la demande, mais son statut ne peut pas être vérifié. Actualisez la liste avant toute nouvelle action.'
      return NextResponse.json({ error }, { status: 502 })
    }
    const verified = verification.data as { deactivated?: { applied?: boolean } }
    const expectedDeactivated = body.action === 'suspend'
    if (verified.deactivated?.applied !== expectedDeactivated) {
      return NextResponse.json({ error: 'Le statut renvoyé par le PDS ne correspond pas à l’action demandée. Aucune confirmation ne peut être donnée.' }, { status: 502 })
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
