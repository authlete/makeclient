# makeclient

Host an OAuth [Client ID Metadata Document][cimd] (CIMD) at a URL you use
directly as a `client_id` — no registration. The URL _is_ the client.

[cimd]: https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/

## Use it

Open the UI (`/`), or call the API:

```bash
# public client
curl -s makeclient.dev/api/clients -d '{"redirect_uris":["https://app.example/cb"]}'
# → { "client_id": ".../c/<cfg>/client-metadata.json" }

# private_key_jwt — mints a keypair: public key in the doc, private key returned (never stored)
curl -s makeclient.dev/api/clients -d '{"token_endpoint_auth_method":"private_key_jwt"}'
# → { "client_id": ".../s/<id>/client-metadata.json", "private_key": { ...JWK... } }
```

Paste `client_id` into any CIMD-capable AS (and `private_key` as its signing
key). `GET` the `client_id` to see the document. Defaults give a public,
PKCE-ready client (auth code + refresh + device); override any RFC 7591 field.

## How it works

Public clients encode the config in the URL path (stateless). A client with a
`jwks` is too big for the URL, so it's stored under a short id — Vercel Blob in
prod, a local `.data/` folder in dev. `lib/metadata.ts` is the single source of
truth; the server always sets `client_id` to the serving URL (CIMD requires it).

## Develop

```bash
npm install
npm run dev        # localhost:3000
```

Deploys to Vercel with zero config. For hosted confidential clients, add a Blob
store (provides `BLOB_READ_WRITE_TOKEN`); dev falls back to `.data/`.
