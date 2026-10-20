import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { Dashboard } from "@/components/analytics/Dashboard";
import { PageIntro } from "@/components/layout/PageIntro";

export const metadata: Metadata = pageMetadata(
  "/analytics",
  "Analytics",
  "Traffic around Miami International from a self-hosted ADS-B receiver: what's in the air now, the airline mix, altitude bands, and hourly history."
);

export default function AnalyticsPage() {
  return (
    <>
      <PageIntro title="Analytics">
        A summary of what the receiver hears: the picture right now, built from the same cached
        snapshot as the map, and hourly history rolled up inside the database.
      </PageIntro>
      <Dashboard />
    </>
  );
}
