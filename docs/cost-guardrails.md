# Cost Guardrails + Alerting Runbook (Vercel + Supabase)

## 1) Budget thresholds and owners

Set monthly hard/soft thresholds and route alerts to one owner channel.

- **Primary owner:** Raul
- **Primary channel:** GitHub issue + Telegram DM
- **Escalation window:** immediate for critical spend spikes, same-day for warning threshold

### Suggested thresholds

#### Vercel
- **Warning:** 60% of monthly budget consumed
- **Critical:** 85% of monthly budget consumed
- **Hard-stop review:** 95%+ (freeze non-essential preview builds)

#### Supabase
- **Warning:** 60% of plan quota (DB egress/storage/compute)
- **Critical:** 85% of quota or projected overage before cycle end
- **Hard-stop review:** sustained anomaly for >2 hours or projected 100% exhaustion

## 2) Alert setup checklist

### Vercel
- [ ] Enable usage alerts in Vercel billing settings
- [ ] Add warning + critical thresholds (60/85)
- [ ] Ensure owner email/notification route is active
- [ ] Verify first test alert delivery path

### Supabase
- [ ] Enable org/project usage alerts
- [ ] Add warning + critical quota thresholds
- [ ] Confirm notification recipients
- [ ] Validate quota metrics visible in project usage dashboard
- [ ] Run `npm run ops:supabase-free-tier` after env or retention changes

### Cross-platform anomaly detection
- [ ] Daily check: spend trend vs previous 7-day average
- [ ] Flag anomaly if daily spend >1.8x rolling 7-day average
- [ ] Flag anomaly if API/egress growth >2x day-over-day without deploy note
- [ ] Log anomaly in `docs/evidence/cost/` with timestamp + source chart

## 3) Cost spike triage runbook

When a warning/critical alert fires:

1. **Confirm source**
   - Identify platform (Vercel/Supabase) and current threshold crossed
   - Capture evidence screenshot + timestamp

2. **Correlate with recent changes**
   - Check deploys in last 24h (preview/prod)
   - Check PR merge history and traffic anomalies

3. **Find top driver**
   - Vercel: build minutes, function invocations/duration, bandwidth
   - Supabase: DB egress, storage growth, realtime fanout, auth spikes

4. **Apply immediate containment (if critical)**
   - Pause non-essential preview deployments
   - Throttle/reduce polling intervals for ingestor jobs
   - Disable high-cardinality debug logging if active
   - Temporarily reduce expensive background jobs

5. **Stabilize and verify**
   - Re-check spend/usage after 30-60 minutes
   - Confirm trend is flattening
   - Open/update incident issue with root cause + mitigation

6. **Post-incident hardening**
   - Add one guardrail automation or budget alarm if missing
   - Document preventive action in release checklist

## 3a) Supabase egress budget (ADS-B mode)

The binding free-tier limit for a live tracker is **egress**, not storage. Supabase Free (verified
June 2026): **5 GB uncached egress/mo** (+5 GB cached), 500 MB DB, 1 GB storage, 200 concurrent
realtime connections, 2M realtime messages/mo. Projects pause after 7 days with no DB request.

**Key fact:** the Pi → Supabase ingest is *writes = ingress*, which is **not** metered against the
egress cap. Egress is burned only by **reads out** of Supabase — i.e. the browser. So the egress
controls live entirely on the web read path.

**Why direct browser reads blow the budget:** 5 GB/mo ≈ 167 MB/day ≈ ~6.9 MB/hr. A single browser
reading `flights_current` directly every 5 s at ~35 KB/snapshot burns ~25 MB/hr — **one viewer
exhausts the month in ~8 days.** (This is why realtime was disabled and polling slowed.)

**The fix — decouple viewers from Supabase reads.** `apps/web/src/app/api/flights/snapshot/route.ts`
reads the snapshot from Supabase **once per `SNAPSHOT_REFRESH_SECONDS`**, and is edge-cached
(`Cache-Control: s-maxage=…`). Every browser is served from Vercel's CDN (Hobby = 100 GB/mo,
separate pool), so Supabase egress depends on the *server* refresh rate, not viewer count. The
client (`useFlights`) polls the route every 10 s — those hits land on the CDN, not Supabase.

| Server refresh (`SNAPSHOT_REFRESH_SECONDS`) | Supabase egress/mo (~35 KB snapshot) | Verdict |
|---|---|---|
| 30 s | ~3.0 GB | ✅ headroom under 5 GB |
| 60 s | ~1.5 GB | ✅ recommended default (safest) |
| ≤10 s | >9 GB | ❌ over budget |

**Guardrails:** keep **realtime OFF** (the 2M-msg/mo cap + per-client fan-out blow up with
broadcasts). Keep `flights_current` an UPSERT (bounded rows) and `flights_history` off/downsampled
to stay under 500 MB. If egress alerts fire, **raise** `SNAPSHOT_REFRESH_SECONDS` first.

### Repo preflight for issue #75

Run:

```bash
npm run ops:supabase-free-tier
```

What it checks:

- `SNAPSHOT_REFRESH_SECONDS` stays at or above 30s so uncached egress remains inside the free-tier budget
- retention windows remain short enough for the existing prune job to cap DB/storage growth
- write-heavy features (`PREDICTIONS_ENABLED`, `ANOMALY_DETECTION_ENABLED`) are surfaced as risk multipliers
- optional planning assumptions in `.env` stay within Supabase Free limits for:
  - DB size
  - storage size
  - MAU
  - third-party MAU
  - Realtime peak connections
  - Realtime messages
  - Edge Function invocations

Suggested `.env` planning block:

```dotenv
SUPABASE_SNAPSHOT_PAYLOAD_KB=35
SUPABASE_EXPECTED_DB_SIZE_MB=120
SUPABASE_EXPECTED_STORAGE_SIZE_MB=120
SUPABASE_EXPECTED_MONTHLY_ACTIVE_USERS=1000
SUPABASE_EXPECTED_MONTHLY_THIRD_PARTY_USERS=0
SUPABASE_EXPECTED_PEAK_REALTIME_CONNECTIONS=25
SUPABASE_EXPECTED_REALTIME_MESSAGES_PER_MONTH=0
SUPABASE_EXPECTED_EDGE_FUNCTION_INVOCATIONS=0
```

The script is conservative on purpose: it fails when a hard limit is crossed and warns once a metric
passes 85% of the free-tier quota. It does **not** replace the Supabase usage dashboard; use it as a
repo-side preflight so risky config changes get caught before deploy.

## 4) Verification log template

Use this for each alert test or real incident:

- Date/time (UTC):
- Platform:
- Threshold crossed:
- Evidence link:
- Suspected driver:
- Mitigation applied:
- Result after 60 min:
- Follow-up action:
