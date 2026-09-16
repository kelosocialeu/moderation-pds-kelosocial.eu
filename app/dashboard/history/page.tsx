import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'

type Entry = { id: string; reason?: string; subject?: string; createdAt?: string; status?: string; action?: string }

async function getHistory(): Promise<Entry[]> {
  const url = process.env.MODERATION_API_URL
  const token = process.env.MODERATION_API_TOKEN
  if (!url || !token) return []
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/reports?status=closed`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!res.ok) return []
    const data: unknown = await res.json()
    if (Array.isArray(data)) return data as Entry[]
    if (typeof data === 'object' && data !== null && 'reports' in data && Array.isArray((data as { reports?: unknown }).reports)) return (data as { reports: Entry[] }).reports
  } catch {}
  return []
}

export default async function HistoryPage() {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const history = await getHistory()

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">Kelo <span>Moderation</span></div>
        <div className="badge">Accès sécurisé</div>
        <nav className="nav">
          <a href="/dashboard">Vue d’ensemble</a>
          <a href="/dashboard/reports">Signalements</a>
          <a href="/dashboard/accounts">Comptes</a>
          <a className="active" href="/dashboard/history">Historique</a>
        </nav>
      </aside>
      <section className="content">
        <div className="top">
          <div><div className="eyebrow">Kelo Social • Modération</div><h1 className="title">Historique</h1><p className="subtitle">Trace des signalements traités et des décisions de modération.</p></div>
          <form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form>
        </div>
        <section className="card queue">
          <div className="eyebrow">Journal</div><h2>{history.length} élément{history.length > 1 ? 's' : ''}</h2>
          {history.length === 0 ? <p className="subtitle">Aucun élément d’historique récupéré pour le moment. La page est prête à recevoir le journal de modération.</p> : history.map((entry) => (
            <article className="report" key={entry.id}>
              <div><div className="reason">{entry.action || entry.reason || 'Décision de modération'}</div><div className="meta">{entry.subject || 'Sujet inconnu'} {entry.createdAt ? `• ${entry.createdAt}` : ''}</div></div>
              <span className="pill">{entry.status || 'Traité'}</span>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
