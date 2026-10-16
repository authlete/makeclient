# makeclient

Generate and **host** an OAuth [Client ID Metadata Document][cimd] (CIMD) at a
URL you can use directly as a `client_id` — no registration, no database, no
backend state. The URL *is* the client.

Think "mkjwk, but for a whole client": mkjwk hands you a key but won't host it;
validators lint a document you host yourself. makeclient hosts a working one.

[cimd]: https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/

## How it works

A CIMD `client_id` is a URL; the authorization server fetches the metadata
document from it, and the document's `client_id` MUST equal that URL (and SHOULD
NOT carry a query). So the config is encoded **in the path** — the app is
completely stateless.

| Route | Purpose |
| --- | --- |
| `GET /oauth/client-metadata.json` | the all-defaults public client (clean URL) |
| `GET /c/<base64url-overrides>/client-metadata.json` | a customized document |
| `POST /api/clients` | `{overrides}` → `{ client_id, metadata }` (for tools) |
| `/` | a thin form UI over the same builder |

`lib/metadata.ts` is the single source of truth for defaults, encoding, and the
document shape; every route and the UI go through it.

## Defaults (override any of them)

Only `client_id` is mandatory, and the server always sets it to the serving URL.
Everything else defaults to a public, PKCE-ready client:

```json
{
  "client_name": "makeclient test client",
  "redirect_uris": [
    "http://localhost:5173/callback",
    "http://127.0.0.1:5173/callback",
    "https://authlete-playground.vercel.app/callback"
  ],
  "grant_types": ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "openid profile email"
}
```

## Use it

```bash
# default public client
curl https://makeclient.dev/oauth/client-metadata.json

# customized — get back the client_id URL to use
curl -s https://makeclient.dev/api/clients \
  -H 'content-type: application/json' \
  -d '{"redirect_uris":["https://app.example/cb"],"scope":"openid email"}'
# → { "client_id": "https://makeclient.dev/c/<...>/client-metadata.json", "metadata": { ... } }
```

Then paste the `client_id` URL into any CIMD-capable AS (or the oauth-playground
as a manual `client_id`).

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

Deploys to Vercel with zero config (auto-detected Next.js). The document's
`client_id` is derived from the request host, so it is correct on any domain.

## Not yet

Confidential clients (`private_key_jwt`) need a public key in the document; you
can already supply your own `jwks`/`jwks_uri` under **Advanced**. Server-side key
generation + dispensing (the "handed a private key" flow) is the next step and
is deliberately out of this stateless v1.
