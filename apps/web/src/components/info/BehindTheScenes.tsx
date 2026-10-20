import { Photo } from "./Photo";
import { measuredRangeKm, photos } from "@/lib/photos";

/**
 * Static explainer of how live aircraft get onto the map, from the rooftop
 * antenna to the browser. No data is fetched here. Numbers are the
 * pipeline's configured values (ingestor config, infra/systemd/env.adsb.example,
 * the snapshot route) or measurements, and the text says which is which.
 * Photos and the measured range are filled in lib/photos.ts.
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
    <section className="rounded-lg border border-gray-800 bg-mia-panel p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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

/** Inline code that wraps instead of pushing the page sideways on phones. */
function C({ children }: { children: React.ReactNode }) {
  return <code className="text-mia-sky [overflow-wrap:anywhere]">{children}</code>;
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
    <ol
      aria-label="Data pipeline"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 bg-mia-dark/50 p-4"
    >
      {stages.map((stage, i) => (
        <li key={stage} className="flex items-center gap-2">
          <span className="rounded bg-mia-panel px-2.5 py-1 text-xs font-medium text-gray-200">
            {stage}
          </span>
          {i < stages.length - 1 && (
            <span aria-hidden="true" className="text-mia-accent">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A real table with a header row, scrolling inside its own box on phones. */
function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-mia-dark/60 text-left text-xs uppercase tracking-wider text-gray-400">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={i % 2 ? "bg-mia-dark/30" : ""}>
              {cells.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-2 text-left font-medium text-gray-200">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="px-4 py-2 text-gray-300">
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-md border border-gray-800 bg-mia-dark/70 p-3 text-xs leading-relaxed text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mia-accent"
    >
      <code>{children}</code>
    </pre>
  );
}

function BuildStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <div
        aria-hidden="true"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-mia-accent/40 bg-mia-accent/10 text-sm font-semibold text-mia-accent"
      >
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <div className="space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
      </div>
    </li>
  );
}

export function BehindTheScenes() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-100">Behind the Scenes</h1>
        <p className="text-sm text-gray-400">
          How an antenna on my roof puts live planes on this map, built end to end on a Raspberry
          Pi. Below: how the pipeline works, the numbers behind it, and how to build your own.
        </p>
      </header>

      <Section title="The big picture">
        <p>
          Aircraft broadcast their position on <strong>1090&nbsp;MHz</strong>. A rooftop antenna and
          a Raspberry Pi catch those broadcasts and decode them; a small Python service filters them
          and stores them; the site serves a cached snapshot to your browser. The live positions
          come straight out of the sky, not from a paid flight API.
        </p>
        <PipelineStrip />
      </Section>

      <Section step="Step 1" title="The hardware">
        <p>
          Reception is mostly about a clean signal path and a high, clear antenna location. Two ways
          to build it:
        </p>
        <DataTable
          caption="Parts for a quality build and a starter build"
          columns={["Part", "Quality build (~$120–160)", "Starter build (~$50–70)"]}
          rows={[
            [
              "Antenna",
              "Tuned 1090 MHz vertical, roof-mounted",
              "Basic 1090 MHz antenna, as high as you can",
            ],
            [
              "SDR receiver",
              "FlightAware Pro Stick Plus (filter + amplifier built in)",
              "Generic RTL-SDR dongle",
            ],
            [
              "1090 MHz bandpass filter",
              "Not needed (built into the Pro Stick Plus)",
              "Recommended: only if your SDR lacks one",
            ],
            ["Compute", "Raspberry Pi 4", "Raspberry Pi 4"],
            ["Feedline", "Short run of low-loss coax", "Shortest coax you can manage"],
          ]}
        />
        <Photo photo={photos.hardware} />
      </Section>

      <Section step="Step 2" title="Catching the signal">
        <p>
          Aircraft transmit <strong>Mode S Extended Squitter</strong> messages on 1090&nbsp;MHz.
          It&apos;s line-of-sight radio, so the higher and clearer the antenna, the farther it
          hears.{" "}
          {measuredRangeKm !== null ? (
            <>
              My receiver&apos;s farthest measured contact is{" "}
              <strong>{measuredRangeKm}&nbsp;km</strong>, from tar1090&apos;s range plot.
            </>
          ) : (
            <>Rooftop receivers commonly hear aircraft a couple of hundred kilometres out.</>
          )}{" "}
          The ingestor only keeps aircraft within <strong>200&nbsp;km</strong> of Miami
          International (KMIA, 25.79°N / 80.29°W), so the map stays about local traffic.
        </p>
        <Photo photo={photos.rangePlot} />
      </Section>

      <Section step="Step 3" title="Decoding the radio into data">
        <p>
          A decoder (<C>readsb</C> or <C>dump1090-fa</C>) demodulates every message as it arrives,
          often hundreds per second, and merges them into one record per aircraft. About{" "}
          <strong>once a second</strong> it rewrites <C>aircraft.json</C>, which it serves over
          local HTTP. Each record carries the ICAO hex address, callsign, position, altitude, ground
          speed, track and vertical rate.
        </p>
        <Photo photo={photos.tar1090} />
      </Section>

      <Section step="Step 4" title="Filtering before anything is written">
        <p>
          The Python ingestor reads <C>aircraft.json</C> every <strong>15&nbsp;seconds</strong> and
          applies three gates. The freshness and range gates do most of the work: they drop aircraft
          without a recent position fix and anything outside 200&nbsp;km.
        </p>
        <p>
          The movement gate does less than its name suggests. It skips a write when an aircraft has
          moved under 150&nbsp;m since its last write. At a 15&nbsp;s poll that is anything slower
          than about <strong>19&nbsp;knots</strong>. An airliner at 250&nbsp;knots covers about
          1.9&nbsp;km between polls, so every airborne aircraft is written every poll; the gate only
          saves writes for aircraft parked or taxiing slowly.
        </p>
        <DataTable
          caption="Ingestor gates"
          columns={["Gate", "Setting", "What it drops"]}
          rows={[
            ["Freshness", "Position seen ≤ 60 s ago", "Aircraft that stopped reporting a position"],
            ["Range", "≤ 200 km from KMIA", "Distant traffic outside the area"],
            [
              "Movement",
              "Moved ≥ 150 m since last write",
              "Parked and slow-taxiing aircraft (< ~19 kt)",
            ],
          ]}
        />
        <p className="text-xs text-gray-400">
          Write reduction isn&apos;t measured yet. The ingestor logs <C>received</C>,{" "}
          <C>in_range_active</C> and <C>emitted</C> on every poll, so the real figure is{" "}
          1&nbsp;−&nbsp;emitted&nbsp;/&nbsp;in_range over a day of logs.
        </p>
      </Section>

      <Section step="Step 5" title="Telling one aircraft from another">
        <p>
          Every airframe has a permanent <strong>ICAO hex address</strong>, a 24-bit identifier set
          in its transponder; the callsign (usually the flight number) changes from trip to trip.
          The database row is keyed on the flight ident (the callsign, converted to its IATA form so
          ADS-B positions can merge with schedule data), falling back to the hex address when no
          callsign has been heard. An aircraft can briefly own two rows, one from before its
          callsign arrived and one after, so the site dedupes by hex address before showing
          anything.
        </p>
        <p>
          ADS-B carries no arrival/departure board, so phase is inferred. Below 12,000&nbsp;ft and
          within 60&nbsp;km of MIA, a descending aircraft counts as arriving and a climbing one that
          isn&apos;t pointed at the airport counts as departing. Farther out, the vertical trend and
          the track both have to agree. Everything else, including cruise traffic over Miami and
          aircraft in a hold, counts as an overflight. Without a flight plan, an arrival into Fort
          Lauderdale still looks like an arrival.
        </p>
      </Section>

      <Section step="Step 6" title="Storing it cheaply">
        <p>
          The Pi writes into Supabase (hosted Postgres). Writes <em>into</em> the database are
          ingress, which the free tier doesn&apos;t meter; reads <em>out</em> count against the
          egress budget. Scheduled jobs inside the database (pg_cron) archive finished flights,
          purge rows that stopped updating, and roll up hourly history, so no flight data leaves
          Supabase to do it.
        </p>
        <DataTable
          caption="Supabase free-tier limits that shape the design"
          columns={["Limit", "Free tier", "How the design stays under it"]}
          rows={[
            ["Database size", "500 MB", "Stale rows purged; history kept as hourly rollups"],
            ["Egress", "5 GB / month", "Browsers read a CDN-cached snapshot, never the database"],
            ["Pi → Supabase writes", "Ingress, not metered", "Free to write every poll"],
          ]}
        />
      </Section>

      <Section step="Step 7" title="Serving the map without burning egress">
        <p>
          Browsers never query Supabase. They read <C>/api/flights/snapshot</C>, which Vercel&apos;s
          CDN caches for <strong>30&nbsp;seconds</strong>. Viewers served by the same CDN region
          share one database read per window, so egress grows with the number of regions people
          visit from, not with the number of people.
        </p>
        <p>
          The snapshot holds up to <strong>250</strong> aircraft, most recently updated first: if
          more rows exist, aircraft heard right now always make the cut, and rows that stopped
          updating only fill the remaining space. Measured on a full 250-row snapshot it is about{" "}
          <strong>130&nbsp;KB</strong> of JSON, or <strong>19&nbsp;KB</strong> compressed.
        </p>
        <DataTable
          caption="Snapshot egress estimate"
          columns={[
            "Refresh window",
            "Reads / month (per region, viewed 24/7)",
            "Egress, compressed",
          ]}
          rows={[
            ["30 s (current)", "86,400", "≈ 1.6 GB"],
            ["60 s", "43,200", "≈ 0.8 GB"],
          ]}
        />
        <p className="text-xs text-gray-400">
          Estimate: 19&nbsp;KB × reads. Server-side fetch asks Supabase for a compressed response;
          uncompressed it would be about 7× more. Hours with no viewers cost nothing, because the
          cache only refreshes when someone asks.
        </p>
        <p>
          Your browser checks for a new snapshot every <strong>15&nbsp;seconds</strong>, half the
          cache window. New data shows up within about 15&nbsp;s of the CDN refreshing, and the
          repeat requests in between are answered by the CDN without touching the database.
        </p>
      </Section>

      <Section step="Step 8" title="Drawing the planes">
        <p>
          The map is Leaflet on Esri&apos;s dark gray basemap. Each aircraft is an SVG plane rotated
          to its track; positions ease to their new spot on each refresh, and aircraft that just
          updated are briefly highlighted. If the newest data is more than 15&nbsp;minutes old, the
          site says the receiver is offline and greys out the last known positions instead of
          pretending they&apos;re live.
        </p>
        <Photo photo={photos.liveMap} />
      </Section>

      <section className="rounded-lg border border-mia-accent/30 bg-mia-panel p-4 sm:p-6">
        <div className="mb-4 space-y-2">
          <h2 className="text-lg font-semibold text-gray-100">Build it yourself</h2>
          <p className="text-sm leading-relaxed text-gray-400">
            The path from parts to a working feed. Install scripts and package names change, so
            check each project&apos;s current instructions as you go.
          </p>
        </div>

        <ol className="space-y-6">
          <BuildStep n={1} title="Gather the hardware">
            <p>
              Start from the parts table above. A shorter coax run and a higher, clearer antenna
              matter more than almost anything else. Skip the separate bandpass filter if your SDR
              already has one, like the FlightAware Pro Stick Plus.
            </p>
          </BuildStep>

          <BuildStep n={2} title="Flash and prep the Raspberry Pi">
            <p>
              Write Raspberry Pi OS Lite to a microSD card with Raspberry Pi Imager. In its
              settings, create your user, enable SSH and set Wi-Fi so the Pi works headless from the
              first boot. Current images have no default <C>pi</C> user, so log in with the one you
              created:
            </p>
            <CodeBlock label="Connect and update the Pi">{`ssh <your-username>@<your-hostname>.local
sudo apt update && sudo apt full-upgrade -y
sudo reboot`}</CodeBlock>
          </BuildStep>

          <BuildStep n={3} title="Install a decoder and a local map">
            <p>
              Two common routes; either one works as the data source. With{" "}
              <strong>readsb + tar1090</strong> (wiedehopf&apos;s install scripts):
            </p>
            <CodeBlock label="Install readsb and tar1090">{`sudo bash -c "$(wget -nv -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"
sudo bash -c "$(wget -nv -O - https://github.com/wiedehopf/tar1090/raw/master/install.sh)"`}</CodeBlock>
            <p>
              Or flash FlightAware&apos;s <strong>PiAware</strong> image, which bundles{" "}
              <C>dump1090-fa</C> and its SkyAware map and also feeds FlightAware.
            </p>
          </BuildStep>

          <BuildStep n={4} title="Connect the SDR and confirm reception">
            <p>
              Plug in the SDR, connect the antenna, and open the local map. Aircraft should appear
              within a minute or two. Where the map and the JSON live depends on the route:
            </p>
            <DataTable
              caption="Local map and aircraft.json locations"
              columns={["Setup", "Map in a browser", "aircraft.json"]}
              rows={[
                [
                  "readsb + tar1090",
                  <C key="m">http://&lt;pi-ip&gt;/tar1090</C>,
                  <C key="j">http://&lt;pi-ip&gt;/tar1090/data/aircraft.json</C>,
                ],
                [
                  "PiAware (dump1090-fa)",
                  <C key="m">http://&lt;pi-ip&gt;:8080</C>,
                  <C key="j">http://&lt;pi-ip&gt;:8080/data/aircraft.json</C>,
                ],
              ]}
            />
            <p>
              The ingestor defaults to <C>http://127.0.0.1:8080/data/aircraft.json</C>, the PiAware
              layout. On a readsb + tar1090 Pi, point <C>ADSB_JSON_URL</C> at the tar1090 path
              instead.
            </p>
          </BuildStep>

          <BuildStep n={5} title="Tune for range">
            <p>
              Mount the antenna as high and as clear of obstructions as you safely can. Adjust the
              SDR gain until the message rate and range peak without the receiver overloading;
              tar1090 shows both, and its range plot shows where buildings or trees block you.
            </p>
          </BuildStep>

          <BuildStep n={6} title="Point the ingestor at your feed">
            <p>
              Run this project&apos;s Python ingestor on the Pi and give it an env file. systemd
              reads <C>EnvironmentFile</C> lines as <C>KEY=value</C>, and a trailing{" "}
              <C># comment</C> would become part of the value, so comments go on their own line:
            </p>
            <CodeBlock label="Ingestor environment file">{`# Read ADS-B from the local decoder (PiAware path; see the table above)
FLIGHT_PROVIDER=adsb1090
ADSB_JSON_URL=http://127.0.0.1:8080/data/aircraft.json
# Poll every 15 seconds
POLL_INTERVAL_SECONDS=15
# Keep aircraft within 200 km of MIA
ADSB_MAX_RANGE_KM=200
# Drop aircraft with no position in the last 60 s
ADSB_MAX_SEEN_SECONDS=60
# Skip rewriting aircraft that moved less than 150 m
ADSB_MIN_MOVE_METERS=150
# Your Supabase project URL
SUPABASE_URL=https://<project-ref>.supabase.co
# Service-role key: write access, Pi only. Never commit it or ship it to a browser.
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
# Optional: a healthchecks.io URL that alerts you when pings stop
HEARTBEAT_PING_URL=`}</CodeBlock>
            <p>
              Keep the file readable only by the service user (<C>chmod 600</C>).
            </p>
          </BuildStep>

          <BuildStep n={7} title="Run it as a service and verify">
            <p>
              Install the systemd unit from <C>infra/systemd/</C> so the ingestor starts on boot and
              restarts on failure, then watch it with <C>journalctl -u mia-ingestor-adsb -f</C>.
              Each poll logs how many aircraft it received and wrote. Within a refresh or two your
              traffic shows up on the map, and the header switches to &ldquo;Receiver online&rdquo;.
            </p>
          </BuildStep>
        </ol>
      </section>

      <Section title="Benchmarks at a glance">
        <DataTable
          caption="Pipeline numbers and where each is set"
          columns={["Metric", "Value", "Source"]}
          rows={[
            ["Broadcast frequency", "1090 MHz", "ADS-B standard"],
            [
              "Decoder output refresh",
              "aircraft.json rewritten ~1× per second",
              "readsb / dump1090 default",
            ],
            ["Range gate", "200 km from KMIA", "ADSB_MAX_RANGE_KM"],
            ["Freshness gate", "Position seen ≤ 60 s ago", "ADSB_MAX_SEEN_SECONDS"],
            ["Movement gate", "150 m (skips < ~19 kt at a 15 s poll)", "ADSB_MIN_MOVE_METERS"],
            ["Ingest poll", "15 s", "POLL_INTERVAL_SECONDS (env.adsb)"],
            [
              "CDN cache window",
              "30 s, then up to 60 s stale while refreshing",
              "SNAPSHOT_REFRESH_SECONDS",
            ],
            ["Browser poll", "15 s", "Site code"],
            ["Snapshot cap", "250 aircraft, most recently updated first", "Snapshot route"],
            ["Snapshot size", "≈ 130 KB JSON / 19 KB compressed (measured)", "250-row snapshot"],
            [
              "Snapshot egress",
              "≈ 1.6 GB / month per region, if viewed 24/7 (estimated)",
              "Step 7",
            ],
            ["Shown as live", "Newest data < 2 min old; offline after 15 min", "Site code"],
          ]}
        />
      </Section>
    </div>
  );
}
