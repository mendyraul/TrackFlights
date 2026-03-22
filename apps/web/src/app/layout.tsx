import type { Metadata } from "next";
import "@/styles/globals.css";
import { Header } from "@/components/layout/Header";
import { TabNav } from "@/components/layout/TabNav";

export const metadata: Metadata = {
  title: "MIA Flight Tracker",
  description: "Real-time flight tracking for Miami International Airport",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-mia-dark text-gray-100">
        <Header />
        <TabNav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
