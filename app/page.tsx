"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMetadata,
  encodeConfig,
  CONFIDENTIAL_GRANTS,
  DEFAULTS,
  DEFAULT_REDIRECT_URIS,
  type Overrides,
} from "@/lib/metadata";

// A public client's grants; a confidential one adds CONFIDENTIAL_GRANTS.
const BASE_GRANTS = DEFAULTS.grant_types as string[];

// CIMD forbids shared-secret auth; `none` and `private_key_jwt` are the two
// asymmetric methods a public document can support.
const AUTH_METHODS = ["none", "private_key_jwt"] as const;

const eq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

type Jwk = Record<string, unknown>;

async function shortId(overrides: Overrides): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(overrides)),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Home() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const [clientName, setClientName] = useState(DEFAULTS.client_name as string);
  const [redirects, setRedirects] = useState(DEFAULT_REDIRECT_URIS.join("\n"));
  const [grants, setGrants] = useState<string[]>(
    DEFAULTS.grant_types as string[],
  );
  const [authMethod, setAuthMethod] = useState("none");
  const [scope, setScope] = useState(DEFAULTS.scope as string);
  const [raw, setRaw] = useState("");

  const [publicJwk, setPublicJwk] = useState<Jwk | null>(null);
  const [privateJwk, setPrivateJwk] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  async function generateKey() {
    const kp = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pub = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as Jwk;
    const prv = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as Jwk;
    const kid = crypto.randomUUID();
    setPublicJwk({
      kty: "EC",
      crv: "P-256",
      x: pub.x,
      y: pub.y,
      use: "sig",
      alg: "ES256",
      kid,
    });
    setPrivateJwk(JSON.stringify({ ...prv, alg: "ES256", kid }, null, 2));
  }

  useEffect(() => {
    if (authMethod === "private_key_jwt" && !publicJwk) void generateKey();
  }, [authMethod, publicJwk]);

  const grantOptions =
    authMethod === "private_key_jwt"
      ? [...BASE_GRANTS, ...CONFIDENTIAL_GRANTS]
      : BASE_GRANTS;

  // private_key_jwt can authenticate, so default its confidential grants on;
  // a public client drops them. Keyed on authMethod so manual toggles stick.
  useEffect(() => {
    setGrants((g) => {
      const base = g.filter((x) => !CONFIDENTIAL_GRANTS.includes(x));
      return authMethod === "private_key_jwt"
        ? [...base, ...CONFIDENTIAL_GRANTS]
        : base;
    });
  }, [authMethod]);

  const toggle = (value: string) =>
    setGrants((g) =>
      g.includes(value) ? g.filter((v) => v !== value) : [...g, value],
    );

  const { overrides, rawError } = useMemo(() => {
    const o: Overrides = {};
    if (clientName !== DEFAULTS.client_name) o.client_name = clientName;
    const ru = redirects
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!eq(ru, DEFAULT_REDIRECT_URIS)) o.redirect_uris = ru;
    if (!eq(grants, DEFAULTS.grant_types as string[])) o.grant_types = grants;
    if (scope !== DEFAULTS.scope) o.scope = scope;
    if (authMethod === "private_key_jwt" && publicJwk) {
      o.token_endpoint_auth_method = "private_key_jwt";
      o.jwks = { keys: [publicJwk] };
    }
    let rawError = "";
    if (raw.trim()) {
      try {
        Object.assign(o, JSON.parse(raw));
      } catch {
        rawError = "Advanced overrides are not valid JSON — ignoring them.";
      }
    }
    return { overrides: o, rawError };
  }, [clientName, redirects, grants, scope, authMethod, publicJwk, raw]);

  const confidential = !!overrides.jwks;

  // Public clients encode into the URL (stateless). Confidential clients are too
  // big for the URL, so they get a short stored id — the id is the hash of the
  // config, computed here for a live preview and uploaded on "Host".
  const [previewId, setPreviewId] = useState("");
  const [hostedId, setHostedId] = useState(""); // which config is actually stored
  const [hosting, setHosting] = useState(false);
  useEffect(() => {
    if (!confidential) return;
    void shortId(overrides).then(setPreviewId);
  }, [confidential, overrides]);

  const path = confidential
    ? `/s/${previewId}/client-metadata.json`
    : Object.keys(overrides).length > 0
      ? `/c/${encodeConfig(overrides)}/client-metadata.json`
      : "/oauth/client-metadata.json";
  const clientId = origin ? origin + path : path;
  const hosted = confidential && hostedId === previewId && !!previewId;
  const doc = buildMetadata(overrides, clientId);

  async function hostClient() {
    setHosting(true);
    try {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(overrides),
      });
      const d = await r.json();
      setHostedId(await shortId(overrides));
      if (d.client_id)
        setPreviewId(new URL(d.client_id).pathname.split("/")[2]);
    } finally {
      setHosting(false);
    }
  }

  const copy = async (text: string, which: "url" | "key") => {
    await navigator.clipboard.writeText(text);
    const set = which === "url" ? setCopied : setCopiedKey;
    set(true);
    setTimeout(() => set(false), 1500);
  };

  return (
    <main>
      <h1>makeclient</h1>
      <p className="sub">
        Hosted OAuth client metadata (<strong>CIMD</strong>) — the URL is a
        usable <code>client_id</code>.
      </p>

      <div className="panel">
        <p className="lead">Your client_id</p>
        <div className="url">
          <input type="text" readOnly value={clientId} />
          {confidential && !hosted ? (
            <button
              type="button"
              onClick={hostClient}
              disabled={hosting || !previewId}
            >
              {hosting ? "Creating…" : "Create"}
            </button>
          ) : (
            <button type="button" onClick={() => copy(clientId, "url")}>
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        {confidential && hosted && <p className="hint">Created ✓</p>}
      </div>

      <div className="panel">
        <p className="lead">Configure</p>
        <label>client_name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />

        <label>redirect_uris (one per line)</label>
        <textarea
          rows={3}
          value={redirects}
          onChange={(e) => setRedirects(e.target.value)}
        />

        <label>grant_types</label>
        <div className="checks">
          {grantOptions.map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                checked={grants.includes(g)}
                onChange={() => toggle(g)}
              />
              {g
                .replace("urn:ietf:params:oauth:grant-type:", "")
                .replace("urn:openid:params:grant-type:", "")}
            </label>
          ))}
        </div>

        <label>token_endpoint_auth_method</label>
        <select
          value={authMethod}
          onChange={(e) => setAuthMethod(e.target.value)}
        >
          {AUTH_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {authMethod === "private_key_jwt" && (
          <div className="keybox">
            <div className="keybox-head">
              <span className="keybox-title">Keypair · ES256</span>
              <button
                className="ghost"
                type="button"
                onClick={() => void generateKey()}
              >
                Regenerate
              </button>
            </div>
            {privateJwk && (
              <div className="secret">
                <div className="secret-head">
                  <span>Private key (JWK) — stays in your browser</span>
                  <button type="button" onClick={() => copy(privateJwk, "key")}>
                    {copiedKey ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre>{privateJwk}</pre>
              </div>
            )}
          </div>
        )}

        <label>scope</label>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />

        <details style={{ marginTop: 16 }}>
          <summary>Advanced (raw JSON)</summary>
          <textarea
            rows={5}
            placeholder={
              '{\n  "logo_uri": "https://…/logo.png",\n  "contacts": ["dev@example.com"]\n}'
            }
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {rawError && (
            <p className="hint" style={{ color: "#e0603a" }}>
              {rawError}
            </p>
          )}
        </details>
      </div>

      <div className="panel">
        <div className="doc-head">
          <p className="lead" style={{ margin: 0 }}>
            Document
          </p>
          {(!confidential || hosted) && (
            <a className="raw" href={path} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          )}
        </div>
        <pre>{JSON.stringify(doc, null, 2)}</pre>
      </div>
    </main>
  );
}
