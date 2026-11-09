import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Self-hosted (latin, variable weight, OFL) so builds never depend on Google Fonts.
const display = localFont({ src: "./fonts/space-grotesk.woff2", variable: "--font-display", weight: "400 700", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", variable: "--font-mono-face", weight: "500 700", display: "swap" });

export const metadata: Metadata = {
  title: "BCCHunt — Hunters vs Shadows",
  description: "Real-life GPS manhunt. Shadows hide, Hunters track their pings.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BCCHunt" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${mono.variable} antialiased`}>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: { background: "#171a25", border: "1px solid rgb(255 255 255 / 0.1)", color: "#eef0f6" },
          }}
        />
      </body>
    </html>
  );
}
