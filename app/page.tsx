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

const grantLabel = (g: string) =>
  g
    .replace("urn:ietf:params:oauth:grant-type:", "")
    .replace("urn:openid:params:grant-type:", "");

// The official Authlete logo, composed from the shield + wordmark SVGs exactly
// as positioned in the Figma design (same insets at both sizes).
function AuthleteLogo({ variant }: { variant: "header" | "footer" }) {
  const p = variant === "header" ? "hdr" : "ftr";
  return (
    <span
      className={`authlete-logo authlete-logo--${variant}`}
      aria-label="Authlete"
    >
      <span className="al-shield">
        <img src={`/authlete/${p}-shield.svg`} alt="" />
      </span>
      <span className="al-wordmark">
        <img src={`/authlete/${p}-wordmark.svg`} alt="" />
      </span>
    </span>
  );
}

// Minimal JSON highlighter: property names in Authlete blue, everything else in
// the normal text color — matching the Document panel in the design.
function highlightJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  const esc = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)/g,
    '<span class="json-key">$1</span>$2',
  );
}

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

  // client_name and scope default to empty so the field shows the default as a
  // placeholder (matching the design); an empty value is pruned, so the
  // document still carries the default.
  const [clientName, setClientName] = useState("");
  const [redirects, setRedirects] = useState(DEFAULT_REDIRECT_URIS.join("\n"));
  const [grants, setGrants] = useState<string[]>(
    DEFAULTS.grant_types as string[],
  );
  const [authMethod, setAuthMethod] = useState("none");
  const [scope, setScope] = useState("");
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
  // config, computed here for a live preview and uploaded on "Create".
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
    <>
      <header className="site-header">
        <div className="brand">
          <AuthleteLogo variant="header" />
          <span className="brand-sep">/</span>
          <span className="brand-product">
            <span className="brand-name">makeclient</span>
            <span className="badge">CIMD</span>
          </span>
        </div>
        <nav>
          <a
            className="btn btn-primary"
            href="https://www.authlete.com/"
            target="_blank"
            rel="noreferrer"
          >
            Try Authlete free
          </a>
        </nav>
      </header>

      <main className="page">
        <section className="hero">
          <h1>Instant CIMD client</h1>
          <p className="hero-sub">
            Hosted OAuth Client ID Metadata Document (CIMD). The URL is a usable
            client_id.
          </p>
        </section>

        <section className="card clientid-card">
          <p className="clientid-label">Your client_id</p>
          <div className="clientid-row">
            <div className="clientid-value">
              <input type="text" readOnly value={clientId} />
            </div>
            {confidential && !hosted ? (
              <button
                type="button"
                className="btn btn-tertiary"
                onClick={hostClient}
                disabled={hosting || !previewId}
              >
                {hosting ? "Creating…" : "Create"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-tertiary"
                onClick={() => copy(clientId, "url")}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          {confidential && hosted && <p className="hint">Created ✓</p>}
        </section>

        <div className="columns">
          <section className="card">
            <div className="card-header">
              <h2>Configure</h2>
            </div>
            <div className="form">
              <div className="field field-input">
                <label htmlFor="client_name">client_name</label>
                <input
                  id="client_name"
                  className="input"
                  type="text"
                  placeholder={DEFAULTS.client_name as string}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="field field-redirect">
                <label htmlFor="redirect_uris">
                  redirect_uris (one per line)
                </label>
                <textarea
                  id="redirect_uris"
                  className="textarea"
                  rows={3}
                  value={redirects}
                  onChange={(e) => setRedirects(e.target.value)}
                />
              </div>

              <div className="field">
                <span className="label">grant_types</span>
                <div className="checks">
                  {grantOptions.map((g) => (
                    <label className="check" key={g}>
                      <input
                        type="checkbox"
                        checked={grants.includes(g)}
                        onChange={() => toggle(g)}
                      />
                      {grantLabel(g)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="label">token_endpoint_auth_method</span>
                <div className="radios">
                  {AUTH_METHODS.map((m) => (
                    <label className="radio" key={m}>
                      <input
                        type="radio"
                        name="auth_method"
                        checked={authMethod === m}
                        onChange={() => setAuthMethod(m)}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>

              {authMethod === "private_key_jwt" && (
                <div className="keybox">
                  <div className="keybox-head">
                    <span className="keybox-title">Keypair · ES256</span>
                    <button
                      className="btn-regen"
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
                        <button
                          type="button"
                          onClick={() => copy(privateJwk, "key")}
                        >
                          {copiedKey ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre>{privateJwk}</pre>
                    </div>
                  )}
                </div>
              )}

              <div className="field field-input">
                <label htmlFor="scope">scope</label>
                <input
                  id="scope"
                  className="input"
                  type="text"
                  placeholder={DEFAULTS.scope as string}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </div>

              <details className="advanced">
                <summary>
                  <img
                    className="chevron"
                    src="/authlete/chevron-right.svg"
                    alt=""
                  />
                  Advanced (raw JSON)
                </summary>
                <textarea
                  className="textarea"
                  rows={5}
                  placeholder={
                    '{\n  "logo_uri": "https://…/logo.png",\n  "contacts": ["dev@example.com"]\n}'
                  }
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
                {rawError && <p className="hint error">{rawError}</p>}
              </details>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Document</h2>
              {(!confidential || hosted) && (
                <a
                  className="btn btn-ghost"
                  href={path}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open ↗
                </a>
              )}
            </div>
            <div className="code">
              <pre dangerouslySetInnerHTML={{ __html: highlightJson(doc) }} />
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-content">
          <AuthleteLogo variant="footer" />
          <p className="copyright">
            © 2026 Authlete, Inc. All rights reserved.
          </p>
          <p className="lang">English</p>
        </div>
      </footer>
    </>
  );
}
