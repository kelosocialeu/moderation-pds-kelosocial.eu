import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsPublicRequest, pdsRequest } from '@/lib/pds'
import { sendAccountModerationEmail, notificationMessage } from '@/lib/moderation-email'

const SUSPENSION_REASONS = [
  "Spam ou publications répétitives",
  "Harcèlement, intimidation ou menaces",
  "Discours haineux ou discrimination",
  "Contenu violent ou dangereux",
  "Usurpation d’identité ou fraude",
  "Contenu illégal",
  "Manipulation de la plateforme ou faux comptes",
  "Suspicion de bot ou d’automatisation abusive",
  "Violation répétée des règles de la communauté",
  "Autre motif"
]

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
    if (body.action === 'suspend' && (typeof body.reason !== 'string' || !SUSPENSION_REASONS.includes(body.reason))) {
      return NextResponse.json({ error: 'Sélectionnez un motif de suspension valide.' }, { status: 400 })
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

    // Verify the effective status using the public repository status endpoint.
    const verification = await pdsPublicRequest('/xrpc/com.atproto.sync.getRepoStatus?did=' + encodeURIComponent(body.did))
    if (!verification.response.ok || !verification.data || typeof verification.data !== 'object') {
      return NextResponse.json({ error: 'Le PDS a accepté la demande, mais son état de dépôt ne peut pas être vérifié. Actualisez la liste avant toute nouvelle action.' }, { status: 502 })
    }
    const verified = verification.data as { active?: boolean; status?: string }
    const expectedActive = body.action === 'reactivate'
    if (verified.active !== expectedActive) {
      return NextResponse.json({ error: 'Le statut du dépôt renvoyé par le PDS ne correspond pas à l’action demandée. Aucune confirmation ne peut être donnée.' }, { status: 502 })
    }

    if (body.action === 'suspend') {
      const notification = await sendAccountModerationEmail({
        to: accountInfo.email,
        handle: accountInfo.handle,
        did: body.did,
        action: 'suspended',
        reason: body.reason,
      })
      return NextResponse.json({
        success: true,
        action: 'suspended',
        notification,
        message: notification.sent ? 'Compte suspendu et e-mail envoyé avec le motif.' : notificationMessage(notification.reason),
      })
    }

    return NextResponse.json({ success: true, action: 'reactivated', message: 'Compte réactivé.' })
  } catch (error) {
    console.error('[Kelo Moderation] Account status action failed:', error instanceof Error ? error.message : 'unknown error')
    const message = error instanceof Error && error.message.includes('PDS_ADMIN_PASSWORD') ? 'PDS_ADMIN_PASSWORD est absent des variables d’environnement de Vercel.' : 'Impossible de contacter le PDS. Vérifiez PDS_URL et les identifiants administrateur.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
