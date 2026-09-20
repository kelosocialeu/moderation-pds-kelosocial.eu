import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { ReportActions } from './ReportActions'
import { ContentActions } from './ContentActions'

type Report = { id: string; reason?: string; reasonType?: string; subject?: { uri?: string; cid?: string; did?: string }; createdAt?: string; reportedBy?: string; status?: string }

async function getReports(status = 'open'): Promise<Report[]> {
  const url = process.env.MODERATION_API_URL
  const token = process.env.MODERATION_API_TOKEN
  if (!url || !token) return []
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/reports?status=${encodeURIComponent(status)}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!res.ok) return []
    const data: unknown = await res.json()
    if (Array.isArray(data)) return data as Report[]
    if (typeof data === 'object' && data !== null && 'reports' in data && Array.isArray((data as { reports?: unknown }).reports)) return (data as { reports: Report[] }).reports
  } catch {}
  return []
}

export default async function ReportsPage() {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const reports = await getReports()

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">Kelo <span>Moderation</span></div>
        <div className="badge">Accès sécurisé</div>
        <nav className="nav">
          <a href="/dashboard">Vue d’ensemble</a>
          <a className="active" href="/dashboard/reports">Signalements</a>
          <a href="/dashboard/accounts">Comptes</a>
          <a href="/dashboard/history">Historique</a>
        </nav>
      </aside>
      <section className="content">
        <div className="top">
          <div><div className="eyebrow">Kelo Social • Modération</div><h1 className="title">Signalements</h1><p className="subtitle">File des signalements reçus directement par l’infrastructure de modération Kelo.</p></div>
          <form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form>
        </div>
        <section className="card queue">
          <div className="eyebrow">File ouverte</div><h2>{reports.length} signalement{reports.length > 1 ? 's' : ''}</h2>
          {reports.length === 0 ? <p className="subtitle">Aucun signalement ouvert ou service de modération non configuré.</p> : reports.map((r) => (
            <article className="report" key={r.id}>
              <div>
                <div className="reason">{r.reason || r.reasonType || 'Signalement'}</div>
                <div className="meta">{r.subject?.uri || r.subject?.did || 'Sujet inconnu'} {r.createdAt ? `• ${new Date(r.createdAt).toLocaleString('fr-BE')}` : ''}</div>
                {r.reportedBy && <div className="meta">Signalé par : {r.reportedBy}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}><ReportActions id={String(r.id)} status={r.status} /><ContentActions uri={r.subject?.uri} did={r.subject?.did} /></div>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
