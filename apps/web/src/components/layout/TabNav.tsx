"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Map" },
  { href: "/table", label: "Flights" },
  { href: "/analytics", label: "Analytics" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-mia-panel">
      <div className="flex gap-1 px-6">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-mia-accent text-mia-accent"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
