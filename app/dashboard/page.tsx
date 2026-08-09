import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'

async function getReports() {
  const url = process.env.MODERATION_API_URL
  const token = process.env.MODERATION_API_TOKEN
  if (!url || !token) return [] as Array<{ id: string; reason: string; subject: string; createdAt?: string; severity?: string }>
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/reports?status=open`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data.reports || []
  } catch {
    return []
  }
}

export default async function Dashboard() {
  const store = await cookies()
  const session = store.get(sessionCookie.name)?.value
  if (!isValidSession(session)) redirect('/')
  const reports = await getReports()

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand">Kelo <span>Moderation</span></div>
      <div className="badge">Accès sécurisé</div>
      <nav className="nav">
        <a className="active" href="/dashboard">Vue d’ensemble</a>
        <a href="/dashboard">Signalements</a>
        <a href="/dashboard">Comptes</a>
        <a href="/dashboard">Historique</a>
      </nav>
    </aside>
    <section className="content">
      <div className="top">
        <div>
          <div className="eyebrow">Centre de sûreté Kelo Social</div>
          <h1 className="title">Modérer avec contexte, pas à l’aveugle.</h1>
          <p className="subtitle">Une console pensée pour examiner les signalements, conserver une trace des décisions et agir sans exposer les secrets du PDS au navigateur.</p>
        </div>
        <form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form>
      </div>

      <div className="grid">
        <div className="card"><div className="label">Signalements ouverts</div><div className="metric">{reports.length}</div></div>
        <div className="card"><div className="label">Priorité haute</div><div className="metric">{reports.filter(r => r.severity === 'high').length}</div></div>
        <div className="card"><div className="label">Décisions aujourd’hui</div><div className="metric">—</div></div>
        <div className="card"><div className="label">État du service</div><div className="metric" style={{fontSize:18,color:'var(--ok)'}}>{process.env.MODERATION_API_URL ? 'Connecté' : 'À connecter'}</div></div>
      </div>

      <section className="card queue">
        <div className="eyebrow">File de traitement</div>
        <h2>Signalements à examiner</h2>
        {reports.length === 0 ? <p className="subtitle">Aucun signalement remonté pour le moment. Le tableau est prêt à être relié au service de modération AT Protocol Kelo.</p> : reports.map((r) => <article className="report" key={r.id}>
          <div><div className="reason">{r.reason || 'Signalement'}</div><div className="meta">{r.subject} {r.createdAt ? `• ${r.createdAt}` : ''}</div></div>
          <span className="pill">À examiner</span>
        </article>)}
      </section>
    </section>
  </main>
}
