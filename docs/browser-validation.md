# Browser validation

Run `npm run build` followed by `npm run test:browser`. Install Chromium with
`npx playwright install chromium` on a new machine. The tests start a local production
server on port 3109 and run in Chromium with desktop and Pixel 7 viewports. CI already
runs this suite in the `web / production browser` job.

The suite checks:

- Navigation through Map, Flights, Analytics, and Behind the Scenes, including active
  tabs, populated content, uncaught browser errors, and horizontal page overflow.
- Selecting aircraft and checking callsign, operator, altitude, speed, track, vertical
  rate, inferred phase, hex, registration, type, coordinates, route, and Miami schedule times.
- Refreshing a selected aircraft, including its marker label; closing details with
  Escape or the close button; missing telemetry and zero readings on the ground.
- Searching and filtering the map and flight board, sorting altitude, and keeping
  aircraft without positions on the board.
- Analytics totals, operator and altitude charts, history, forecast, weather, alerts,
  schedule charts, and calendar dates. Empty data and API failures have separate journeys.

## Existing data and complete snapshots

`apps/web/e2e/fixtures/existing-*.json` contains a small, unchanged sample of the public
API responses captured on November 3, 2026. It includes duplicate rows for one hex
address so the suite checks that only the newest aircraft position appears. Synthetic
fixtures exercise sections for which the existing data has no records. API responses
and basemap tiles are intercepted in the new journeys, so they don't require a live
receiver or modify the database.

To repeat the audit with the complete current snapshot:

```bash
curl -fsS https://track-flights-web.vercel.app/api/flights/snapshot -o /tmp/trackflights-snapshot.json
curl -fsS https://track-flights-web.vercel.app/api/dashboard/summary -o /tmp/trackflights-summary.json
FLIGHT_SNAPSHOT_PATH=/tmp/trackflights-snapshot.json \
DASHBOARD_SUMMARY_PATH=/tmp/trackflights-summary.json \
npm run test:browser
```

`existing-data.spec.ts` uses the supplied files instead of the bundled sample. It checks
the board against the newest row per hex, opens every distinct aircraft with a position
on both viewports, and compares the displayed telemetry and available schedule with the
capture. Its analytics assertions currently expect the captured stale positions, stale
weather, and empty history; update those expectations once the receiver is producing
fresh positions or history becomes available.

The November 3 audit passed all 30 desktop/mobile checks using all 250 API rows
(160 distinct hex addresses). The newest position was July 19, 2026; the receiver
heartbeat was absent. Weather was also from July 19, and traffic history, forecasts,
schedule analytics, and alerts were empty. These checks verify that the UI displays
the supplied data correctly; the replay does not establish real-world flight accuracy
or current receiver operation.

Failures save screenshots and traces under `apps/web/test-results/`. Open a trace with
`npx playwright show-trace <path-to-trace.zip>` to inspect the page and requests.
