export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const error = params.error === 'invalid' ? 'Mot de passe incorrect.' : params.error === 'rate' ? 'Trop de tentatives. Réessayez plus tard.' : ''

  return <main className="loginWrap">
    <section className="login" aria-labelledby="login-title">
      <div className="brand">Kelo <span>Moderation</span></div>
      <div className="badge">Console privée</div>
      <h1 id="login-title">Zone de confiance Kelo</h1>
      <p>Accès strictement réservé aux modérateurs autorisés. Entrez votre mot de passe d’administration pour continuer.</p>
      <form action="/api/auth/login" method="post" autoComplete="off" style={{display:'flex', flexDirection:'column', gap:'14px', marginTop:'24px'}}>
        <label htmlFor="admin-password" style={{fontWeight:700}}>Mot de passe administrateur</label>
        <input
          id="admin-password"
          className="field"
          name="password"
          type="password"
          maxLength={256}
          placeholder="Entrez votre mot de passe"
          required
          autoFocus
          style={{display:'block', width:'100%', minHeight:'52px', boxSizing:'border-box', opacity:1, visibility:'visible'}}
        />
        <button className="btn primary" type="submit" style={{display:'block', width:'100%', minHeight:'48px'}}>
          Accéder à la modération
        </button>
        {error && <div className="error" role="alert">{error}</div>}
      </form>
      <div className="security">Aucun compte public • Sessions protégées • Anti-indexation • HSTS • CSP restrictive</div>
    </section>
  </main>
}
