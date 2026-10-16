import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "makeclient — instant CIMD client",
  description:
    "Generate and host an OAuth Client ID Metadata Document (CIMD) at a URL you can use as a client_id. No registration, no backend.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
