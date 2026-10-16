// GET /c/<base64url-overrides>/client-metadata.json — a customized document.
// The overrides ride in the path (not a query — the spec says client_id SHOULD
// NOT contain a query), so this stays stateless: the URL is the whole state.

import {
  buildMetadata,
  decodeConfig,
  metadataResponse,
  serveUrl,
} from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ config: string }> },
) {
  const { config } = await params;
  const url = serveUrl(request.headers, `/c/${config}/client-metadata.json`);
  return metadataResponse(buildMetadata(decodeConfig(config), url));
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}
