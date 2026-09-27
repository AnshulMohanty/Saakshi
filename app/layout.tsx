import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saakshi", template: "%s · Saakshi" },
  description:
    "Saakshi (साक्षी, “witness”) turns field photos into verified, measured, traceable proof of impact.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
