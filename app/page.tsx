'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') || '')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'same-origin',
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) return setError(data.error || 'Accès refusé.')
    router.replace('/dashboard')
    router.refresh()
  }

  return <main className="loginWrap">
    <section className="login" aria-labelledby="login-title">
      <div className="brand">Kelo <span>Moderation</span></div>
      <div className="badge">Console privée</div>
      <h1 id="login-title">Zone de confiance Kelo</h1>
      <p>Accès strictement réservé aux modérateurs autorisés. Les sessions sont limitées, signées côté serveur et protégées par cookie HttpOnly.</p>
      <form onSubmit={submit} autoComplete="off">
        <input className="field" name="password" type="password" minLength={12} maxLength={256} placeholder="Mot de passe d’administration" required autoFocus />
        <button className="btn primary" disabled={loading}>{loading ? 'Vérification…' : 'Accéder à la modération'}</button>
        {error && <div className="error" role="alert">{error}</div>}
      </form>
      <div className="security">Aucun compte public • Aucun secret exposé au navigateur • Anti-indexation • HSTS • CSP restrictive • Sessions HttpOnly/SameSite Strict</div>
    </section>
  </main>
}
