import { PhotoPlaceholder } from "./PhotoPlaceholder";

/**
 * Static, owner-authored explainer of how live flight points get onto this map
 * via a rooftop 1090 MHz antenna + Raspberry Pi. No data is fetched here — every
 * number below is a configured default of the pipeline (see the ingestor config
 * and docs/), so the page renders instantly and reads the same for everyone.
 *
 * The page is built from labeled <section>s with PhotoPlaceholder slots so the
 * owner can drop in real photos and expand the prose into a full tutorial later.
 */

function Section({
  step,
  title,
  children,
}: {
  step?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-mia-panel p-6">
      <div className="mb-3 flex items-baseline gap-3">
        {step && (
          <span className="rounded bg-mia-accent/10 px-2 py-0.5 text-xs font-semibold text-mia-accent">
            {step}
          </span>
        )}
        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

function PipelineStrip() {
  const stages = [
    "Antenna",
    "RTL-SDR",
    "readsb",
    "aircraft.json",
    "ingestor",
    "Supabase",
    "CDN",
    "This map",
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 bg-mia-dark/50 p-4">
      {stages.map((stage, i) => (
        <span key={stage} className="flex items-center gap-2">
          <span className="rounded bg-mia-panel px-2.5 py-1 text-xs font-medium text-gray-200">
            {stage}
          </span>
          {i < stages.length - 1 && <span className="text-mia-accent">→</span>}
        </span>
      ))}
    </div>
  );
}

function BenchTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={k} className={i % 2 ? "bg-mia-dark/30" : ""}>
              <td className="px-4 py-2 font-medium text-gray-300">{k}</td>
              <td className="px-4 py-2 text-right font-mono text-mia-accent">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BehindTheScenes() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-100">Behind the Scenes</h1>
        <p className="text-sm text-gray-400">
          How a real antenna on my roof puts live planes on this map — built end to end on a
          Raspberry Pi. This page is a work in progress; photos and a full build tutorial are on the
          way.
        </p>
      </header>

      <Section title="The big picture">
        <p>
          Every aircraft overhead broadcasts its position on <strong>1090&nbsp;MHz</strong>. I catch
          those broadcasts with a rooftop antenna and a Raspberry Pi, decode them, filter and store
          them, then serve a cached snapshot to your browser. No paid flight API — the data comes
          straight out of the sky.
        </p>
        <PipelineStrip />
      </Section>

      <Section step="Step 1" title="The hardware">
        <p>
          ADS-B reception is mostly about a clean signal path and a good antenna location. Here is
          the bill of materials, with a quality tier (~$120–160) and a budget starter tier
          (~$50–70).
        </p>
        <BenchTable
          rows={[
            ["1090 MHz antenna", "tuned vertical, roof-mounted"],
            ["SDR receiver", "FlightAware Pro Stick Plus / RTL-SDR"],
            ["1090 MHz bandpass filter", "cuts out-of-band noise"],
            ["Compute", "Raspberry Pi 4"],
            ["Feedline", "low-loss coax, kept short"],
            ["Quality build", "~$120–160"],
            ["Starter build", "~$50–70"],
          ]}
        />
        <PhotoPlaceholder caption="The antenna mounted on the roof, plus the Raspberry Pi + SDR in its case." />
      </Section>

      <Section step="Step 2" title="Catching the signal">
        <p>
          Aircraft transmit <strong>Mode S Extended Squitter</strong> messages on 1090&nbsp;MHz.
          This is line-of-sight radio: the higher and clearer the antenna, the farther it hears. A
          well-placed setup typically reaches <strong>150–250&nbsp;km</strong>. I gate reception to
          a <strong>200&nbsp;km</strong> radius around Miami International (KMIA, 25.79°N / 80.29°W)
          so the map stays focused on local traffic.
        </p>
        <PhotoPlaceholder caption="My actual coverage map / polar range plot showing how far the antenna reaches." />
      </Section>

      <Section step="Step 3" title="Decoding the radio into data">
        <p>
          A decoder (<code className="text-mia-sky">readsb</code> /{" "}
          <code className="text-mia-sky">dump1090-fa</code>) turns the raw radio bursts into
          structured aircraft records and publishes them as{" "}
          <code className="text-mia-sky">aircraft.json</code> over local HTTP, refreshed about{" "}
          <strong>once per second (~1&nbsp;Hz)</strong>. Each record carries the ICAO address,
          callsign, position, altitude, ground speed, track, and vertical rate.
        </p>
        <PhotoPlaceholder caption="Screenshot of the tar1090 live view showing aircraft being decoded in real time." />
      </Section>

      <Section step="Step 4" title="Filtering &amp; normalizing">
        <p>
          The Python ingestor reads <code className="text-mia-sky">aircraft.json</code> and applies
          three gates before anything is written. Together they cut database writes by roughly
          60–80% — most aircraft barely move between polls, and a local source is free so I can poll
          aggressively and still drop redundant updates.
        </p>
        <BenchTable
          rows={[
            ["Freshness gate", "≤ 60 s since last seen"],
            ["Range gate", "≤ 200 km from KMIA"],
            ["Movement gate", "≥ 150 m moved to re-write"],
            ["Ingest poll", "every 10 s"],
            ["Write reduction", "~60–80%"],
          ]}
        />
      </Section>

      <Section step="Step 5" title="Telling one flight from another">
        <p>
          Every airframe has a permanent <strong>24-bit ICAO hex address</strong> baked into its
          transponder — that is the true identity. The <em>callsign</em> (e.g. a flight number) can
          change trip to trip, so I key each row on a stable identifier and dedupe with a unique
          database constraint so a plane never shows up twice. Whether a flight is arriving or
          departing is inferred from its vertical rate (climbing vs. descending).
        </p>
      </Section>

      <Section step="Step 6" title="Storing it cheaply">
        <p>
          The Pi writes into Supabase (hosted Postgres). Writes <em>into</em> the database are{" "}
          <strong>ingress</strong>, which is unmetered — so streaming from the antenna costs
          nothing. Only browser <strong>reads</strong> count against the free tier&apos;s egress
          budget, and a daily retention job prunes old rows to stay under the storage cap.
        </p>
        <BenchTable
          rows={[
            ["Free-tier database", "500 MB"],
            ["Free-tier egress", "5 GB / month"],
            ["Pi → Supabase writes", "ingress (unmetered)"],
            ["Retention", "pruned daily"],
          ]}
        />
      </Section>

      <Section step="Step 7" title="Serving the map without burning egress">
        <p>
          Browsers never hit Supabase directly. They read{" "}
          <code className="text-mia-sky">/api/flights/snapshot</code> — at most 250 flights (~35 KB)
          — which Vercel&apos;s CDN caches for ~30 seconds. One database read is shared across every
          viewer, so egress stays flat no matter how many people watch.
        </p>
        <BenchTable
          rows={[
            ["Snapshot cap", "250 flights (~35 KB)"],
            ["CDN cache window", "30 s"],
            ["Egress @ 30 s refresh", "~1.5 GB / month"],
            ["Egress @ 60 s refresh", "~0.75 GB / month"],
          ]}
        />
      </Section>

      <Section step="Step 8" title="Drawing the planes">
        <p>
          The frontend renders a dark Leaflet/CARTO map. Each aircraft is an SVG plane icon rotated
          to its heading; positions ease smoothly to their new spot on each refresh, and a flight
          that just updated is briefly highlighted. The browser polls the cached snapshot every
          ~10&nbsp;seconds.
        </p>
        <PhotoPlaceholder caption="A close-up of the live map with the plane icons and a selected flight's detail panel." />
      </Section>

      <Section title="Benchmarks at a glance">
        <p>The key numbers that define this pipeline:</p>
        <BenchTable
          rows={[
            ["Broadcast frequency", "1090 MHz"],
            ["Decode rate", "~1 Hz"],
            ["Reception range gate", "200 km"],
            ["Freshness gate", "60 s"],
            ["Movement gate", "150 m"],
            ["Ingest poll interval", "10 s"],
            ["Snapshot refresh", "30 s"],
            ["Client poll interval", "10 s"],
            ["Snapshot row cap", "250 flights"],
            ["Estimated egress", "~1.5 GB / month"],
          ]}
        />
        <p className="text-xs text-gray-500">
          A full hardware walkthrough — with photos of the antenna install, the Pi setup, and the
          coverage I get from my location — is coming soon.
        </p>
      </Section>
    </div>
  );
}
