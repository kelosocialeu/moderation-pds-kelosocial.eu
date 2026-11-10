export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; logout?: string }> }) {
  const params = await searchParams
  const error = params.error === 'invalid'
    ? 'Identifiant ou mot de passe incorrect.'
    : params.error === 'rate'
      ? 'Trop de tentatives. Réessayez dans 15 minutes.'
      : params.error === 'denied'
        ? 'Ce compte n’est pas autorisé ou son identité AT Protocol ne correspond pas au PDS Kelo.'
        : params.error === 'factor'
          ? 'Un code de vérification a été envoyé par e-mail. Saisissez-le ci-dessous.'
          : params.error === 'factor-invalid'
            ? 'Le code de vérification est incorrect ou expiré.'
            : params.error === 'unavailable'
              ? 'Le service de connexion AT Protocol est temporairement indisponible.'
              : ''
  const loggedOut = params.logout === 'success'
  const factorRequired = params.error === 'factor' || params.error === 'factor-invalid'

  return <main className="loginWrap">
    <section className="login" aria-labelledby="login-title">
      <div className="brand">Kelo <span>Moderation</span></div>
      <div className="badge">Console privée</div>
      <h1 id="login-title">Zone de confiance Kelo</h1>
      <p>Connectez-vous avec votre compte AT Protocol Kelo Social. Seuls les handles <strong>kelosocial.eu</strong> et <strong>moderation.kelosocial.eu</strong> sont autorisés.</p>
      {loggedOut && <div role="status" aria-live="polite" style={{ marginTop: '18px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)', color: '#15803d', fontWeight: 700 }}>Vous avez été déconnecté avec succès.</div>}
      {error && <div className={factorRequired ? 'notice' : 'error'} role={factorRequired ? 'status' : 'alert'} style={{ marginTop: '18px' }}>{error}</div>}
      <form action="/api/auth/login" method="post" autoComplete="on" style={{display:'flex', flexDirection:'column', gap:'14px', marginTop:'24px'}}>
        <label htmlFor="identifier" style={{fontWeight:700}}>Handle AT Protocol</label>
        <input
          id="identifier"
          className="field"
          name="identifier"
          type="text"
          maxLength={253}
          placeholder="kelosocial.eu ou moderation.kelosocial.eu"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{display:'block', width:'100%', minHeight:'52px', boxSizing:'border-box', opacity:1, visibility:'visible'}}
        />
        <label htmlFor="password" style={{fontWeight:700}}>Mot de passe Kelo Social</label>
        <input
          id="password"
          className="field"
          name="password"
          type="password"
          maxLength={256}
          placeholder="Mot de passe de votre compte"
          required
          autoComplete="current-password"
          style={{display:'block', width:'100%', minHeight:'52px', boxSizing:'border-box', opacity:1, visibility:'visible'}}
        />
        <label htmlFor="authFactorToken" style={{fontWeight:700}}>Code reçu par e-mail (si demandé)</label>
        <input
          id="authFactorToken"
          className="field"
          name="authFactorToken"
          type="text"
          inputMode="numeric"
          maxLength={256}
          placeholder="Code de vérification"
          autoComplete="one-time-code"
          style={{display:'block', width:'100%', minHeight:'52px', boxSizing:'border-box', opacity:1, visibility:'visible'}}
        />
        <button className="btn primary" type="submit" style={{display:'block', width:'100%', minHeight:'48px'}}>
          Se connecter avec AT Protocol
        </button>
      </form>
      <div className="security">Authentification par le PDS Kelo • Deux comptes autorisés • Session HttpOnly • Anti-indexation • HSTS • CSP restrictive</div>
    </section>
  </main>
}
