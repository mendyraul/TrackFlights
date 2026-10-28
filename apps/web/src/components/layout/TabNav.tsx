"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Map" },
  { href: "/table", label: "Flights" },
  { href: "/analytics", label: "Analytics" },
  { href: "/behind-the-scenes", label: "Behind the Scenes" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="h-11 border-b border-gray-800 bg-mia-panel">
      {/* Scrolls sideways on very narrow screens instead of wrapping onto three lines. */}
      <div className="flex h-full overflow-x-auto px-2 sm:px-4 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mia-accent sm:px-4 ${
                active
                  ? "border-mia-accent text-mia-accent"
                  : "border-transparent text-gray-300 hover:text-white"
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
