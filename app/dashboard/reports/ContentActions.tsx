'use client'

import { useState } from 'react'

export function ContentActions({ uri, did }: { uri?: string; did?: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function act(path: string, body: unknown, confirmation: string) {
    if (!window.confirm(confirmation)) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Action impossible')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action impossible')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {uri && <button className="btn" disabled={busy} onClick={() => act('/api/moderation/content/status', { uri, action: 'takedown' }, 'Retirer ce contenu du PDS ?')}>Retirer le contenu</button>}
        {did && <button className="btn" disabled={busy} onClick={() => act('/api/moderation/account/status', { did, action: 'suspend' }, 'Suspendre le compte signalé ?')}>Suspendre le compte</button>}
      </div>
      {message && <span className="error">{message}</span>}
    </div>
  )
}
