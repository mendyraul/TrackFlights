"""Record evaluation results where the website can show them.

The Behind the Scenes page reads apps/web/src/lib/model-metrics.json and only
ever shows numbers written here by a real training run, including runs where
the model did not beat its baseline (and so wasn't shipped).
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

DEFAULT_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "model-metrics.json"
)


def record(key: str, summary: dict[str, Any], path: Path = DEFAULT_PATH) -> None:
    data = json.loads(path.read_text()) if path.exists() else {}
    data[key] = {**summary, "evaluated_at": datetime.now(UTC).strftime("%Y-%m-%d")}
    path.write_text(json.dumps(data, indent=2) + "\n")
