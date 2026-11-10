import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsRequest } from '@/lib/pds'
import { AccountActions } from './AccountActions'

type Account = { did: string; handle?: string; email?: string; indexedAt?: string; deactivated: boolean; takedown: boolean }

async function getAccounts(): Promise<Account[]> {
  try {
    const collected: Array<{ did: string; handle?: string; email?: string; indexedAt?: string; deactivatedAt?: string }> = []
    let cursor: string | undefined
    let pages = 0

    // Use the administrative account index, not listRepos: it includes accounts
    // that are deactivated and supports cursor pagination.
    do {
      const query = new URLSearchParams({ email: '', limit: '100' })
      if (cursor) query.set('cursor', cursor)
      const result = await pdsRequest(`/xrpc/com.atproto.admin.searchAccounts?${query.toString()}`)
      if (!result.response.ok || !result.data || typeof result.data !== 'object') {
        throw new Error('PDS account search failed')
      }
      const payload = result.data as { accounts?: Array<{ did?: string; handle?: string; email?: string; indexedAt?: string; deactivatedAt?: string }>; cursor?: string }
      if (!Array.isArray(payload.accounts)) throw new Error('Réponse searchAccounts invalide')
      const batch = payload.accounts
      collected.push(...batch.filter((account): account is typeof account & { did: string } => typeof account.did === 'string'))
      const nextCursor = payload.cursor
      pages += 1
      if (nextCursor && nextCursor === cursor) throw new Error('Pagination du PDS bloquée')
      cursor = nextCursor
    } while (cursor && pages < 100)

    const accounts: Account[] = []
    for (let i = 0; i < collected.length; i += 10) {
      const batch = await Promise.all(collected.slice(i, i + 10).map(async (account): Promise<Account> => {
        try {
          const status = await pdsRequest(`/xrpc/com.atproto.admin.getSubjectStatus?did=${encodeURIComponent(account.did)}`)
          const state = status.data && typeof status.data === 'object'
            ? status.data as { deactivated?: { applied?: boolean }; takedown?: { applied?: boolean } }
            : {}
          return {
            did: account.did,
            handle: account.handle,
            email: account.email,
            indexedAt: account.indexedAt,
            deactivated: Boolean(account.deactivatedAt) || Boolean(state.deactivated?.applied),
            takedown: Boolean(state.takedown?.applied),
          }
        } catch {
          return {
            did: account.did,
            handle: account.handle,
            email: account.email,
            indexedAt: account.indexedAt,
            deactivated: Boolean(account.deactivatedAt),
            takedown: false,
          }
        }
      }))
      accounts.push(...batch)
    }
    return accounts
  } catch (error) {
    console.error('[Kelo Moderation] Chargement des comptes PDS impossible:', error)
    return []
  }
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const params = await searchParams
  const query = (params.q || '').trim().toLowerCase()
  const allAccounts = await getAccounts()
  const accounts = query ? allAccounts.filter((a) => a.did.toLowerCase().includes(query) || (a.handle || '').toLowerCase().includes(query)) : allAccounts
  const takedownCount = allAccounts.filter((a) => a.takedown).length
  const deactivatedCount = allAccounts.filter((a) => a.deactivated && !a.takedown).length
  const activeCount = allAccounts.filter((a) => !a.deactivated && !a.takedown).length

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
        <div className="top"><div><div className="eyebrow">Kelo Social • Modération</div><h1 className="title">Comptes</h1><p className="subtitle">Tous les comptes du PDS, y compris les comptes désactivés, avec pagination administrative AT Protocol.</p></div><form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form></div>
        <div className="grid">
          <div className="card"><div className="label">Total des comptes</div><div className="metric">{allAccounts.length}</div></div>
          <div className="card"><div className="label">Actifs</div><div className="metric">{activeCount}</div></div>
          <div className="card"><div className="label">Désactivés</div><div className="metric">{deactivatedCount}</div></div>
          <div className="card"><div className="label">Retirés par modération</div><div className="metric">{takedownCount}</div></div>
        </div>
        <section className="card queue">
          <div className="eyebrow">PDS • did:web:pds.kelosocial.eu</div><h2>{accounts.length} compte{accounts.length > 1 ? 's' : ''}{query ? ' trouvé(s)' : ' au total'}</h2>
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
