"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMetadata,
  encodeConfig,
  DEFAULTS,
  DEFAULT_REDIRECT_URIS,
  type Overrides,
} from "@/lib/metadata";

const BASE_GRANTS = [
  "authorization_code",
  "refresh_token",
  "urn:ietf:params:oauth:grant-type:device_code",
];
// client_credentials needs client authentication — valid only with private_key_jwt.
const CONFIDENTIAL_GRANTS = ["client_credentials"];

// CIMD forbids shared-secret auth; `none` and `private_key_jwt` are the two
// methods both valid and usable against a browser/native debugger.
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
      if (d.client_id) setPreviewId(new URL(d.client_id).pathname.split("/")[2]);
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
        Generate and host an OAuth{" "}
        <strong>Client ID Metadata Document</strong> (CIMD). The URL below is a
        working <code>client_id</code> — no registration. Defaults give a public,
        PKCE-ready client pointed at the oauth-playground.
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
        <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
          {AUTH_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="hint">
          CIMD forbids shared secrets — only a public client (<code>none</code>{" "}
          + PKCE) or <code>private_key_jwt</code> are valid.
        </p>

        {authMethod === "private_key_jwt" && (
          <div className="keybox">
            <div className="row" style={{ marginTop: 0 }}>
              <strong style={{ fontSize: 13 }}>
                private_key_jwt keypair (ES256)
              </strong>
              <button className="ghost" type="button" onClick={() => void generateKey()}>
                Regenerate
              </button>
            </div>
            <p className="hint">
              The public key is embedded in the document. The private key below{" "}
              <strong>stays in your browser</strong> — copy it into the
              debugger&apos;s <code>private_key_jwt</code> key field.
            </p>
            {privateJwk && (
              <>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="lead" style={{ margin: 0 }}>
                    Private key (JWK)
                  </span>
                  <button type="button" onClick={() => copy(privateJwk, "key")}>
                    {copiedKey ? "Copied" : "Copy private key"}
                  </button>
                </div>
                <pre style={{ marginTop: 6 }}>{privateJwk}</pre>
              </>
            )}
          </div>
        )}

        <label>scope</label>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />
        <p className="hint">Free-form per RFC 7591 — CIMD does not restrict scope.</p>

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
          {confidential && !hosted ? (
            <button type="button" onClick={hostClient} disabled={hosting || !previewId}>
              {hosting ? "Hosting…" : "Host client →"}
            </button>
          ) : (
            <button type="button" onClick={() => copy(clientId, "url")}>
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        {confidential && (
          <p className="hint">
            {hosted
              ? "Hosted ✓"
              : "Carries a key, so it's served from a short hosted URL — Host it and the URL goes live."}
          </p>
        )}
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
