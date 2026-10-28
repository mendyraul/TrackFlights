import Link from "next/link";
import { LiveStatus } from "@/components/ui/LiveStatus";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-gray-800 bg-mia-panel px-4 sm:px-6">
      {/* One link with a real space, so it reads "MIA Flight Tracker", not "MIAFlight Tracker". */}
      <Link
        href="/"
        className="flex items-baseline gap-2 whitespace-nowrap rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-mia-accent"
      >
        <span className="text-xl font-bold text-mia-accent sm:text-2xl">MIA</span>{" "}
        <span className="text-base text-gray-200 sm:text-lg">Flight Tracker</span>
      </Link>
      <LiveStatus />
    </header>
  );
}
