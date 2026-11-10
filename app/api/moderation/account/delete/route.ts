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

    // Capture the address before deleting the account: it may no longer be available afterward.
    let accountInfo: { handle?: string; email?: string } = {}
    try {
      const info = await pdsRequest('/xrpc/com.atproto.admin.getAccountInfo?did=' + encodeURIComponent(body.did))
      if (!info.response.ok || !info.data || typeof info.data !== 'object') {
        console.error('[Kelo Moderation] getAccountInfo failed before deletion:', info.response.status, info.data)
        const error = info.response.status === 401 ? 'Authentification administrateur refusée par le PDS. Vérifiez PDS_ADMIN_PASSWORD dans Vercel. Suppression annulée.' : info.response.status === 403 ? 'Le compte administrateur n’a pas les droits requis sur le PDS. Suppression annulée.' : 'Impossible de vérifier le compte et son adresse e-mail auprès du PDS. Suppression annulée.'
        return NextResponse.json({ error }, { status: 502 })
      }
      accountInfo = info.data as { handle?: string; email?: string }
    } catch (error) {
      console.error('[Kelo Moderation] Unable to retrieve account contact before deletion:', error instanceof Error ? error.message : 'unknown error')
      const message = error instanceof Error && error.message.includes('PDS_ADMIN_PASSWORD') ? 'PDS_ADMIN_PASSWORD est absent des variables d’environnement de Vercel. Suppression annulée.' : 'Impossible de joindre le PDS pour vérifier le compte. Suppression annulée.'
      return NextResponse.json({ error: message }, { status: 503 })
    }

    // Deletion is irreversible: do not proceed when the notification cannot even be configured.
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Suppression annulée : RESEND_API_KEY doit être configurée pour pouvoir envoyer la notification.' }, { status: 503 })
    }
    if (!accountInfo.email?.trim()) {
      return NextResponse.json({ error: 'Suppression annulée : aucune adresse e-mail n’est enregistrée pour ce compte.' }, { status: 409 })
    }

    const result = await pdsRequest('/xrpc/com.atproto.admin.deleteAccount', { did: body.did })
    if (!result.response.ok) {
      const error = result.response.status === 401 ? 'Authentification administrateur refusée par le PDS. Vérifiez PDS_ADMIN_PASSWORD dans Vercel.' : result.response.status === 403 ? 'Le compte administrateur n’a pas les droits requis sur le PDS.' : 'Le PDS a refusé la suppression du compte.'
      return NextResponse.json({ error, details: result.data }, { status: result.response.status })
    }

    const notification = await sendAccountModerationEmail({
      to: accountInfo.email,
      handle: accountInfo.handle,
      did: body.did,
      action: 'deleted',
    })
    return NextResponse.json({
      success: true,
      action: 'deleted',
      notification,
      message: notification.sent ? 'Compte supprimé et e-mail de confirmation envoyé.' : notificationMessage(notification.reason),
    })
  } catch (error) {
    console.error('[Kelo Moderation] Account deletion failed:', error instanceof Error ? error.message : 'unknown error')
    const message = error instanceof Error && error.message.includes('PDS_ADMIN_PASSWORD') ? 'PDS_ADMIN_PASSWORD est absent des variables d’environnement de Vercel.' : 'Impossible de contacter le PDS. Vérifiez PDS_URL et les identifiants administrateur.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
