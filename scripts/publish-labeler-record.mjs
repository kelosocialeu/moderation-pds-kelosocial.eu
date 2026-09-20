const pds = process.env.PDS_URL || 'https://pds.kelosocial.eu'
const identifier = process.env.KELO_LABELER_IDENTIFIER || 'moderation.kelosocial.eu'
const password = process.env.KELO_LABELER_PASSWORD
if (!password) throw new Error('KELO_LABELER_PASSWORD is required only for this one-time command')

const declaration = {
  $type: 'app.bsky.labeler.service',
  policies: {
    labelValues: ['spam', 'harassment', 'misleading', 'nsfw'],
    labelValueDefinitions: [
      {
        identifier: 'spam',
        severity: 'alert',
        blurs: 'content',
        defaultSetting: 'warn',
        locales: [
          { lang: 'fr', name: 'Spam', description: 'Contenu indésirable ou promotionnel non sollicité.' },
          { lang: 'en', name: 'Spam', description: 'Unwanted or unsolicited promotional content.' },
        ],
      },
      {
        identifier: 'harassment',
        severity: 'alert',
        blurs: 'content',
        defaultSetting: 'warn',
        locales: [
          { lang: 'fr', name: 'Harcèlement', description: 'Contenu visant à harceler ou intimider une personne.' },
          { lang: 'en', name: 'Harassment', description: 'Content intended to harass or intimidate a person.' },
        ],
      },
      {
        identifier: 'misleading',
        severity: 'alert',
        blurs: 'content',
        defaultSetting: 'warn',
        locales: [
          { lang: 'fr', name: 'Trompeur', description: 'Contenu présentant des informations trompeuses ou manipulatrices.' },
          { lang: 'en', name: 'Misleading', description: 'Content presenting misleading or manipulative information.' },
        ],
      },
      {
        identifier: 'nsfw',
        severity: 'alert',
        blurs: 'media',
        defaultSetting: 'warn',
        locales: [
          { lang: 'fr', name: 'Contenu sensible', description: 'Contenu pouvant être sensible ou réservé à un public adulte.' },
          { lang: 'en', name: 'Sensitive content', description: 'Content that may be sensitive or intended for adults.' },
        ],
      },
    ],
  },
  subjectTypes: ['record', 'account'],
  subjectCollections: ['app.bsky.feed.post', 'app.bsky.actor.profile'],
  reasonTypes: [
    'com.atproto.moderation.defs#reasonSpam',
    'com.atproto.moderation.defs#reasonViolation',
    'com.atproto.moderation.defs#reasonMisleading',
    'com.atproto.moderation.defs#reasonOther',
  ],
  createdAt: new Date().toISOString(),
}

const base = pds.replace(/\/$/, '')
const login = await fetch(base + '/xrpc/com.atproto.server.createSession', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier, password }),
})
if (!login.ok) throw new Error('createSession failed: ' + await login.text())
const session = await login.json()
if (session.handle !== identifier) throw new Error('Authenticated account is not the expected moderation account')
if (session.did !== 'did:plc:44ysjmve3iz2aihu6o2kj5bc') throw new Error('Authenticated DID is not the Kelo moderation DID')

const write = await fetch(base + '/xrpc/com.atproto.repo.putRecord', {
  method: 'POST',
  headers: {
    authorization: 'Bearer ' + session.accessJwt,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    repo: session.did,
    collection: 'app.bsky.labeler.service',
    rkey: 'self',
    record: declaration,
  }),
})
if (!write.ok) throw new Error('putRecord failed: ' + await write.text())

console.log(JSON.stringify({ ok: true, did: session.did, handle: session.handle, record: 'app.bsky.labeler.service/self' }, null, 2))
