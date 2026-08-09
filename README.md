# Kelo Moderation

Console privée de modération pour Kelo Social.

## Sécurité intégrée

- aucune inscription publique ;
- mot de passe stocké uniquement sous forme de hash scrypt ;
- session signée côté serveur ;
- cookie HttpOnly, Secure et SameSite=Strict ;
- CSP restrictive, HSTS, anti-framing, anti-indexation et no-store ;
- secrets du service de modération accessibles uniquement côté serveur ;
- limitation basique des tentatives de connexion ;
- interface indépendante des comptes utilisateurs Kelo.

Aucun service web ne peut être garanti comme « impossible à hacker ». Pour une production sensible, ajouter également une couche d'accès réseau (Cloudflare Access, VPN ou allowlist IP), MFA et journalisation centralisée.

## Variables d'environnement

Copier `.env.example` dans les variables secrètes de la plateforme de déploiement. Ne jamais créer un vrai `.env` dans GitHub.

### Générer SESSION_SECRET

```bash
openssl rand -base64 48
```

### Générer ADMIN_PASSWORD_HASH

Sur une machine de confiance :

```bash
node -e "const c=require('crypto');const p=process.argv[1];const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))" 'VOTRE_MOT_DE_PASSE_TRES_LONG'
```

Copier uniquement le résultat `salt:hash` dans `ADMIN_PASSWORD_HASH`.

## Connexion au moteur de modération

Le navigateur ne contacte jamais directement le moteur AT Protocol. Le serveur Next.js utilise :

- `MODERATION_API_URL=https://mod.kelosocial.eu`
- `MODERATION_API_TOKEN=<secret serveur>`

Le moteur devra exposer au minimum une route serveur `GET /reports?status=open` protégée par Bearer token. Les actions de modération seront ajoutées ensuite sous forme de routes serveur authentifiées et auditées.

## Déploiement

```bash
npm install
npm run build
npm start
```

Avant mise en production : activer MFA sur GitHub et l'hébergeur, protéger la branche `main`, désactiver les previews publiques, limiter l'accès au domaine d'administration et tester les en-têtes de sécurité.
