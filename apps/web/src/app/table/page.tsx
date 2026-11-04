import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { ScheduleBoard } from "@/components/table/ScheduleBoard";
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
      <PageIntro title="Regional aircraft">
        Live receiver observations alongside a dated FlightAware regional snapshot. Airlines come
        from the callsign prefix and arriving/departing is inferred from altitude, climb rate, track
        and distance to MIA, since ADS-B carries no schedule.
      </PageIntro>
      <FlightBoard />
      <ScheduleBoard />
    </>
  );
}
