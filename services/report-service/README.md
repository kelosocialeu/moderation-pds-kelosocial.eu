# Kelo report service

This is the AT Protocol report receiver for Kelo Social.

It implements `POST /xrpc/com.atproto.moderation.createReport`, verifies the short-lived AT Protocol service-auth JWT, checks the audience and bound lexicon method, prevents JWT replay through the stored `jti`, and stores reports in SQLite.

The service is intentionally separate from the Next.js moderation UI. The UI remains on `mod.kelosocial.eu`; the report receiver can run on the Oracle VM behind a dedicated hostname such as `reports.kelosocial.eu`.

The PDS must not be pointed at this service until:
1. the service is deployed;
2. its DID document resolves publicly;
3. `/health` works;
4. a real authenticated `createReport` request has been tested.
