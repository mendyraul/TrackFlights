"""Train and evaluate the traffic forecast.

    python -m trackflights_ml.train_forecast data/traffic.csv

Writes reports/forecast.md (+ .png) and, only if a model beats both baselines
on the held-out week, models/forecast.json for the Pi.
"""

import argparse
import json
import sys
from pathlib import Path

from trackflights_ml import site_metrics
from trackflights_ml.forecast import NotEnoughData, train_and_export


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    p.add_argument("traffic_csv")
    p.add_argument("--model-out", default="models/forecast.json")
    p.add_argument("--report-out", default="reports/forecast.md")
    p.add_argument("--test-days", type=int, default=7)
    p.add_argument(
        "--site-metrics",
        default=str(site_metrics.DEFAULT_PATH),
        help="where the website reads results from; '' to skip",
    )
    args = p.parse_args(argv)
    try:
        summary = train_and_export(
            args.traffic_csv, args.model_out, args.report_out, args.test_days
        )
    except NotEnoughData as e:
        print(f"Not enough data yet: {e}", file=sys.stderr)
        return 1
    if args.site_metrics:
        site_metrics.record("forecast", summary, Path(args.site_metrics))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
