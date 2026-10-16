// GET /s/<id>/client-metadata.json — a stored (confidential) client. The config
// is too big for the URL (it carries a jwks), so it lives in the store; the id
// is short. client_id is always set to this serving URL.

import { buildMetadata, metadataResponse, serveUrl } from "@/lib/metadata";
import { getClient } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getClient(id);
  if (!stored) return new Response("Not found", { status: 404 });
  const url = serveUrl(request.headers, `/s/${id}/client-metadata.json`);
  return metadataResponse(buildMetadata(JSON.parse(stored), url));
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
