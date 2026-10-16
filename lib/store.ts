// Tiny store for confidential (jwks-bearing) clients, whose documents are too
// big to encode in the URL. Vercel Blob in production; a local .data/ folder in
// dev so `npm run dev` works with zero setup. Public clients never touch this —
// they stay stateless in the URL path.

import { list, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DIR = join(process.cwd(), ".data");

export async function putClient(id: string, json: string): Promise<void> {
  if (useBlob) {
    await put(`clients/${id}.json`, json, {
      access: "public",
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
    const { blobs } = await list({ prefix: `clients/${id}.json`, limit: 1 });
    if (!blobs.length) return null;
    return fetch(blobs[0].url).then((r) => r.text());
  }
  try {
    return await fs.readFile(join(DIR, `${id}.json`), "utf8");
  } catch {
    return null;
  }
}

/** Short, content-addressed id — same config yields the same id (idempotent). */
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
