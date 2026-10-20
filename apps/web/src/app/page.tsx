import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { MapView } from "@/components/map/MapView";

export const metadata: Metadata = pageMetadata(
  "/",
  "MIA Flight Tracker — live ADS-B traffic around Miami",
  "A live map of aircraft around Miami International, decoded from 1090 MHz ADS-B by a Raspberry Pi receiver and refreshed every 15 seconds."
);

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Live map of aircraft around Miami International</h1>
      <noscript>
        <p className="p-6 text-gray-300">
          The live map needs JavaScript. The <a href="/behind-the-scenes">Behind the Scenes</a> page
          explains how the data is captured.
        </p>
      </noscript>
      <MapView />
    </>
  );
}
