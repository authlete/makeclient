// CIMD (Client ID Metadata Document) builder — the one source of truth shared
// by the hosting routes, the POST API, and the UI preview.
//
// Spec: draft-ietf-oauth-client-id-metadata-document. The only hard rule we
// must enforce is that the document's `client_id` equals the HTTPS URL it is
// served from (simple string comparison), with no query component. Everything
// else is RFC 7591 client metadata and is optional — so a request with no input
// still yields a complete, usable public client.

export type Overrides = Record<string, unknown>;

/** Redirect URIs used when the caller specifies none. Override to your own. */
export const DEFAULT_REDIRECT_URIS = [
  "http://localhost:5173/callback",
  "https://authlete-playground.vercel.app/callback",
];

/** Defaults for a public (token_endpoint_auth_method=none) auth-code + refresh +
 * device client — the common case. */
export const DEFAULTS: Overrides = {
  client_name: "makeclient test client",
  client_uri: "https://www.makeclient.dev",
  redirect_uris: DEFAULT_REDIRECT_URIS,
  grant_types: [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  scope: "openid profile email",
  // RAR (RFC 9396): the authorization_details types this client may request.
  // Overridable via the advanced custom JSON.
  authorization_details_types: [
    "Accounts",
    "CreditCardAccounts",
    "SinglePayments",
  ],
};

const CIBA_GRANT = "urn:openid:params:grant-type:ciba";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/** Grants that require client authentication, so they're valid only with
 * private_key_jwt. A confidential client gets these on by default (it holds a
 * key); a public client never does. jwt-bearer (RFC 7523) rides here too: the
 * client signs the assertion with the same key it authenticates with. */
export const CONFIDENTIAL_GRANTS = [
  "client_credentials",
  CIBA_GRANT,
  JWT_BEARER_GRANT,
];

/** Drop undefined/null/""/[] so overrides only replace what they actually set. */
function prune(obj: Overrides): Overrides {
  const out: Overrides = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// CIMD rules out shared-secret client auth (the document is public). Of the
// asymmetric methods the spec leaves open, this tool supports the two that are
// actually usable here: `none` (public + PKCE) and `private_key_jwt`.
// Whitelist, not blacklist — anything else falls back to none.
const PERMITTED_AUTH = new Set(["none", "private_key_jwt"]);
// A public document MUST NOT carry private key material (§4.1).
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "k", "oth"];

/** The `alg` of the first key in a jwks that declares one, if any. */
function firstKeyAlg(jwks: unknown): string | undefined {
  const keys = (jwks as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) return undefined;
  for (const k of keys) {
    if (
      k &&
      typeof k === "object" &&
      typeof (k as { alg?: unknown }).alg === "string"
    ) {
      return (k as { alg: string }).alg;
    }
  }
  return undefined;
}

function stripPrivateKeys(jwks: unknown): unknown {
  if (!jwks || typeof jwks !== "object") return jwks;
  const keys = (jwks as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return jwks;
  return {
    ...(jwks as object),
    keys: keys.map((k) => {
      if (!k || typeof k !== "object") return k;
      const pub = { ...(k as Record<string, unknown>) };
      for (const m of PRIVATE_JWK_MEMBERS) delete pub[m];
      return pub;
    }),
  };
}

/** Remove anything the spec forbids in a public CIMD document. */
function enforceCompliance(doc: Overrides): Overrides {
  const out = { ...doc };
  delete out.client_secret;
  delete out.client_secret_expires_at;
  if (
    typeof out.token_endpoint_auth_method !== "string" ||
    !PERMITTED_AUTH.has(out.token_endpoint_auth_method)
  ) {
    out.token_endpoint_auth_method = "none";
  }
  if ("jwks" in out) out.jwks = stripPrivateKeys(out.jwks);
  // private_key_jwt needs a known assertion signature algorithm. CIMD leaves it
  // optional, but Authlete (and FAPI) require it — without it Authlete rejects
  // the client with A157306. Derive it from the key's own `alg` when the caller
  // didn't set it; ES256 matches the keypair makeclient mints.
  if (
    out.token_endpoint_auth_method === "private_key_jwt" &&
    typeof out.token_endpoint_auth_signing_alg !== "string"
  ) {
    out.token_endpoint_auth_signing_alg = firstKeyAlg(out.jwks) ?? "ES256";
  }
  // CIBA requires a token delivery mode registered. The playground polls, so
  // default to "poll" when the grant is present and no mode was set.
  if (
    Array.isArray(out.grant_types) &&
    out.grant_types.includes(CIBA_GRANT) &&
    typeof out.backchannel_token_delivery_mode !== "string"
  ) {
    out.backchannel_token_delivery_mode = "poll";
  }
  return out;
}

/** Build the document: defaults ← overrides, with `client_id` forced to the
 * serving URL (never overridable — the spec ties identity to the URL), then
 * stripped of anything a public CIMD document must not contain. */
export function buildMetadata(
  overrides: Overrides,
  clientId: string,
): Overrides {
  const merged = prune({ ...DEFAULTS, ...prune(overrides) });
  delete merged.client_id; // identity comes from the URL, not the body
  return enforceCompliance(prune({ client_id: clientId, ...merged }));
}

// ── config <-> path segment (base64url of the overrides JSON) ────────────────
// Universal (browser + Node 18+): no Buffer, so the UI and the routes share it.

export function encodeConfig(overrides: Overrides): string {
  const bytes = new TextEncoder().encode(JSON.stringify(prune(overrides)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Tolerant: an unparseable segment (or the literal "default") yields {} so the
 * endpoint still serves a valid defaults document rather than erroring. */
export function decodeConfig(segment: string): Overrides {
  if (!segment || segment === "default") return {};
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? (parsed as Overrides) : {};
  } catch {
    return {};
  }
}

/** The absolute HTTPS URL this request is being served from — the value the AS
 * fetched, so it matches the document's client_id. Built from forwarded headers
 * (Vercel sets them) and forced to https except on localhost. */
export function serveUrl(headers: Headers, path: string): string {
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/** 200 application/json with permissive CORS (the document is public; clients
 * fetch it client-side to inspect it — the AS fetches it server-side). */
export function metadataResponse(doc: Overrides): Response {
  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}
