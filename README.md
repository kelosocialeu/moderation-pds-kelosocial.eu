# Kelo Moderation

Console privée de modération pour Kelo Social.

## Architecture

Le dépôt contient deux parties :

- **Next.js** : interface privée de modération ;
- **Kelo Report Service** : service AT Protocol séparé, prévu pour `reports.kelosocial.eu`.

Le report service reçoit directement `com.atproto.moderation.createReport`, vérifie les JWT d'authentification inter-services AT Protocol, contrôle l'audience et le `lxm`, bloque les relectures grâce au `jti`, puis conserve les signalements dans SQLite.

## Connexion à Kelo Moderation

La connexion utilise le mécanisme de mot de passe AT Protocol du PDS Kelo Social, sans OAuth et sans mot de passe administrateur indépendant.

Seuls ces deux handles exacts sont autorisés :

- `kelosocial.eu`
- `moderation.kelosocial.eu`

Le serveur résout le handle, vérifie le DID document et le service PDS associé, puis authentifie le mot de passe auprès de `com.atproto.server.createSession`. Si le PDS demande un facteur de vérification, le code reçu par e-mail peut être fourni dans le formulaire. Une session signée, limitée à huit heures, est ensuite conservée dans un cookie HttpOnly, Secure et SameSite=Strict.

Les autres handles sont refusés. Les identités doivent être hébergées sur le PDS configuré dans `PDS_URL`.

## Sécurité intégrée

- aucune inscription publique ;
- authentification AT Protocol via le PDS Kelo ;
- liste blanche stricte de deux handles ;
- vérification du DID et du service PDS avant connexion ;
- session signée côté serveur ;
- cookie HttpOnly, Secure et SameSite=Strict ;
- secrets jamais exposés au navigateur ;
- limitation basique des tentatives de connexion ;
- endpoint de signalement protégé par authentification AT Protocol ;
- contrôle de l'audience du service ;
- contrôle du `lxm` `com.atproto.moderation.createReport` ;
- détection des relectures de JWT par `jti` ;
- stockage persistant SQLite côté serveur.

## Variables d'environnement du site

Configurer dans Vercel :

```env
SESSION_SECRET=replace-with-at-least-32-random-characters

MODERATION_API_URL=https://reports.kelosocial.eu
MODERATION_API_TOKEN=replace-with-a-long-random-server-token

PDS_URL=https://pds.kelosocial.eu
PDS_ADMIN_PASSWORD=replace-with-your-existing-pds-admin-password
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=Kelo Social <support@kelosocial.eu>
RESEND_REPLY_TO=support@kelosocial.eu
```

**Important :** `PDS_ADMIN_PASSWORD` reste nécessaire uniquement aux opérations administrateur du PDS (suspension, réactivation, suppression, etc.). Ce n'est pas le mot de passe utilisé pour se connecter au tableau de bord. Ne pas le supprimer ni le remplacer par le mot de passe d'un compte utilisateur.

## Notifications e-mail Resend

Les notifications de suspension et de suppression utilisent l’API Resend. Dans les variables d’environnement **Production** de Vercel, ajouter obligatoirement :

- `RESEND_API_KEY` : clé API Resend secrète.

L’expéditeur par défaut est `Kelo Social <support@kelosocial.eu>` et l’adresse de réponse `support@kelosocial.eu`. Le domaine `kelosocial.eu` doit être vérifié dans Resend et l’adresse d’expédition doit être autorisée. Les valeurs peuvent être remplacées facultativement avec `RESEND_FROM_EMAIL` et `RESEND_REPLY_TO`.

Ne jamais ajouter la clé Resend au dépôt GitHub ni au code exécuté dans le navigateur. L’adresse e-mail du compte est récupérée auprès du PDS avant l’action irréversible. Si l’adresse est absente ou si Resend échoue après les tentatives automatiques, l’action de modération reste appliquée et le tableau de bord affiche que le mail n’a pas été envoyé.

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

Voir `services/report-service/deploy.md`.

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
