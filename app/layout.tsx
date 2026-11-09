import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const SITE_URL = "https://makeclient.dev";
const TITLE = "Create a CIMD client — makeclient by Authlete";
const DESCRIPTION =
  "makeclient generates and hosts an OAuth Client ID Metadata Document " +
  "(CIMD) at a URL you use directly as a client_id — no registration, no " +
  "backend. Built by Authlete to exercise CIMD-capable authorization servers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "makeclient",
  keywords: [
    "CIMD",
    "CIMD client",
    "create CIMD client",
    "Client ID Metadata Document",
    "OAuth client_id",
    "client-metadata.json",
    "private_key_jwt",
    "Dynamic Client Registration",
    "Authlete",
    "OAuth 2.0",
  ],
  authors: [{ name: "Authlete", url: "https://www.authlete.com" }],
  creator: "Authlete",
  publisher: "Authlete",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "makeclient",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Structured data: tells Google and AI search engines what makeclient is.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "makeclient",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: {
    "@type": "Organization",
    name: "Authlete",
    url: "https://www.authlete.com",
  },
  about: {
    "@type": "Thing",
    name: "OAuth Client ID Metadata Document (CIMD)",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
