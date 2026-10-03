import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { BootLoader } from "@/components/boot-loader";
import { BOOT_CHECK } from "@/lib/boot";
import { INTRO_CHECK } from "@/lib/landing/intro";
import { FONT_PRELOADS } from "./font-preloads";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saakshi", template: "%s · Saakshi" },
  description:
    "Saakshi (साक्षी, “witness”) turns field photos into verified, measured, traceable proof of impact.",
};

// sRGB of --background in :root and .night (meta tags cannot read CSS variables).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Self-hosted fonts (B5.14): preload the latin display and body faces; the rest load on use.
  for (const href of FONT_PRELOADS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Before paint: the landing's ink-drop intro shows on a first visit only (components/landing/ink-intro.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_CHECK }} />
        {/* After it: on a reload, the mark draws itself while the page gets ready (components/boot-loader.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_CHECK }} />
      </head>
      <body className="flex min-h-full flex-col">
        <BootLoader />
        {children}
      </body>
    </html>
  );
}
