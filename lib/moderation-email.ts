import 'server-only'
import { randomUUID } from 'node:crypto'

type ModerationEmailAction = 'suspended' | 'deleted'

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (character) => entities[character] || character)
}

export async function sendAccountModerationEmail(input: {
  to?: string
  handle?: string
  did: string
  action: ModerationEmailAction
}): Promise<{ sent: boolean; reason?: 'missing_recipient' | 'not_configured' | 'provider_error' }> {
  const to = input.to?.trim()
  if (!to) return { sent: false, reason: 'missing_recipient' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'Kelo Social <support@kelosocial.eu>'
  const replyTo = process.env.RESEND_REPLY_TO || 'support@kelosocial.eu'

  if (!apiKey) {
    console.error('[Kelo Moderation] Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).')
    return { sent: false, reason: 'not_configured' }
  }

  const isDeleted = input.action === 'deleted'
  const actionLabel = isDeleted ? 'suppression définitive' : 'suspension'
  const subject = isDeleted
    ? 'Confirmation de suppression de votre compte Kelo Social'
    : 'Notification de suspension de votre compte Kelo Social'
  const greeting = input.handle ? `Bonjour @${escapeHtml(input.handle)},` : 'Bonjour,'
  const message = isDeleted
    ? 'Votre compte Kelo Social a été supprimé du serveur. Vous ne pourrez plus utiliser ce compte pour vous connecter.'
    : 'Votre compte Kelo Social a été suspendu par l’équipe de modération. Vous ne pouvez temporairement plus utiliser ce compte pour vous connecter.'
  const support = 'Pour toute question concernant cette décision, vous pouvez contacter notre équipe à support@kelosocial.eu.'
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:32px;background:#f4f6fb;font-family:Arial,sans-serif;color:#182033"><div style="max-width:600px;margin:auto;padding:32px;background:#fff;border-radius:16px"><h1 style="margin-top:0;color:#315bdb">Kelo Social</h1><p>${greeting}</p><p>${message}</p><p>${support}</p><p style="font-size:12px;color:#687386">Identifiant du compte : ${escapeHtml(input.did)}</p><hr style="border:0;border-top:1px solid #e5e9f2"><p style="font-size:12px;color:#687386">Cet e-mail est une notification automatique liée à une action de ${actionLabel}.</p></div></body></html>`
  const text = [
    greeting.replace(/<[^>]*>/g, ''),
    '',
    message,
    support,
    '',
    `Identifiant du compte : ${input.did}`,
    '',
    `Notification automatique liée à une action de ${actionLabel}.`,
  ].join('\n')

  const idempotencyKey = randomUUID()
  const payload = JSON.stringify({
    from,
    to: [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  })

  // Retry transient Resend failures with one idempotency key to avoid duplicate messages.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: payload,
        cache: 'no-store',
      })
      if (response.ok) return { sent: true }
      const providerMessage = await response.text().catch(() => '')
      console.error('[Kelo Moderation] Resend rejected an account notification:', response.status, providerMessage.slice(0, 500))
      if (response.status < 500 && response.status !== 429) {
        return { sent: false, reason: 'provider_error' }
      }
    } catch (error) {
      console.error('[Kelo Moderation] Resend request failed:', error instanceof Error ? error.message : 'unknown error')
    }

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
  }
  return { sent: false, reason: 'provider_error' }
}

export function notificationMessage(reason?: string) {
  switch (reason) {
    case 'missing_recipient': return "action effectuée, mais aucune adresse e-mail n'est enregistrée pour ce compte."
    case 'not_configured': return "action effectuée, mais Resend n'est pas configuré sur Vercel."
    case 'provider_error': return "action effectuée, mais Resend n'a pas pu envoyer l'e-mail."
    default: return "action effectuée, mais l'e-mail n'a pas été envoyé."
  }
}
