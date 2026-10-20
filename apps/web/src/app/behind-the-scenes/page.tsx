import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { BehindTheScenes } from "@/components/info/BehindTheScenes";

export const metadata: Metadata = pageMetadata(
  "/behind-the-scenes",
  "Behind the Scenes",
  "How the tracker works, end to end: antenna and SDR on a Raspberry Pi, readsb decoding, a Python ingestor writing to Supabase, and a CDN-cached API that keeps database egress flat."
);

export default function BehindTheScenesPage() {
  return <BehindTheScenes />;
}
