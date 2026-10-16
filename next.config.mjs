import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray lockfile above this dir makes Next infer the wrong workspace root;
  // pin it so build output tracing and start agree.
  outputFileTracingRoot: root,
};

export default nextConfig;
