'use client'

import { useState } from 'react'

export function ReportActions({ id, status }: { id: string; status?: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function update(next: 'open' | 'closed') {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, decision: next === 'closed' ? 'Traité par la modération' : 'Rouverte' }),
      })
      if (!response.ok) throw new Error('update failed')
      window.location.reload()
    } catch {
      setMessage('Impossible de mettre à jour le signalement.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      <span className="pill">{status === 'closed' ? 'Traité' : 'À examiner'}</span>
      {status === 'closed'
        ? <button className="btn" disabled={busy} onClick={() => update('open')}>Rouvrir</button>
        : <button className="btn primary" disabled={busy} onClick={() => update('closed')}>Marquer traité</button>}
      {message && <span className="error">{message}</span>}
    </div>
  )
}
