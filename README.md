# makeclient

Host an OAuth [Client ID Metadata Document][cimd] (CIMD) at a URL you use
directly as a `client_id` — no registration. The URL _is_ the client.

Built to exercise Authlete-based authorization servers, but works with any
CIMD-capable AS. Keypairs are generated on demand; nothing secret is ever
stored.

[cimd]: https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/

## Use it

Open the UI at `/` — fill in the fields, watch the document update live, and
copy the `client_id`. Or call the API:

```bash
# public client (PKCE) — config rides in the URL, stateless
curl -s https://makeclient.dev/api/clients \
  -H 'content-type: application/json' \
  -d '{"redirect_uris":["https://app.example/cb"]}'
# → { "client_id": ".../c/<cfg>/client-metadata.json" }

# confidential client (private_key_jwt) — mints an ES256 keypair: the public
# key goes in the document, the private key is returned (never stored)
curl -s https://makeclient.dev/api/clients \
  -H 'content-type: application/json' \
  -d '{"token_endpoint_auth_method":"private_key_jwt"}'
# → { "client_id": ".../s/<id>/client-metadata.json", "private_key": { ...JWK... } }
```

Paste the `client_id` into any CIMD-capable AS (and `private_key` as its signing
key). `GET` the `client_id` to see the document.

## What you get

- **Public or confidential clients** — `none` (PKCE) or `private_key_jwt`
  (makeclient mints the ES256 keypair and hands back the private half).
- **Sensible defaults** — authorization code + refresh + device. Confidential
  clients also get `client_credentials`, CIBA (poll mode), and `jwt-bearer`.
- **Override anything** — any RFC 7591 field, plus RAR
  `authorization_details_types` and friends, via the API body or the UI's
  **Advanced (raw JSON)**.
- **Always valid, AS-ready** — documents are kept CIMD-compliant (no
  `client_secret` or private-key material leaks; auth method whitelisted) and
  pre-filled with the fields Authlete needs
  (`token_endpoint_auth_signing_alg`, `backchannel_token_delivery_mode`), so a
  pasted client just works.

## How it works

Public configs are **stateless**: encoded into the URL path (`/c/<cfg>`) or
served as the clean default (`/oauth/client-metadata.json`). A config with a
`jwks` is too big for a URL, so it's **stored** under a short content-hash id
(`/s/<id>`) — Vercel Blob in prod, a local `.data/` folder in dev.

`lib/metadata.ts` is the single source of truth for every document (UI, API, and
all routes), and `client_id` is always forced to the serving URL — the one rule
CIMD requires. CORS is open so a browser can fetch and inspect the document while
the AS fetches it server-side.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run format     # Prettier
```

Deploys to Vercel with zero config and auto-deploys on push to `main`. For
hosted confidential clients, connect a Blob store (provides
`BLOB_READ_WRITE_TOKEN`); dev falls back to `.data/`. See `CLAUDE.md` for the
architecture, invariants, and conventions.
