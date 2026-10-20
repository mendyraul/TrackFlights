"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Aircraft } from "@/lib/aircraft";

const tooltipStyle = {
  backgroundColor: "#16213e",
  border: "1px solid #374151",
  borderRadius: "8px",
  fontSize: 12,
};
const axisTick = { fill: "#9ca3af", fontSize: 11 };

export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-gray-800 bg-mia-panel p-4 sm:p-5 ${className}`}>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
      <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

const ALTITUDE_BANDS: { label: string; test: (ft: number) => boolean }[] = [
  { label: "Ground", test: (ft) => ft === 0 },
  { label: "< 5k", test: (ft) => ft > 0 && ft < 5_000 },
  { label: "5–10k", test: (ft) => ft >= 5_000 && ft < 10_000 },
  { label: "10–20k", test: (ft) => ft >= 10_000 && ft < 20_000 },
  { label: "20–30k", test: (ft) => ft >= 20_000 && ft < 30_000 },
  { label: "30k+", test: (ft) => ft >= 30_000 },
];

export function summarize(aircraft: Aircraft[]) {
  const count = (phase: Aircraft["phase"]) => aircraft.filter((a) => a.phase === phase).length;
  const distances = aircraft.map((a) => a.distanceKm).filter((d): d is number => d != null);
  const altitudes = aircraft
    .map((a) => a.flight.altitude_ft)
    .filter((ft): ft is number => ft != null);

  const byOperator = new Map<string, number>();
  for (const a of aircraft) {
    byOperator.set(a.operator.label, (byOperator.get(a.operator.label) ?? 0) + 1);
  }
  const ranked = [...byOperator.entries()].sort((x, y) => y[1] - x[1]);
  const top = ranked.slice(0, 8).map(([name, n]) => ({ name, aircraft: n }));
  const rest = ranked.slice(8).reduce((sum, [, n]) => sum + n, 0);
  if (rest > 0) top.push({ name: "Everyone else", aircraft: rest });

  return {
    total: aircraft.length,
    arriving: count("arriving"),
    departing: count("departing"),
    overflight: count("overflight"),
    onGround: count("on-ground"),
    farthestKm: distances.length ? Math.max(...distances) : null,
    highestFt: altitudes.length ? Math.max(...altitudes) : null,
    operators: top,
    altitudeBands: ALTITUDE_BANDS.map((band) => ({
      band: band.label,
      aircraft: altitudes.filter(band.test).length,
    })),
  };
}

export function LiveTraffic({ aircraft, stale }: { aircraft: Aircraft[]; stale: boolean }) {
  const s = summarize(aircraft);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="In range"
          value={String(s.total)}
          sub={stale ? "aircraft (last known)" : "aircraft"}
        />
        <Tile label="Arriving" value={String(s.arriving)} sub="inferred" />
        <Tile label="Departing" value={String(s.departing)} sub="inferred" />
        <Tile label="Overflights" value={String(s.overflight)} sub={`${s.onGround} on ground`} />
        <Tile
          label="Farthest"
          value={s.farthestKm != null ? `${Math.round(s.farthestKm)} km` : "—"}
          sub="from MIA"
        />
        <Tile
          label="Highest"
          value={
            s.highestFt != null
              ? (Math.round(s.highestFt / 100) * 100).toLocaleString("en-US")
              : "—"
          }
          sub="feet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Who's flying">
          {s.operators.length === 0 ? (
            <EmptyChart text="No aircraft to break down yet." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, s.operators.length * 30)}>
              <BarChart data={s.operators} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} />
                <YAxis type="category" dataKey="name" width={150} tick={axisTick} interval={0} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff0d" }} />
                <Bar dataKey="aircraft" name="Aircraft" fill="#00d4ff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Altitude bands (ft)">
          {s.total === 0 ? (
            <EmptyChart text="No aircraft to break down yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.altitudeBands}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="band" tick={axisTick} />
                <YAxis allowDecimals={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff0d" }} />
                <Bar dataKey="aircraft" name="Aircraft" fill="#facc15" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}
