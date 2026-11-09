import type { MetadataRoute } from "next";

// Allow everything — including AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
// OAI-SearchBot, Google-Extended). makeclient *wants* to be found by agents, so
// we deliberately don't block them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://makeclient.dev/sitemap.xml",
    host: "https://makeclient.dev",
  };
}
