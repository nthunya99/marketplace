import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/brand";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} — Lesotho’s marketplace`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — Lesotho’s marketplace`,
    description: BRAND.description,
    url: BRAND.url,
    locale: "en_LS",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — Lesotho’s marketplace`,
    description: BRAND.description,
  },
  // Favicon, apple-touch icon, OG image and manifest are picked up from
  // the files in src/app (icon.svg, apple-icon.png, opengraph-image.png,
  // manifest.ts) by Next's file conventions.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: BRAND.colors.pineDark,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-paper text-ink min-h-screen flex flex-col font-sans antialiased">
        <Providers>
          <Navbar />
          <main className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
