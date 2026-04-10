# Realtime Throughput Baseline (Phase 3 Slice 3)

Owner: Rico  
Source issue: `mendyraul/TrackFlights#4`  
Goal: define explicit throughput assumptions for Supabase Realtime and a repeatable measurement flow before scale cutover work.

## Throughput assumptions (initial baseline)

These are **initial guardrails** and should be updated after each release evidence run.

### Write budget (`flights_current`)
- Normal load target: **<= 2,000 updates/minute** sustained
- Burst tolerance: **<= 3,500 updates/minute** for <= 5 minutes
- Hard alert threshold: **> 4,000 updates/minute** for 2 consecutive minutes

### Subscriber fanout budget
- Expected active subscribers per region channel: **<= 150**
- Expected total concurrent subscribers: **<= 500**
- Hard alert threshold: **> 750** concurrent subscribers

### Event lag envelope (write -> client receipt)
- p50 lag target: **<= 800 ms**
- p95 lag target: **<= 2,000 ms**
- p99 lag target: **<= 4,000 ms**
- Incident threshold: p95 > 4,000 ms for 10+ minutes

## Measurement recipe (repeatable)

Run this sequence during release preflight and after significant ingestion/realtime changes.

1. **Record system context**
   - branch + commit SHA
   - DB size snapshot
   - expected active channels

2. **Capture write throughput for 15 minutes**
   - run ingestor in normal mode
   - count updates/minute into `flights_current`
   - record min/avg/p95/max writes/minute

3. **Capture fanout count for 15 minutes**
   - sample active subscriptions each minute
   - record peak concurrent subscribers

4. **Capture event lag sample**
   - choose a known update marker (timestamp/id)
   - log server write time + first client receive time
   - compute p50/p95/p99 lag across sample window

5. **Compare to guardrails and classify**
   - PASS: all metrics under target/threshold
   - WATCH: targets missed but incident thresholds not crossed
   - FAIL: any incident threshold crossed

## Evidence template

Use: `docs/evidence/realtime-throughput-template.md`

Store completed evidence in `docs/evidence/realtime/` using filename:
`YYYY-MM-DD-realtime-throughput.md`

## Exit criteria for this slice
- [x] Throughput assumptions documented
- [x] Measurement procedure documented
- [x] Evidence template linked and naming convention defined
