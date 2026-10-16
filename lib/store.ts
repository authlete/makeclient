// Store for confidential (jwks-bearing) clients, whose documents are too big for
// the URL. Private Vercel Blob in prod; a local .data/ folder in dev.

import { get, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DIR = join(process.cwd(), ".data");

export async function putClient(id: string, json: string): Promise<void> {
  if (useBlob) {
    await put(`clients/${id}.json`, json, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(join(DIR, `${id}.json`), json, "utf8");
}

export async function getClient(id: string): Promise<string | null> {
  if (useBlob) {
    const r = await get(`clients/${id}.json`, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return new Response(r.stream).text();
  }
  try {
    return await fs.readFile(join(DIR, `${id}.json`), "utf8");
  } catch {
    return null;
  }
}

/** Short, content-addressed id — same config yields the same id. */
export async function clientId(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
