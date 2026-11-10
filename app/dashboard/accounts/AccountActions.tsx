'use client'

import { useState } from 'react'

export function AccountActions({ did, deactivated }: { did: string; deactivated: boolean }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

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

  async function deleteAccount() {
    if (!window.confirm('Supprimer définitivement ce compte du PDS ? Cette action est irréversible.')) return
    await request('/api/moderation/account/delete', { did })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 360 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {deactivated
          ? <button className="btn" disabled={busy} onClick={() => request('/api/moderation/account/status', { did, action: 'reactivate' })}>Réactiver</button>
          : <button className="btn" disabled={busy} onClick={() => request('/api/moderation/account/status', { did, action: 'suspend' })}>Suspendre</button>}
        <button className="btn" disabled={busy} onClick={deleteAccount}>Supprimer</button>
      </div>
      {message && <span role="status" style={{ color: success ? 'var(--ok)' : 'var(--danger)', fontSize: 12, textAlign: 'right' }}>{message}</span>}
    </div>
  )
}
