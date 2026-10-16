"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMetadata,
  encodeConfig,
  DEFAULTS,
  DEFAULT_REDIRECT_URIS,
  type Overrides,
} from "@/lib/metadata";

const GRANT_OPTIONS = [
  "authorization_code",
  "refresh_token",
  "urn:ietf:params:oauth:grant-type:device_code",
  "client_credentials",
] as const;

const RESPONSE_OPTIONS = ["code", "token", "id_token"] as const;

const AUTH_METHODS = [
  "none",
  "client_secret_basic",
  "client_secret_post",
  "private_key_jwt",
  "tls_client_auth",
  "self_signed_tls_client_auth",
] as const;

const eq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export default function Home() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const [clientName, setClientName] = useState(DEFAULTS.client_name as string);
  const [redirects, setRedirects] = useState(DEFAULT_REDIRECT_URIS.join("\n"));
  const [grants, setGrants] = useState<string[]>(
    DEFAULTS.grant_types as string[],
  );
  const [responses, setResponses] = useState<string[]>(
    DEFAULTS.response_types as string[],
  );
  const [authMethod, setAuthMethod] = useState(
    DEFAULTS.token_endpoint_auth_method as string,
  );
  const [scope, setScope] = useState(DEFAULTS.scope as string);
  const [raw, setRaw] = useState("");
  const [copied, setCopied] = useState(false);

  const toggle = (
    list: string[],
    set: (v: string[]) => void,
    value: string,
  ) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const { overrides, rawError } = useMemo(() => {
    const o: Overrides = {};
    if (clientName !== DEFAULTS.client_name) o.client_name = clientName;
    const ru = redirects
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!eq(ru, DEFAULT_REDIRECT_URIS)) o.redirect_uris = ru;
    if (!eq(grants, DEFAULTS.grant_types as string[])) o.grant_types = grants;
    if (!eq(responses, DEFAULTS.response_types as string[]))
      o.response_types = responses;
    if (authMethod !== DEFAULTS.token_endpoint_auth_method)
      o.token_endpoint_auth_method = authMethod;
    if (scope !== DEFAULTS.scope) o.scope = scope;

    let rawError = "";
    if (raw.trim()) {
      try {
        Object.assign(o, JSON.parse(raw));
      } catch {
        rawError = "Advanced overrides are not valid JSON — ignoring them.";
      }
    }
    return { overrides: o, rawError };
  }, [clientName, redirects, grants, responses, authMethod, scope, raw]);

  const hasOverrides = Object.keys(overrides).length > 0;
  const path = hasOverrides
    ? `/c/${encodeConfig(overrides)}/client-metadata.json`
    : "/oauth/client-metadata.json";
  const clientId = origin ? origin + path : path;
  const doc = buildMetadata(overrides, clientId);

  const copy = async () => {
    await navigator.clipboard.writeText(clientId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
          {GRANT_OPTIONS.map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                checked={grants.includes(g)}
                onChange={() => toggle(grants, setGrants, g)}
              />
              {g.replace("urn:ietf:params:oauth:grant-type:", "")}
            </label>
          ))}
        </div>

        <label>response_types</label>
        <div className="checks">
          {RESPONSE_OPTIONS.map((r) => (
            <label key={r}>
              <input
                type="checkbox"
                checked={responses.includes(r)}
                onChange={() => toggle(responses, setResponses, r)}
              />
              {r}
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
        {authMethod !== "none" && (
          <p className="hint">
            Key-based methods also need a <code>jwks</code>/<code>jwks_uri</code>{" "}
            in the document (add it under Advanced).
          </p>
        )}

        <label>scope</label>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />

        <details style={{ marginTop: 16 }}>
          <summary>Advanced — any other RFC 7591 field (raw JSON)</summary>
          <textarea
            rows={5}
            placeholder={'{\n  "logo_uri": "https://…/logo.png",\n  "jwks_uri": "https://…/jwks.json"\n}'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {rawError && <p className="hint" style={{ color: "#e0603a" }}>{rawError}</p>}
        </details>
      </div>

      <div className="panel">
        <p className="lead">Your client_id</p>
        <div className="url">
          <input type="text" readOnly value={clientId} />
          <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
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
