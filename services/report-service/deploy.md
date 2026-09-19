# Déploiement sur le serveur Oracle

Le service est volontairement séparé du PDS et du site Next.js.

## 1. DNS

Créer un enregistrement A :

reports.kelosocial.eu -> IP publique du serveur Oracle

## 2. Préparer le service

Depuis le dépôt cloné sur le serveur :

```bash
cd moderation-pds-kelosocial.eu/services/report-service
cp .env.example .env
nano .env
```

Remplir `MODERATION_API_TOKEN` avec un secret long et aléatoire.

## 3. Lancer

```bash
sudo docker compose up -d --build
```

## 4. Vérifier localement

```bash
curl http://127.0.0.1:3100/health
```

## 5. HTTPS

Ajouter le bloc de `Caddyfile.example` à la configuration Caddy existante, puis recharger Caddy.

## 6. Vérifier le DID document

```bash
curl https://reports.kelosocial.eu/.well-known/did.json
```

Le document doit contenir le service `#atproto_labeler`.

## 7. Ne pas modifier le PDS avant le test

Tant que le service n'a pas été vérifié, conserver :

PDS_REPORT_SERVICE_URL=https://mod.bsky.app
PDS_REPORT_SERVICE_DID=did:plc:ar7c4by46qjdydhdevvrndac

Après validation seulement, utiliser :

PDS_REPORT_SERVICE_URL=https://reports.kelosocial.eu
PDS_REPORT_SERVICE_DID=did:web:reports.kelosocial.eu

Puis redémarrer le PDS et effectuer un vrai signalement Kelo Social.
