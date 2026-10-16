// GET /oauth/client-metadata.json — the all-defaults public client, at a clean
// URL that mirrors the vscode.dev example. This IS a usable client_id.

import { buildMetadata, metadataResponse, serveUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic"; // client_id depends on the request host

export function GET(request: Request) {
  const url = serveUrl(request.headers, "/oauth/client-metadata.json");
  return metadataResponse(buildMetadata({}, url));
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
