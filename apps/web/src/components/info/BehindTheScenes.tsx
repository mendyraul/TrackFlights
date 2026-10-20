import { Photo } from "./Photo";
import { measuredRangeKm, photos } from "@/lib/photos";
import modelMetrics from "@/lib/model-metrics.json";

/**
 * Static explainer of how live aircraft get onto the map, from the antenna
 * to the browser. No data is fetched here. Numbers are the
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

export function BehindTheScenes() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-100">Behind the Scenes</h1>

      <Section step="Step 1" title="The hardware">
        <p>My setup is deliberately simple, and it works fine:</p>
        <DataTable
          caption="The receiver hardware I use"
          columns={["Part", "What I use", "Notes"]}
          rows={[
            [
              "SDR receiver",
              "Generic RTL-SDR USB dongle",
              "Works fine. A filtered, amplified stick (e.g. FlightAware Pro Stick Plus) is the upgrade if local interference becomes a problem.",
            ],
            [
              "Antenna",
              "1090 MHz antenna facing out a window",
              "Indoors, so the building blocks part of the sky. Moving it outside and higher is the biggest range upgrade.",
            ],
            ["Computer", "Raspberry Pi 3", "Runs the decoder and the Python ingestor together."],
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
            <>
              Mine sits in a window rather than on the roof, so part of the sky is blocked, but it
              still hears aircraft well over 100&nbsp;km away.
            </>
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
          Lauderdale still looks like an arrival, which is what the trained classifier below is for.
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

      <Models />

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

// ── Models ──────────────────────────────────────────────────────────────

interface ForecastMetrics {
  ships: boolean;
  model: string;
  mae: number;
  best_baseline_mae: number;
  improvement_pct: number | null;
  heldout_days: number;
  evaluated_at: string;
}

interface PhaseMetrics {
  ships: boolean;
  model: string;
  macro_f1: number;
  baseline_macro_f1: number;
  test_samples: number;
  heldout_days: number;
  evaluated_at: string;
}

const MODEL_NAMES: Record<string, string> = {
  ridge: "ridge regression",
  gradient_boosting: "gradient-boosted trees",
  logistic_regression: "logistic regression",
  decision_tree: "a decision tree",
};

function ModelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-mia-dark/40 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-100">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-mia-sky">{children}</p>;
}

/**
 * The three models, with results only from real evaluation runs
 * (apps/ml writes them to lib/model-metrics.json). Until then, each card says
 * what it's waiting for.
 */
export function Models() {
  const forecast = modelMetrics.forecast as ForecastMetrics | null;
  const phase = modelMetrics.phase as PhaseMetrics | null;

  return (
    <Section title="Models">
      <p>
        Three small models run on what the receiver hears. Each is trained on this receiver&apos;s
        own data, scored on days it never saw, and only switched on if it beats a simple baseline.
        Models are trained on a laptop and shipped to the Pi as small JSON files, so the Pi runs
        them without any machine-learning libraries.
      </p>
      <div className="grid gap-3">
        <ModelCard title="Unusually busy or quiet hours">
          <p>
            Each hour is compared with the same hour of the week over the previous 8 weeks (a
            Tuesday at 5&nbsp;pm against the last eight Tuesdays at 5&nbsp;pm) using median and MAD,
            which shrug off the odd storm or outage. Three or more deviations away raises an alert
            on the Analytics page. Hours when the receiver was partly down are ignored.
          </p>
          <Status>Runs inside the database every hour, once 3 weeks of history exist.</Status>
        </ModelCard>

        <ModelCard title="Traffic forecast, next 6 hours">
          <p>
            Predicts how many aircraft the receiver will hear from the local hour and weekday,
            holidays, the weather forecast, and the same hour last week.
          </p>
          {forecast ? (
            forecast.ships ? (
              <Status>
                Held out the last {forecast.heldout_days} days: off by {forecast.mae.toFixed(1)}{" "}
                aircraft/hour on average with {MODEL_NAMES[forecast.model] ?? forecast.model}, vs{" "}
                {forecast.best_baseline_mae.toFixed(1)} for the best simple baseline
                {forecast.improvement_pct !== null ? ` (${forecast.improvement_pct}% better)` : ""}.
                Evaluated {forecast.evaluated_at}.
              </Status>
            ) : (
              <Status>
                Evaluated {forecast.evaluated_at}: no model beat the &ldquo;same hour last
                week&rdquo; baseline yet, so it isn&apos;t switched on.
              </Status>
            )
          ) : (
            <Status>Collecting data: needs about 4 weeks of hourly history.</Status>
          )}
        </ModelCard>

        <ModelCard title="Arriving, departing, or somewhere else">
          <p>
            Learns phase from what aircraft actually did. The Pi keeps a local log of every
            aircraft&apos;s positions; afterwards, each position is labeled by whether that aircraft
            went on to land at MIA, had just taken off from it, used a nearby field like Fort
            Lauderdale, or never came low near any airport. A classifier trained on those labels
            replaces the hand-written rules above.
          </p>
          {phase ? (
            phase.ships ? (
              <Status>
                Held out {phase.heldout_days} days ({phase.test_samples.toLocaleString("en-US")}{" "}
                positions): macro-F1 {phase.macro_f1.toFixed(2)} with{" "}
                {MODEL_NAMES[phase.model] ?? phase.model}, vs {phase.baseline_macro_f1.toFixed(2)}{" "}
                for the hand-written rules. Evaluated {phase.evaluated_at}.
              </Status>
            ) : (
              <Status>
                Evaluated {phase.evaluated_at}: the model didn&apos;t beat the hand-written rules
                yet, so the rules stay on.
              </Status>
            )
          ) : (
            <Status>Collecting tracks: needs about 2 weeks of position history.</Status>
          )}
        </ModelCard>
      </div>
    </Section>
  );
}
