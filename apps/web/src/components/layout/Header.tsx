import { LiveStatus } from "@/components/ui/LiveStatus";

export function Header() {
  return (
    <header className="border-b border-gray-800 bg-mia-panel px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-mia-accent">MIA</span>
          <span className="text-lg text-gray-300">Flight Tracker</span>
        </div>
        <LiveStatus />
      </div>
    </header>
  );
}
