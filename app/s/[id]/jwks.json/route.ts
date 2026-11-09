// GET /s/<id>/jwks.json — the public JWKS for a stored (confidential) client.
// The document at /s/<id>/client-metadata.json references this URL via jwks_uri
// (what Poppy requires) instead of embedding the keys. Same store, same host as
// the document, so if the AS can fetch the client_id it can fetch this.

import { metadataResponse, publicJwks } from "@/lib/metadata";
import { getClient } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getClient(id);
  if (!stored) return new Response("Not found", { status: 404 });
  const jwks = publicJwks(JSON.parse(stored));
  if (!jwks) return new Response("Not found", { status: 404 });
  return metadataResponse(jwks);
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
