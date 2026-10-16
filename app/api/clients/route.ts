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

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let overrides: Overrides = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") overrides = body as Overrides;
  } catch {
    // empty / non-JSON body → all defaults
  }

  // No overrides → the clean canonical URL; otherwise encode them into the path.
  const hasOverrides = Object.keys(overrides).length > 0;
  const path = hasOverrides
    ? `/c/${encodeConfig(overrides)}/client-metadata.json`
    : "/oauth/client-metadata.json";
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
