// POST /api/clients — the programmatic entry point (e.g. the debugger calls
// this). Body = any subset of CIMD / RFC 7591 metadata to override. Returns the
// hosted client_id URL, plus a freshly generated private_key when you ask for
// private_key_jwt without supplying your own jwks. The URL *is* the metadata —
// fetch it to see the document — so the response stays lean.

import {
  CONFIDENTIAL_GRANTS,
  DEFAULTS,
  encodeConfig,
  serveUrl,
  type Overrides,
} from "@/lib/metadata";
import { clientId as hashId, putClient } from "@/lib/store";

export const dynamic = "force-dynamic";

async function generateKeypair() {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pub = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as Record<
    string,
    unknown
  >;
  const prv = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as Record<
    string,
    unknown
  >;
  const kid = crypto.randomUUID();
  return {
    publicJwk: {
      kty: "EC",
      crv: "P-256",
      x: pub.x,
      y: pub.y,
      use: "sig",
      alg: "ES256",
      kid,
    },
    privateJwk: { ...prv, alg: "ES256", kid },
  };
}

export async function POST(request: Request) {
  let overrides: Overrides = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") overrides = body as Overrides;
  } catch {
    // empty / non-JSON body → all defaults
  }

  // private_key_jwt with no key → mint one (as the UI does): embed the public
  // half in the document, return the private half. The private key is never
  // stored. A caller that supplies its own jwks keeps it.
  let privateKey: Record<string, unknown> | undefined;
  if (
    overrides.token_endpoint_auth_method === "private_key_jwt" &&
    !overrides.jwks
  ) {
    const { publicJwk, privateJwk } = await generateKeypair();
    overrides = { ...overrides, jwks: { keys: [publicJwk] } };
    privateKey = privateJwk;
  }

  // A private_key_jwt client can authenticate, so default it to the full grant
  // set — including client_credentials and CIBA — unless the caller set their
  // own grant_types. The hosted document then advertises them all.
  if (
    overrides.token_endpoint_auth_method === "private_key_jwt" &&
    !overrides.grant_types
  ) {
    overrides = {
      ...overrides,
      grant_types: [
        ...(DEFAULTS.grant_types as string[]),
        ...CONFIDENTIAL_GRANTS,
      ],
    };
  }

  // A jwks is too big for the URL → persist and issue a short id. Otherwise the
  // config fits in the path (no overrides → the clean canonical URL).
  let path: string;
  if (overrides.jwks && typeof overrides.jwks === "object") {
    const canonical = JSON.stringify(overrides);
    const id = await hashId(canonical);
    await putClient(id, canonical);
    path = `/s/${id}/client-metadata.json`;
  } else if (Object.keys(overrides).length > 0) {
    path = `/c/${encodeConfig(overrides)}/client-metadata.json`;
  } else {
    path = "/oauth/client-metadata.json";
  }

  const result: Record<string, unknown> = {
    client_id: serveUrl(request.headers, path),
  };
  if (privateKey) result.private_key = privateKey;

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
