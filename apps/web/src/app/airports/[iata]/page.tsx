import { notFound } from "next/navigation";
import { lookupAirport } from "@/lib/airports";
import { AirportBoard } from "@/components/table/AirportBoard";
export default async function AirportPage({ params }: { params: Promise<{ iata: string }> }) {
  const { iata } = await params;
  const code = iata.toUpperCase();
  if (!lookupAirport(code)) notFound();
  return <AirportBoard iata={code} />;
}
