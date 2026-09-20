# Déploiement du Labeler Kelo Social

Le service `reports.kelosocial.eu` devient le **Labeler AT Protocol** de l'identité existante `moderation.kelosocial.eu`.

Identité Labeler :
- handle : `moderation.kelosocial.eu`
- DID : `did:plc:44ysjmve3iz2aihu6o2kj5bc`
- service : `#atproto_labeler`
- endpoint : `https://reports.kelosocial.eu`

Le DID du Labeler est donc celui du compte de modération. **Ne crée pas un deuxième DID pour reports.kelosocial.eu.**

## 1. DNS

Créer/conserver :

`reports.kelosocial.eu -> IP publique du serveur Oracle`

## 2. Déployer le service

Depuis le dépôt :

```bash
cd /opt/moderation-pds-kelosocial.eu/services/report-service
cp .env.example .env
nano .env
```

Mettre un vrai `MODERATION_API_TOKEN`. Ne jamais le mettre dans GitHub.

Puis :

```bash
sudo docker compose up -d --build
curl http://127.0.0.1:3100/health
```

Le résultat doit indiquer `"labeler":true`.

## 3. HTTPS

Caddy doit exposer :

`https://reports.kelosocial.eu`

Puis vérifier :

```bash
curl -s https://reports.kelosocial.eu/.well-known/did.json | jq
curl -s 'https://reports.kelosocial.eu/xrpc/com.atproto.label.queryLabels?uriPatterns=*&limit=1' | jq
```

Le DID document doit annoncer :

- `id = did:plc:44ysjmve3iz2aihu6o2kj5bc`
- `#atproto_labeler`
- `type = AtprotoLabeler`
- `serviceEndpoint = https://reports.kelosocial.eu`

## 4. Modifier le DID PLC de moderation.kelosocial.eu

Cette étape est indispensable. Le DID PLC doit contenir :

```json
{
  "verificationMethod": [
    {
      "id": "did:plc:44ysjmve3iz2aihu6o2kj5bc#atproto_label",
      "type": "Multikey",
      "controller": "did:plc:44ysjmve3iz2aihu6o2kj5bc",
      "publicKeyMultibase": "<clé publique>"
    }
  ],
  "service": [
    {
      "id": "did:plc:44ysjmve3iz2aihu6o2kj5bc#atproto_labeler",
      "type": "AtprotoLabeler",
      "serviceEndpoint": "https://reports.kelosocial.eu"
    }
  ]
}
```

**Ne modifie pas le DID à la main dans la base PLC et ne colle aucune clé privée dans GitHub ou dans le chat.**

Le PDS de référence sait gérer les opérations PLC et recommande de conserver la clé de rotation PLC dans un emplacement sécurisé. Le PDS peut aussi fournir les credentials DID recommandés. citeturn3search5turn3search3

Sur ton serveur Oracle, on fera cette opération avec l'outil `goat` ou le flux PLC du PDS. Si aucune clé de rotation personnelle n'a été ajoutée au DID, le PDS devra signer l'opération PLC avec sa clé de rotation gérée par `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`. Cette variable est un secret et ne doit jamais être affichée. citeturn3search5

## 5. Publier la déclaration Labeler dans le dépôt

Le compte `moderation.kelosocial.eu` doit publier :

`app.bsky.labeler.service/self`

Exemple de déclaration Kelo :

```json
{
  "$type": "app.bsky.labeler.service",
  "policies": {
    "labelValues": ["spam", "harassment", "misleading", "nsfw"],
    "labelValueDefinitions": [
      {
        "identifier": "spam",
        "severity": "alert",
        "blurs": "content",
        "defaultSetting": "warn",
        "locales": [
          {
            "lang": "fr",
            "name": "Spam",
            "description": "Contenu indésirable ou promotionnel non sollicité."
          },
          {
            "lang": "en",
            "name": "Spam",
            "description": "Unwanted or unsolicited promotional content."
          }
        ]
      }
    ]
  },
  "subjectTypes": ["record", "account"],
  "subjectCollections": ["app.bsky.feed.post", "app.bsky.actor.profile"],
  "reasonTypes": [
    "com.atproto.moderation.defs#reasonSpam",
    "com.atproto.moderation.defs#reasonViolation",
    "com.atproto.moderation.defs#reasonMisleading",
    "com.atproto.moderation.defs#reasonOther"
  ],
  "createdAt": "2026-09-20T00:00:00.000Z"
}
```

La déclaration est un record du compte, tandis que les labels eux-mêmes sont servis séparément par `com.atproto.label.queryLabels` / `subscribeLabels`. citeturn0search1turn1search0

## 6. Configuration du PDS

**Oui : il faudra modifier la configuration du PDS**, mais uniquement après avoir validé le DID document et le service HTTPS.

Les valeurs à utiliser sont :

```env
PDS_REPORT_SERVICE_URL=https://reports.kelosocial.eu
PDS_REPORT_SERVICE_DID=did:plc:44ysjmve3iz2aihu6o2kj5bc
```

Attention : le DID est celui de `moderation.kelosocial.eu`, pas `did:web:reports.kelosocial.eu`.

Après modification, redémarrer le conteneur PDS.

Le mécanisme de proxy AT Protocol utilise le DID + `#atproto_labeler`; le PDS résout alors le DID et vérifie le service déclaré dans son DID document. citeturn0search4

## 7. Vérification finale

Tester :

```bash
curl -s https://pds.kelosocial.eu/xrpc/com.atproto.repo.getRecord?repo=did:plc:44ysjmve3iz2aihu6o2kj5bc\&collection=app.bsky.labeler.service\&rkey=self | jq
curl -s 'https://reports.kelosocial.eu/xrpc/com.atproto.label.queryLabels?uriPatterns=*&limit=10' | jq
```

Puis dans Kelo Social :

1. ouvrir un compte normal ;
2. envoyer un signalement vers `moderation.kelosocial.eu` ;
3. vérifier que le signalement arrive dans `mod.kelosocial.eu` ;
4. attribuer ensuite un label ;
5. vérifier que le label est distribué par `queryLabels`.

Le client peut ensuite déclarer le Labeler via son DID et recevoir les labels avec `atproto-accept-labelers`. citeturn0search3
