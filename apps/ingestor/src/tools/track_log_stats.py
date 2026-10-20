"""Print how much space the track log uses and how fast it grows.

Run on the Pi after the ingestor has logged for a while (an hour minimum):

    python -m src.tools.track_log_stats /path/to/tracks.db [max_mb]

Use the output to pick TRACK_LOG_SAMPLE_SECONDS, TRACK_LOG_RETENTION_DAYS and
TRACK_LOG_MAX_MB for the disk you have.
"""

import json
import sqlite3
import sys

from src.services.track_log import describe


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    path = argv[0]
    max_mb = float(argv[1]) if len(argv) > 1 else None
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    print(json.dumps(describe(db, path, max_mb=max_mb), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
