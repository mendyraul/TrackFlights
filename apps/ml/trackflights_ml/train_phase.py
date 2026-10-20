"""Label the Pi's track log and train the arrival/departure classifier.

    scp <user>@<pi>:/path/to/tracks.db data/tracks.db
    python -m trackflights_ml.train_phase data/tracks.db

Writes reports/phase.md (+ label spot-check image) and, only if a model beats
the current rules on held-out days, models/phase.json for the Pi.
"""

import argparse
import json
import sys

from trackflights_ml.phase import NotEnoughData, train_and_export


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    p.add_argument("tracks_db")
    p.add_argument("--model-out", default="models/phase.json")
    p.add_argument("--report-out", default="reports/phase.md")
    p.add_argument(
        "--max-rows",
        type=int,
        default=200_000,
        help="cap on training samples (random subset); 0 = all",
    )
    args = p.parse_args(argv)
    try:
        summary = train_and_export(
            args.tracks_db,
            args.model_out,
            args.report_out,
            max_rows=args.max_rows or None,
        )
    except NotEnoughData as e:
        print(f"Not enough data yet: {e}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
