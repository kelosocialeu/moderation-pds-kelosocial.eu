import 'server-only'
import { randomUUID } from 'node:crypto'

type ModerationEmailAction = 'suspended' | 'deleted'

const APPEAL_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf8rLVt0y2Soh_L1NS7voXg0ZUo8o4gaVAVrB-Y-WMa5xoO-g/viewform?usp=publish-editor'

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
    console.error('[Kelo Moderation] Resend is not configured (RESEND_API_KEY).')
    return { sent: false, reason: 'not_configured' }
  }

  const isDeleted = input.action === 'deleted'
  const actionLabel = isDeleted ? 'suppression définitive' : 'suspension'
  const subject = isDeleted
    ? 'Confirmation de suppression de votre compte Kelo Social'
    : 'Notification importante concernant votre compte Kelo Social'
  const safeHandle = input.handle ? `@${escapeHtml(input.handle)}` : ''
  const greeting = safeHandle ? `Bonjour ${safeHandle},` : 'Bonjour,'
  const message = isDeleted
    ? 'Nous vous confirmons que votre compte Kelo Social a été supprimé du serveur. Ce compte ne peut plus être utilisé pour vous connecter.'
    : 'Après examen, l’équipe de modération Kelo a suspendu votre compte. Pendant cette suspension, vous ne pouvez plus utiliser ce compte pour accéder à Kelo Social.'
  const title = isDeleted ? 'Suppression du compte' : 'Votre compte a été suspendu'
  const intro = isDeleted
    ? 'Cette notification confirme la prise en compte de la suppression de votre compte.'
    : 'Nous vous informons d’une décision prise par notre équipe de modération concernant votre compte.'
  const appealSection = !isDeleted ? `
        <tr>
          <td style="padding:0 32px 28px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7ff;border:1px solid #e0e7ff;border-radius:12px">
              <tr><td style="padding:22px">
                <p style="margin:0 0 8px;font-size:16px;line-height:24px;font-weight:700;color:#182033">Vous souhaitez contester cette décision ?</p>
                <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#526078">Vous pouvez transmettre une demande de contestation à notre équipe en remplissant le formulaire dédié. Votre demande pourra être examinée par la modération.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="border-radius:8px;background:#315bdb">
                  <a href="${APPEAL_URL}" target="_blank" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700">Accéder au formulaire de contestation</a>
                </td></tr></table>
                <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#68758c">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${APPEAL_URL}" style="color:#315bdb;word-break:break-all">${APPEAL_URL}</a></p>
              </td></tr>
            </table>
          </td>
        </tr>` : ''
  const support = 'Pour toute autre question, vous pouvez répondre à cet e-mail ou écrire à support@kelosocial.eu.'
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f2f5fb;font-family:Arial,Helvetica,sans-serif;color:#182033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5fb;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e6eaf2;border-radius:16px;overflow:hidden">
        <tr><td style="padding:26px 32px;background:#315bdb;background-image:linear-gradient(110deg,#2563ff,#8055e8)">
          <p style="margin:0;color:#ffffff;font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">KELO MODÉRATION</p>
          <p style="margin:8px 0 0;color:#ffffff;font-size:13px;line-height:20px;opacity:.92">Information relative à votre compte Kelo Social</p>
        </td></tr>
        <tr><td style="padding:32px 32px 18px">
          <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#27334a">${greeting}</p>
          <h1 style="margin:0 0 12px;font-size:25px;line-height:32px;color:#17213a">${title}</h1>
          <p style="margin:0 0 12px;font-size:14px;line-height:23px;color:#526078">${intro}</p>
          <p style="margin:0;font-size:14px;line-height:23px;color:#27334a">${message}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 26px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8f9fc;border:1px solid #e9edf4;border-radius:10px">
            <tr><td style="padding:16px 18px">
              <p style="margin:0 0 6px;font-size:11px;line-height:16px;color:#77839a;font-weight:700;letter-spacing:.7px;text-transform:uppercase">Identifiant du compte</p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#344158;word-break:break-all">${escapeHtml(input.did)}</p>
            </td></tr>
          </table>
        </td></tr>
        ${appealSection}
        <tr><td style="padding:0 32px 28px">
          <p style="margin:0;font-size:13px;line-height:21px;color:#526078">${support}</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8f9fc;border-top:1px solid #e9edf4">
          <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:#66738a">Message automatique envoyé par Kelo Modération.</p>
          <p style="margin:0;font-size:12px;line-height:18px;color:#8993a5">Kelo Social · <a href="https://kelosocial.eu" style="color:#315bdb;text-decoration:none">kelosocial.eu</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  const text = [
    'KELO MODÉRATION — Information relative à votre compte Kelo Social',
    '',
    greeting,
    '',
    title,
    intro,
    message,
    '',
    `Identifiant du compte : ${input.did}`,
    ...(!isDeleted ? ['', 'Vous souhaitez contester cette décision ?', 'Vous pouvez transmettre une demande de contestation via ce formulaire :', APPEAL_URL] : []),
    '',
    support,
    '',
    'Message automatique envoyé par Kelo Modération.',
    'Kelo Social — https://kelosocial.eu',
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
