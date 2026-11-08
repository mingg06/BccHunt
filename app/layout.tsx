import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["500", "700"] });

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
