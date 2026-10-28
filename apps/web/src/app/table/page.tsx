import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { FlightBoard } from "@/components/table/FlightBoard";
import { PageIntro } from "@/components/layout/PageIntro";

export const metadata: Metadata = pageMetadata(
  "/table",
  "Flights",
  "Every aircraft the receiver is hearing around Miami: callsign, airline, altitude, speed, distance from MIA and whether it looks like it's arriving, departing or passing over."
);

export default function TablePage() {
  return (
    <>
      <PageIntro title="Aircraft in range">
        Everything the receiver has heard in the last few minutes. Airlines come from the callsign
        prefix and arriving/departing is inferred from altitude, climb rate, track and distance to
        MIA, since ADS-B carries no schedule.
      </PageIntro>
      <FlightBoard />
    </>
  );
}
