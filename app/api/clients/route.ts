// POST /api/clients — the programmatic entry point (e.g. the playground calls
// this). Body = any subset of CIMD / RFC 7591 metadata to override. Returns the
// hosted client_id URL plus the full document. Stateless: the URL encodes the
// config, so there is nothing to persist.

import {
  buildMetadata,
  encodeConfig,
  serveUrl,
  type Overrides,
} from "@/lib/metadata";
import { clientId as hashId, putClient } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let overrides: Overrides = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") overrides = body as Overrides;
  } catch {
    // empty / non-JSON body → all defaults
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
  const clientId = serveUrl(request.headers, path);

  return new Response(
    JSON.stringify(
      { client_id: clientId, metadata: buildMetadata(overrides, clientId) },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    },
  );
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
