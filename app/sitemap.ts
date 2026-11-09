import type { MetadataRoute } from "next";

// Only the home page is an indexable page; /c/, /s/ and /oauth are dynamic
// JSON documents (client metadata), not content to index.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://makeclient.dev",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
