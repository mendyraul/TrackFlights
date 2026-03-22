"use client";

import type { ConnectionStatus } from "@/services/realtime";

interface Props {
  status: ConnectionStatus;
  lastUpdate: number | null;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; pulse: boolean; label: string }
> = {
  connected: { color: "bg-green-400", pulse: true, label: "Live" },
  connecting: { color: "bg-yellow-400", pulse: true, label: "Reconnecting..." },
  disconnected: { color: "bg-red-400", pulse: false, label: "Disconnected" },
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function ConnectionBadge({ status, lastUpdate }: Props) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
        />
        <span className="text-xs text-gray-400">{cfg.label}</span>
      </div>
      {lastUpdate && status === "connected" && (
        <span className="text-xs text-gray-600">
          Updated {timeAgo(lastUpdate)}
        </span>
      )}
    </div>
  );
}
