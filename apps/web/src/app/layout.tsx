import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Header } from "@/components/layout/Header";
import { TabNav } from "@/components/layout/TabNav";
import { Footer } from "@/components/layout/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — live ADS-B traffic around Miami`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  authors: [{ name: site.author, url: site.githubUrl }],
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} — live ADS-B traffic around Miami`,
    description: site.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — live ADS-B traffic around Miami`,
    description: site.description,
  },
};

export const viewport: Viewport = {
  themeColor: "#16213e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-mia-dark text-gray-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-mia-accent focus:px-3 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <Header />
        <TabNav />
        <main id="main" className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <Footer />
      </body>
    </html>
  );
}
