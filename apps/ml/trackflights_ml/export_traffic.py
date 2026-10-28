"""Download traffic_hourly to CSV for training.

    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon key> \
        python -m trackflights_ml.export_traffic data/traffic.csv

traffic_hourly is public-read, so the anon key is enough; no service-role
key needs to leave the Pi. It's ~24 small rows per day, so the egress is
negligible.
"""

import csv
import os
import sys
from pathlib import Path

import httpx

COLUMNS = [
    "hour",
    "unique_aircraft",
    "arriving",
    "departing",
    "overflights",
    "on_ground",
    "peak_concurrent",
    "max_range_km",
    "polls",
    "temp_c",
    "wind_kt",
    "gust_kt",
    "precip_mm",
    "visibility_km",
    "is_thunderstorm",
]
PAGE = 1000


def fetch_all(url: str, key: str) -> list[dict]:
    rows: list[dict] = []
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(timeout=30) as client:
        while True:
            resp = client.get(
                f"{url.rstrip('/')}/rest/v1/traffic_hourly",
                params={"select": ",".join(COLUMNS), "order": "hour.asc"},
                headers={**headers, "Range": f"{len(rows)}-{len(rows) + PAGE - 1}"},
            )
            resp.raise_for_status()
            page = resp.json()
            rows.extend(page)
            if len(page) < PAGE:
                return rows


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print(
            "Set SUPABASE_URL and SUPABASE_KEY (the anon key works).", file=sys.stderr
        )
        return 2
    rows = fetch_all(url, key)
    out = Path(argv[0])
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} hours -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
