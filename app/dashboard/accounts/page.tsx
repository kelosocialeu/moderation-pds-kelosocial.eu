import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession, sessionCookie } from '@/lib/auth'
import { pdsPublicRequest, pdsRequest } from '@/lib/pds'
import { AccountActions } from './AccountActions'

type RepoEntry = { did: string; active?: boolean; status?: string; rev?: string }
type Account = {
  did: string
  handle?: string
  email?: string
  indexedAt?: string
  deactivated: boolean
  takedown: boolean
  statusKnown: boolean
  statusCode?: string
}
type AccountLoad = { accounts: Account[]; error?: string; source: 'repo-index' | 'none'; adminApiAvailable: boolean }

function validHandle(value?: string) {
  if (!value || value === 'handle.invalid' || value === 'invalid.invalid') return undefined
  const handle = value.replace(/^@/, '').trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(handle) ? handle : undefined
}

async function handleFromDidDocument(did: string): Promise<string | undefined> {
  try {
    let url: string
    if (did.startsWith('did:plc:')) {
      url = `https://plc.directory/${encodeURIComponent(did)}`
    } else if (did.startsWith('did:web:')) {
      const parts = did.slice('did:web:'.length).split(':').map((part) => decodeURIComponent(part))
      const host = parts.shift()?.toLowerCase()
      if (!host || !(host === 'kelosocial.eu' || host.endsWith('.kelosocial.eu'))) return undefined
      url = `https://${host}/${parts.length ? parts.join('/') + '/' : '.well-known/'}${parts.length ? 'did.json' : 'did.json'}`
    } else {
      return undefined
    }

    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    if (!response.ok) return undefined
    const document = await response.json() as { id?: string; alsoKnownAs?: string[] }
    if (document.id !== did || !Array.isArray(document.alsoKnownAs)) return undefined
    for (const alias of document.alsoKnownAs) {
      if (typeof alias !== 'string' || !alias.startsWith('at://')) continue
      const handle = validHandle(alias.slice('at://'.length).replace(/\/$/, ''))
      if (handle) return handle
    }
  } catch (error) {
    console.warn('[Kelo Moderation] DID document lookup failed:', did, error instanceof Error ? error.message : 'unknown error')
  }
  return undefined
}

type AccountDetails = { handle?: string; email?: string; indexedAt?: string; deactivatedAt?: string }

async function accountDetailsFor(dids: string[]): Promise<Map<string, AccountDetails>> {
  const details = new Map<string, AccountDetails>()
  for (let i = 0; i < dids.length; i += 100) {
    const query = new URLSearchParams()
    for (const did of dids.slice(i, i + 100)) query.append('dids', did)
    try {
      const result = await pdsRequest('/xrpc/com.atproto.admin.getAccountInfos?' + query.toString())
      if (!result.response.ok || !result.data || typeof result.data !== 'object') {
        console.warn('[Kelo Moderation] getAccountInfos unavailable:', result.response.status, result.data)
        continue
      }
      const payload = result.data as { infos?: Array<AccountDetails & { did?: string }> }
      if (!Array.isArray(payload.infos)) continue
      for (const info of payload.infos) {
        if (typeof info.did === 'string') {
          details.set(info.did, {
            handle: validHandle(info.handle),
            email: info.email,
            indexedAt: info.indexedAt,
            deactivatedAt: info.deactivatedAt,
          })
        }
      }
    } catch (error) {
      console.warn('[Kelo Moderation] getAccountInfos failed:', error instanceof Error ? error.message : 'unknown error')
    }
  }
  return details
}

function statusFromRepo(repo: RepoEntry, deactivatedAt?: string): Pick<Account, 'deactivated' | 'takedown' | 'statusKnown' | 'statusCode'> {
  const status = (repo.status || '').toLowerCase()
  if (repo.active === true) return { deactivated: false, takedown: false, statusKnown: true, statusCode: 'active' }
  if (status === 'takendown') return { deactivated: false, takedown: true, statusKnown: true, statusCode: status }
  if (status === 'suspended' || status === 'deactivated') return { deactivated: true, takedown: false, statusKnown: true, statusCode: status }
  if (status) return { deactivated: false, takedown: false, statusKnown: true, statusCode: status }
  if (repo.active === false && deactivatedAt) return { deactivated: true, takedown: false, statusKnown: true, statusCode: 'deactivated' }
  return { deactivated: false, takedown: false, statusKnown: false }
}

async function getAccounts(): Promise<AccountLoad> {
  try {
    const repos: RepoEntry[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const query = new URLSearchParams({ limit: '1000' })
      if (cursor) query.set('cursor', cursor)
      const result = await pdsPublicRequest('/xrpc/com.atproto.sync.listRepos?' + query.toString())
      if (!result.response.ok) {
        const body = result.data as { error?: string; message?: string } | null
        throw new Error(`listRepos HTTP ${result.response.status}${body?.error ? ` (${body.error})` : ''}`)
      }
      const payload = result.data as { repos?: RepoEntry[]; cursor?: string }
      if (!Array.isArray(payload?.repos)) throw new Error('Réponse listRepos invalide : liste repos absente')
      repos.push(...payload.repos.filter((repo): repo is RepoEntry => typeof repo.did === 'string'))
      const nextCursor = payload.cursor
      pages += 1
      if (nextCursor && nextCursor === cursor) throw new Error('Le curseur de pagination listRepos est resté identique')
      cursor = nextCursor
    } while (cursor && pages < 100)

    if (cursor) throw new Error('La pagination du PDS dépasse 100 pages : chargement interrompu pour éviter une liste incomplète')
    const uniqueRepos = Array.from(new Map(repos.map((repo) => [repo.did, repo])).values())

    const detailsByDid = await accountDetailsFor(uniqueRepos.map((repo) => repo.did))
    const accounts: Account[] = []
    for (let i = 0; i < uniqueRepos.length; i += 20) {
      const batch = await Promise.all(uniqueRepos.slice(i, i + 20).map(async (repo): Promise<Account> => {
        const details = detailsByDid.get(repo.did) || {}
        const handle = details.handle || await handleFromDidDocument(repo.did)
        const status = statusFromRepo(repo, details.deactivatedAt)
        return {
          did: repo.did,
          handle,
          email: details.email,
          indexedAt: details.indexedAt,
          ...status,
        }
      }))
      accounts.push(...batch)
    }
    return { accounts, source: 'repo-index', adminApiAvailable: detailsByDid.size > 0 || uniqueRepos.length === 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue lors de la lecture du PDS'
    console.error('[Kelo Moderation] Impossible de charger les comptes:', message)
    return { accounts: [], source: 'none', error: message, adminApiAvailable: false }
  }
}

function statusLabel(account: Account) {
  if (!account.statusKnown) return 'Statut à vérifier'
  if (account.takedown) return 'Retrait appliqué'
  if (account.statusCode === 'suspended') return 'Suspendu'
  if (account.statusCode === 'deactivated' || account.deactivated) return 'Désactivé'
  if (account.statusCode === 'deleted') return 'Supprimé'
  if (account.statusCode === 'desynchronized') return 'Dépôt désynchronisé'
  if (account.statusCode === 'throttled') return 'Accès limité'
  return 'Actif'
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const store = await cookies()
  if (!isValidSession(store.get(sessionCookie.name)?.value)) redirect('/')
  const params = await searchParams
  const query = (params.q || '').trim().toLowerCase()
  const loaded = await getAccounts()
  const allAccounts = loaded.accounts
  const accounts = query ? allAccounts.filter((account) => account.did.toLowerCase().includes(query) || (account.handle || '').toLowerCase().includes(query)) : allAccounts
  const takedownCount = allAccounts.filter((account) => account.statusKnown && account.takedown).length
  const deactivatedCount = allAccounts.filter((account) => account.statusKnown && account.deactivated && !account.takedown).length
  const activeCount = allAccounts.filter((account) => account.statusKnown && account.statusCode === 'active').length

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
        <div className="top"><div><div className="eyebrow">Kelo Social • Modération</div><h1 className="title">Comptes</h1><p className="subtitle">Comptes hébergés sur le PDS, identifiés par leur DID, leur handle et leur état de dépôt AT Protocol.</p></div><form action="/api/auth/logout" method="post"><button className="btn">Se déconnecter</button></form></div>
        <div className="grid">
          <div className="card"><div className="label">Total des comptes</div><div className="metric">{loaded.error ? '—' : allAccounts.length}</div></div>
          <div className="card"><div className="label">Actifs</div><div className="metric">{loaded.error ? '—' : activeCount}</div></div>
          <div className="card"><div className="label">Désactivés / suspendus</div><div className="metric">{loaded.error ? '—' : deactivatedCount}</div></div>
          <div className="card"><div className="label">Retirés par modération</div><div className="metric">{loaded.error ? '—' : takedownCount}</div></div>
        </div>
        <section className="card queue">
          <div className="eyebrow">PDS • did:web:pds.kelosocial.eu • Index public des dépôts</div><h2>{accounts.length} compte{accounts.length > 1 ? 's' : ''}{query ? ' trouvé(s)' : ' au total'}</h2>
          <form className="searchForm" action="/dashboard/accounts" method="get"><input name="q" type="search" defaultValue={params.q || ''} placeholder="Rechercher un handle ou un DID…" aria-label="Rechercher un compte"/><button className="btn primary" type="submit">Rechercher</button>{query && <a className="btn" href="/dashboard/accounts">Effacer</a>}</form>
          {!loaded.error && allAccounts.length > 0 && !loaded.adminApiAvailable && <p className="error">La liste et les statuts sont lus depuis le PDS, mais son API administrateur refuse la connexion. Les actions suspendre, réactiver et supprimer ne fonctionneront pas tant que PDS_ADMIN_PASSWORD ne sera pas corrigé dans les variables d’environnement de Vercel.</p>}
          {loaded.error && <p className="error">Impossible de récupérer les comptes : {loaded.error}. Vérifiez que PDS_URL pointe vers https://pds.kelosocial.eu et que le PDS répond à com.atproto.sync.listRepos.</p>}
          {accounts.length === 0 && !loaded.error ? <p className="subtitle">Le PDS a répondu correctement, mais ne retourne aucun dépôt de compte.</p> : accounts.map((account) => {
            const canManage = account.statusKnown && ['active', 'suspended', 'deactivated'].includes(account.statusCode || '')
            return (
              <article className="report" key={account.did}>
                <div><div className="reason">{account.handle ? `@${account.handle}` : 'Handle non publié dans le DID'}</div><div className="meta">{account.did}</div>{account.email && <div className="meta">Adresse du compte : {account.email}</div>}{account.indexedAt && <div className="meta">Créé : {new Date(account.indexedAt).toLocaleString('fr-BE')}</div>}</div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}><span className="pill" style={{background:!account.statusKnown?'rgba(148,163,184,.12)':account.takedown?'rgba(251,113,133,.12)':account.deactivated?'rgba(245,158,11,.12)':'rgba(52,211,153,.12)',color:!account.statusKnown?'var(--muted)':account.takedown?'var(--danger)':account.deactivated?'#b7791f':'var(--ok)'}}>{statusLabel(account)}</span><AccountActions did={account.did} deactivated={account.deactivated} disabled={!canManage}/></div>
              </article>
            )
          })}
        </section>
      </section>
    </main>
  )
}
