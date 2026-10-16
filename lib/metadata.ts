// CIMD (Client ID Metadata Document) builder — the one source of truth shared
// by the hosting routes, the POST API, and the UI preview.
//
// Spec: draft-ietf-oauth-client-id-metadata-document. The only hard rule we
// must enforce is that the document's `client_id` equals the HTTPS URL it is
// served from (simple string comparison), with no query component. Everything
// else is RFC 7591 client metadata and is optional — so a request with no input
// still yields a complete, usable public client.

export type Overrides = Record<string, unknown>;

/** Redirect URIs used when the caller doesn't specify any: the oauth-playground
 * debugger (local + deployed) plus a loopback variant. Override to your own. */
export const DEFAULT_REDIRECT_URIS = [
  "http://localhost:5173/callback",
  "http://127.0.0.1:5173/callback",
  "https://authlete-playground.vercel.app/callback",
];

/** Defaults for a public (token_endpoint_auth_method=none) auth-code + refresh +
 * device client — the common case for a browser/native debugger. */
export const DEFAULTS: Overrides = {
  client_name: "makeclient test client",
  redirect_uris: DEFAULT_REDIRECT_URIS,
  grant_types: [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  scope: "openid profile email",
};

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

/** Build the document: defaults ← overrides, with `client_id` forced to the
 * serving URL (never overridable — the spec ties identity to the URL). */
export function buildMetadata(overrides: Overrides, clientId: string): Overrides {
  const merged = prune({ ...DEFAULTS, ...prune(overrides) });
  delete merged.client_id; // identity comes from the URL, not the body
  return { client_id: clientId, ...merged };
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

/** 200 application/json with permissive CORS (the document is public; debuggers
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
