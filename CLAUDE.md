# makeclient

Hosts OAuth **Client ID Metadata Documents** (CIMD): a URL that _is_ a usable
`client_id`, no registration. Next.js (App Router) on Vercel, no database for
the common case. Built to exercise Authlete-based authorization servers. See
`README.md` for product/usage details.

## Commands

```bash
npm install
npm run dev
npm run build
npm run format
npm run format:check
```

`node_modules` isn't committed — run `npm install` first (`tsc` and the build
fail without it). Dev server runs at http://localhost:3000. No test suite;
Prettier is the only linter — run `npm run format` before committing.

## Architecture

`lib/metadata.ts` is the **single source of truth**. `buildMetadata(overrides,
clientId)` produces every document, and the UI preview, the POST API, and all
three GET routes call it. **Add fields or behavior here, not in the call
sites** — that's how every surface stays consistent.

- `app/oauth/client-metadata.json/route.ts` — all-defaults public client.
- `app/c/[config]/client-metadata.json/route.ts` — stateless; base64url of the
  overrides rides in the path (no query, per spec).
- `app/s/[id]/client-metadata.json/route.ts` — stored config (a `jwks` is too
  big for a URL); persisted via `lib/store.ts`.
- `app/api/clients/route.ts` — POST entry. Mints an ES256 keypair for
  `private_key_jwt`, returns `{ client_id, private_key }`; the private key is
  never stored.
- `lib/store.ts` — private Vercel Blob in prod (`BLOB_READ_WRITE_TOKEN`), a
  local `.data/` folder in dev.
- `app/page.tsx` + `app/globals.css` — the UI (client component) and styling.
  State lives in `page.tsx`; it builds `overrides` and previews through the same
  `buildMetadata`.

## Invariants — don't break these

- **`client_id` must equal the HTTPS URL the document is served from** (CIMD's
  one hard rule). `buildMetadata` forces it; it is never overridable.
- **`enforceCompliance` (in `metadata.ts`) is load-bearing.** It strips what a
  public document must not carry (`client_secret`, private JWK members) and
  fills Authlete-required fields: `token_endpoint_auth_signing_alg` for
  `private_key_jwt` and
  `backchannel_token_delivery_mode: "poll"` when the CIBA grant is present.
- **`CONFIDENTIAL_GRANTS`** (`client_credentials`, CIBA, `jwt-bearer`) are valid
  only with `private_key_jwt`; the UI auto-enables them on that method.
- **Overrides merge over `DEFAULTS`, and `prune` drops empty values** — so an
  override of `""` falls back to the default rather than blanking the field.
- Confidential (jwks-bearing) configs → stored under a content-hash id (`/s/`).
  Public configs → stateless in the path (`/c/`) or the clean default
  (`/oauth`).
- CORS is `*` on purpose: the AS fetches the document server-side, the browser
  inspects it client-side.

## Conventions

- Prettier, 80-column width. Keep lines wrapped; run `npm run format`.
- Conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`).
- Code in `lib/` is **universal** (runs in both the browser and Node) — no
  `Buffer` or Node-only APIs there; `encodeConfig`/`decodeConfig` use
  `btoa`/`atob`.
- Styling is plain CSS in `app/globals.css` using the Authlete Figma design
  tokens (`--surface-*`, `--text-*`, `--authlete-primary`). Fonts are Geist /
  Geist Mono via `next/font` in `app/layout.tsx`. **Light theme only.**
- Import alias: `@/` → repo root (e.g. `@/lib/metadata`).

## Deploy

Vercel, zero-config, auto-deploys on push to `main`. Confidential clients need a
Blob store (`BLOB_READ_WRITE_TOKEN`); dev falls back to `.data/`.
