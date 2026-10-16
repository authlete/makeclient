"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMetadata,
  encodeConfig,
  DEFAULTS,
  DEFAULT_REDIRECT_URIS,
  type Overrides,
} from "@/lib/metadata";

// Flows available to any client.
const BASE_GRANTS = [
  "authorization_code",
  "refresh_token",
  "urn:ietf:params:oauth:grant-type:device_code",
];
// client_credentials needs client authentication, so it's valid only with
// private_key_jwt — never on a public (none) client.
const CONFIDENTIAL_GRANTS = ["client_credentials"];

// CIMD forbids shared-secret auth; `none` and `private_key_jwt` are the two
// methods both valid and usable against a browser/native debugger.
const AUTH_METHODS = ["none", "private_key_jwt"] as const;

const eq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

type Jwk = Record<string, unknown>;

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
  const [copied, setCopied] = useState(false);

  // private_key_jwt: keypair generated in-browser. Public key goes in the
  // document (jwks); the private key is shown once and never leaves the page.
  const [publicJwk, setPublicJwk] = useState<Jwk | null>(null);
  const [privateJwk, setPrivateJwk] = useState<string>("");
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

  // Auto-generate on first switch to private_key_jwt so it's never in a broken
  // state (the method set but no key to verify against).
  useEffect(() => {
    if (authMethod === "private_key_jwt" && !publicJwk) void generateKey();
  }, [authMethod, publicJwk]);

  const grantOptions =
    authMethod === "private_key_jwt"
      ? [...BASE_GRANTS, ...CONFIDENTIAL_GRANTS]
      : BASE_GRANTS;

  // client_credentials needs client auth — drop it if you drop to a public client.
  useEffect(() => {
    if (authMethod !== "private_key_jwt" && grants.includes("client_credentials")) {
      setGrants((g) => g.filter((x) => x !== "client_credentials"));
    }
  }, [authMethod, grants]);

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

  const hasOverrides = Object.keys(overrides).length > 0;
  const path = hasOverrides
    ? `/c/${encodeConfig(overrides)}/client-metadata.json`
    : "/oauth/client-metadata.json";
  const clientId = origin ? origin + path : path;
  const doc = buildMetadata(overrides, clientId);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(clientId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const copyKey = async () => {
    await navigator.clipboard.writeText(privateJwk);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  };

  return (
    <main>
      <h1>makeclient</h1>
      <p className="sub">
        Generate and host an OAuth{" "}
        <strong>Client ID Metadata Document</strong> (CIMD). The URL below is a
        working <code>client_id</code> — no registration, no backend. Defaults
        give a public, PKCE-ready client pointed at the oauth-playground.
      </p>

      <div className="panel">
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
              {g.replace("urn:ietf:params:oauth:grant-type:", "")}
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
        <p className="hint">
          CIMD forbids shared secrets — only a public client (<code>none</code>,
          with PKCE) or <code>private_key_jwt</code> (asymmetric) are valid.
        </p>

        {authMethod === "private_key_jwt" && (
          <div className="keybox">
            <div className="row" style={{ marginTop: 0 }}>
              <strong style={{ fontSize: 13 }}>
                private_key_jwt keypair (ES256)
              </strong>
              <button
                className="ghost"
                onClick={() => void generateKey()}
                type="button"
              >
                Regenerate
              </button>
            </div>
            <p className="hint">
              The public key is embedded in the document (<code>jwks</code>). The
              private key below <strong>stays in your browser</strong> — copy it
              and paste it into the debugger&apos;s <code>private_key_jwt</code>{" "}
              key field.
            </p>
            {privateJwk ? (
              <>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="lead" style={{ margin: 0 }}>
                    Private key (JWK)
                  </span>
                  <button onClick={copyKey} type="button">
                    {copiedKey ? "Copied" : "Copy private key"}
                  </button>
                </div>
                <pre style={{ marginTop: 6 }}>{privateJwk}</pre>
              </>
            ) : (
              <p className="hint">Generating…</p>
            )}
          </div>
        )}

        <label>scope</label>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />
        <p className="hint">
          Free-form per RFC 7591 — CIMD does not restrict scope.
        </p>

        <details style={{ marginTop: 16 }}>
          <summary>Advanced — any other RFC 7591 field (raw JSON)</summary>
          <textarea
            rows={5}
            placeholder={'{\n  "logo_uri": "https://…/logo.png",\n  "contacts": ["dev@example.com"]\n}'}
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
        <p className="lead">Your client_id</p>
        <div className="url">
          <input type="text" readOnly value={clientId} />
          <button onClick={copyUrl}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="row">
          <a href={path} target="_blank" rel="noreferrer">
            Open document ↗
          </a>
          <span style={{ color: "var(--muted)" }}>
            paste into the playground as a manual <code>client_id</code>
          </span>
        </div>
      </div>

      <div className="panel">
        <p className="lead">Document</p>
        <pre>{JSON.stringify(doc, null, 2)}</pre>
      </div>
    </main>
  );
}
