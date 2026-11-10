'use client'

import { useState } from 'react'

const SUSPENSION_REASONS = [
  "Spam ou publications répétitives",
  "Harcèlement, intimidation ou menaces",
  "Discours haineux ou discrimination",
  "Contenu violent ou dangereux",
  "Usurpation d’identité ou fraude",
  "Contenu illégal",
  "Manipulation de la plateforme ou faux comptes",
  "Violation répétée des règles de la communauté",
  "Autre motif"
]

export function AccountActions({ did, deactivated, disabled = false }: { did: string; deactivated: boolean; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [reason, setReason] = useState('')

  async function request(path: string, body: unknown) {
    setBusy(true)
    setMessage('')
    setSuccess(false)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Action impossible')
      setSuccess(true)
      setMessage(data?.message || 'Action effectuée.')
      window.setTimeout(() => window.location.reload(), 1800)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action impossible')
      setBusy(false)
    }
  }

  async function suspendAccount() {
    if (!reason) return
    if (!window.confirm(`Confirmer la suspension pour le motif : « ${reason} » ?`)) return
    await request('/api/moderation/account/status', { did, action: 'suspend', reason })
  }

  async function deleteAccount() {
    if (!window.confirm('Supprimer définitivement ce compte du PDS ? Cette action est irréversible.')) return
    await request('/api/moderation/account/delete', { did })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 360 }}>
      {!deactivated && <label style={{ width: '100%', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
        Motif obligatoire de suspension
        <select value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy || disabled} aria-label="Motif de suspension" style={{ display: 'block', width: '100%', marginTop: 5, minHeight: 38, padding: '7px 9px', borderRadius: 8 }}>
          <option value="">Choisir un motif…</option>
          {SUSPENSION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {deactivated
          ? <button className="btn" disabled={busy || disabled} onClick={() => request('/api/moderation/account/status', { did, action: 'reactivate' })}>Réactiver</button>
          : <button className="btn" disabled={busy || disabled || !reason} onClick={suspendAccount}>Suspendre</button>}
        <button className="btn" disabled={busy || disabled} onClick={deleteAccount}>Supprimer</button>
      </div>
      {message && <span role="status" style={{ color: success ? 'var(--ok)' : 'var(--danger)', fontSize: 12, textAlign: 'right' }}>{message}</span>}
    </div>
  )
}
