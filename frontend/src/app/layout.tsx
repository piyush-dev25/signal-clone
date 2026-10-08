import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Signal",
  description: "Signal messenger clone",
};

// "resizes-content": the on-screen keyboard shrinks the layout viewport, so h-dvh panes keep the
// composer visible above it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

// THEME_SCRIPT runs in <head> before first paint: it applies the saved theme (System / Light /
// Dark, default System) so there is no flash, and follows OS changes only in System.

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-surface text-fg">{children}</body>
    </html>
  );
}
