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
      <p>Accès strictement réservé aux modérateurs autorisés. Entrez votre mot de passe d’administration pour continuer.</p>
      <form onSubmit={submit} autoComplete="off" style={{display:'flex', flexDirection:'column', gap:'14px', marginTop:'24px'}}>
        <label htmlFor="admin-password" style={{fontWeight:700}}>Mot de passe administrateur</label>
        <input
          id="admin-password"
          className="field"
          name="password"
          type="password"
          minLength={12}
          maxLength={256}
          placeholder="Entrez votre mot de passe"
          required
          autoFocus
          style={{display:'block', width:'100%', minHeight:'52px', boxSizing:'border-box', opacity:1, visibility:'visible'}}
        />
        <button className="btn primary" type="submit" disabled={loading} style={{display:'block', width:'100%', minHeight:'48px'}}>
          {loading ? 'Vérification…' : 'Accéder à la modération'}
        </button>
        {error && <div className="error" role="alert">{error}</div>}
      </form>
      <div className="security">Aucun compte public • Sessions protégées • Anti-indexation • HSTS • CSP restrictive</div>
    </section>
  </main>
}
