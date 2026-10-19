import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stockroom · Shop Stock Counter",
  description: "A simple stock counter for your shop. Search, count and save.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
