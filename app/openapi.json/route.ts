// GET /openapi.json — a machine-readable description of the create-client API,
// so an agent that lands on makeclient can call it, not just read about it. The
// server URL is derived from the request so it's correct on any host. CORS is
// open so agents can fetch it cross-origin (like the metadata documents).

import { serveUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = serveUrl(request.headers, "");

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "makeclient API",
      version: "1.0.0",
      description:
        "Create and host OAuth Client ID Metadata Documents (CIMD). The " +
        "returned client_id is an HTTPS URL you use directly as an OAuth " +
        "client_id — no registration.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/clients": {
        post: {
          operationId: "createCimdClient",
          summary: "Create a CIMD client",
          description:
            "Create a client. The body is any subset of RFC 7591 client " +
            "metadata and overrides the defaults. For private_key_jwt without " +
            "a jwks, an ES256 keypair is minted; the private key is returned " +
            "and never stored.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    client_name: { type: "string" },
                    redirect_uris: {
                      type: "array",
                      items: { type: "string", format: "uri" },
                    },
                    grant_types: { type: "array", items: { type: "string" } },
                    scope: { type: "string" },
                    token_endpoint_auth_method: {
                      type: "string",
                      enum: ["none", "private_key_jwt"],
                    },
                  },
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Client created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["client_id"],
                    properties: {
                      client_id: {
                        type: "string",
                        format: "uri",
                        description:
                          "The hosted CIMD URL — use it as client_id.",
                      },
                      private_key: {
                        type: "object",
                        description:
                          "JWK of the minted private key — only for " +
                          "private_key_jwt. Never stored server-side.",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}
