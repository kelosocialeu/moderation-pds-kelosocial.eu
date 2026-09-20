import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsRequest } from '@/lib/pds'
import { AccountActions } from './AccountActions'

type Account = {
  did: string
  handle?: string
  email?: string
  status?: string
  deactivated?: boolean
}

async function getAccounts(): Promise<Account[]> {
  try {
    const repos = await pdsRequest('/xrpc/com.atproto.sync.listRepos?limit=100')
    if (!repos.response.ok || !repos.data || typeof repos.data !== 'object' || !('repos' in repos.data)) return []

    const list = (repos.data as { repos?: Array<{ did?: string; active?: boolean }> }).repos ?? []
    const dids = list.map((r) => r.did).filter((did): did is string => Boolean(did))
    if (!dids.length) return []

    // Do not use com.atproto.admin.getAccountInfos here: the PDS may expose
    // admin routes with a different auth mode. describeRepo is public and
    // provides the DID/handle pair needed by this console.
    const results: Array<Account | null> = await Promise.all(
      dids.map(async (did): Promise<Account | null> => {
        try {
          const repo = await pdsRequest(
            `/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`,
          )
          if (!repo.response.ok || !repo.data || typeof repo.data !== 'object') return null

          const data = repo.data as { did?: string; handle?: string }
          if (!data.did) return null

          return {
            did: data.did,
            handle: data.handle,
            status: 'active',
            deactivated: false,
          }
        } catch {
          return null
        }
      }),
    )

    return results.filter((account): account is Account => account !== null)
  } catch {
    return []
  }
}

export default async function AccountsPage() {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const accounts = await getAccounts()

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">Kelo <span>Moderation</span></div>
        <div className="badge">Accès sécurisé</div>
        <nav className="nav">
          <a href="/dashboard">Vue d’ensemble</a>
          <a href="/dashboard/reports">Signalements</a>
          <a className="active" href="/dashboard/accounts">Comptes</a>
          <a href="/dashboard/history">Historique</a>
        </nav>
      </aside>
      <section className="content">
        <div className="top">
          <div>
            <div className="eyebrow">Kelo Social • Modération</div>
            <h1 className="title">Comptes</h1>
            <p className="subtitle">Comptes actuellement connus par le PDS Kelo Social.</p>
          </div>
          <form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form>
        </div>
        <section className="card queue">
          <div className="eyebrow">PDS</div>
          <h2>{accounts.length} compte{accounts.length > 1 ? 's' : ''}</h2>
          {accounts.length === 0 ? <p className="subtitle">Aucun compte récupéré ou PDS temporairement indisponible.</p> : accounts.map((account) => (
            <article className="report" key={account.did}>
              <div><div className="reason">{account.handle || 'Compte sans handle'}</div><div className="meta">{account.did}</div></div>
              <span className="pill">{account.deactivated ? 'Désactivé' : 'Actif'}</span>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
