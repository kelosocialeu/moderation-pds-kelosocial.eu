# Kelo Moderation

Console privée de modération pour Kelo Social.

## Architecture

Le dépôt contient désormais deux parties :

- **Next.js** : interface privée `mod.kelosocial.eu` ;
- **Kelo Report Service** : service AT Protocol séparé, prévu pour `reports.kelosocial.eu`.

Le report service reçoit directement `com.atproto.moderation.createReport`, vérifie les JWT d'authentification inter-services AT Protocol, contrôle l'audience et le `lxm`, bloque les relectures grâce au `jti`, puis conserve les signalements dans SQLite.

Cette architecture évite de dépendre de `mod.bsky.app` tout en conservant une interface Kelo personnalisée.

AT Protocol utilise le mécanisme de proxy `atproto-proxy` : le PDS transmet au service cible un JWT signé à durée courte. Le service destinataire doit vérifier cette authentification. Voir la documentation officielle AT Protocol sur les signalements et l'authentification inter-services.

## Sécurité intégrée

- aucune inscription publique ;
- mot de passe administrateur côté serveur ;
- session signée ;
- cookie HttpOnly, Secure et SameSite=Strict ;
- secrets jamais exposés au navigateur ;
- limitation basique des tentatives de connexion ;
- endpoint de signalement protégé par authentification AT Protocol ;
- contrôle de l'audience du service ;
- contrôle du `lxm` `com.atproto.moderation.createReport` ;
- détection des relectures de JWT par `jti` ;
- stockage persistant SQLite côté serveur.

## Variables d'environnement du site

Copier les valeurs dans les variables secrètes de Vercel :

```env
SESSION_SECRET=replace-with-at-least-32-random-characters
ADMIN_PASSWORD_HASH=salt:64-byte-scrypt-hash-in-hex

MODERATION_API_URL=https://reports.kelosocial.eu
MODERATION_API_TOKEN=replace-with-a-long-random-server-token

PDS_URL=https://pds.kelosocial.eu
PDS_ADMIN_PASSWORD=replace-with-your-existing-pds-admin-password
```

## Variables du report service

Sur le serveur Oracle :

```env
REPORT_SERVICE_DID=did:web:reports.kelosocial.eu
REPORT_SERVICE_HOST=reports.kelosocial.eu
REPORT_SERVICE_PORT=3100
MODERATION_API_TOKEN=the-same-server-token-as-the-dashboard
REPORT_DB_PATH=/app/data/reports.db
```

## Déploiement du report service

Voir :

`services/report-service/deploy.md`

Le service est volontairement lié à `127.0.0.1:3100` dans Docker. Caddy expose ensuite uniquement HTTPS sur `reports.kelosocial.eu`.

## PDS

**Ne pas modifier les variables de report du PDS tant que le service n'est pas déployé et testé.**

Configuration actuelle à conserver pendant la préparation :

```env
PDS_REPORT_SERVICE_URL=https://mod.bsky.app
PDS_REPORT_SERVICE_DID=did:plc:ar7c4by46qjdydhdevvrndac
```

Après validation complète du nouveau service seulement :

```env
PDS_REPORT_SERVICE_URL=https://reports.kelosocial.eu
PDS_REPORT_SERVICE_DID=did:web:reports.kelosocial.eu
```

## Générer les secrets

### SESSION_SECRET

```bash
openssl rand -base64 48
```

### Token serveur

```bash
openssl rand -hex 32
```

### ADMIN_PASSWORD_HASH

Sur une machine de confiance :

```bash
node -e "const c=require('crypto');const p=process.argv[1];const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))" 'VOTRE_MOT_DE_PASSE_TRES_LONG'
```

Ne jamais commit de vrais secrets dans GitHub.

## Déploiement du site

```bash
npm install
npm run build
npm start
```

Le site Next.js reste déployé sur Vercel.

## Important

Le service de rapports n'est pas encore branché au PDS. Il doit d'abord être déployé, exposer son DID document, être testé, puis seulement la configuration du PDS pourra être basculée.

