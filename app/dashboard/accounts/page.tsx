import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsRequest } from '@/lib/pds'
import { AccountActions } from './AccountActions'

type Account = { did: string; handle?: string; email?: string; indexedAt?: string; deactivated: boolean; takedown: boolean }

async function getAccounts(): Promise<Account[]> {
  try {
    const repos = await pdsRequest('/xrpc/com.atproto.sync.listRepos?limit=100')
    if (!repos.response.ok || !repos.data || typeof repos.data !== 'object' || !('repos' in repos.data)) return []
    const list = (repos.data as { repos?: Array<{ did?: string }> }).repos ?? []
    const dids = list.map((r) => r.did).filter((did): did is string => Boolean(did))
    const accounts: Account[] = []
    for (let i = 0; i < dids.length; i += 5) {
      const batch = await Promise.all(dids.slice(i, i + 5).map(async (did): Promise<Account | null> => {
        try {
          const [info, status] = await Promise.all([
            pdsRequest(`/xrpc/com.atproto.admin.getAccountInfo?did=${encodeURIComponent(did)}`),
            pdsRequest(`/xrpc/com.atproto.admin.getSubjectStatus?did=${encodeURIComponent(did)}`),
          ])
          if (!info.response.ok || !info.data || typeof info.data !== 'object') return null
          const account = info.data as { did?: string; handle?: string; email?: string; indexedAt?: string }
          const state = status.data && typeof status.data === 'object' ? status.data as { deactivated?: { applied?: boolean }; takedown?: { applied?: boolean } } : {}
          if (!account.did) return null
          return { did: account.did, handle: account.handle, email: account.email, indexedAt: account.indexedAt, deactivated: Boolean(state.deactivated?.applied), takedown: Boolean(state.takedown?.applied) }
        } catch { return null }
      }))
      accounts.push(...batch.filter((item): item is Account => item !== null))
    }
    return accounts
  } catch { return [] }
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const params = await searchParams
  const query = (params.q || '').trim().toLowerCase()
  const allAccounts = await getAccounts()
  const accounts = query ? allAccounts.filter((a) => a.did.toLowerCase().includes(query) || (a.handle || '').toLowerCase().includes(query)) : allAccounts

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">Kelo <span>Moderation</span></div>
        <div className="badge">Accès sécurisé • PDS connecté</div>
        <nav className="nav">
          <a href="/dashboard">Vue d’ensemble</a><a href="/dashboard/reports">Signalements</a><a className="active" href="/dashboard/accounts">Comptes</a><a href="/dashboard/history">Historique</a>
        </nav>
      </aside>
      <section className="content">
        <div className="top"><div><div className="eyebrow">Kelo Social • Modération</div><h1 className="title">Comptes</h1><p className="subtitle">Comptes du PDS Kelo Social, états administratifs et actions de modération.</p></div><form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form></div>
        <section className="card queue">
          <div className="eyebrow">PDS • did:web:pds.kelosocial.eu</div><h2>{accounts.length} compte{accounts.length > 1 ? 's' : ''}{query ? ' trouvé(s)' : ' affiché(s)'}</h2>
          <form className="searchForm" action="/dashboard/accounts" method="get"><input name="q" type="search" defaultValue={params.q || ''} placeholder="Rechercher un handle ou un DID…" aria-label="Rechercher un compte"/><button className="btn primary" type="submit">Rechercher</button>{query && <a className="btn" href="/dashboard/accounts">Effacer</a>}</form>
          {accounts.length === 0 ? <p className="subtitle">Aucun compte trouvé, ou le PDS n’a pas répondu. Vérifiez la connexion et les droits administrateur.</p> : accounts.map((account) => (
            <article className="report" key={account.did}>
              <div><div className="reason">{account.handle ? `@${account.handle}` : 'Compte sans handle'}</div><div className="meta">{account.did}</div>{account.email && <div className="meta">Adresse du compte : {account.email}</div>}{account.indexedAt && <div className="meta">Indexé : {new Date(account.indexedAt).toLocaleString('fr-BE')}</div>}</div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}><span className="pill" style={{background:account.takedown?'rgba(251,113,133,.12)':account.deactivated?'rgba(245,158,11,.12)':'rgba(52,211,153,.12)',color:account.takedown?'var(--danger)':account.deactivated?'#b7791f':'var(--ok)'}}>{account.takedown?'Retrait appliqué':account.deactivated?'Désactivé':'Actif'}</span><AccountActions did={account.did} deactivated={account.deactivated}/></div>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
