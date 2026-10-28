#!/usr/bin/env python3
"""Read-only health probe; nonzero exit is suitable for an external monitor."""
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def check(base_url, fetch=urlopen):
    results = []
    for name in ("ready", "data"):
        request = Request(
            base_url.rstrip("/") + "/api/healthz/" + name,
            headers={"Accept": "application/json", "Cache-Control": "no-cache"},
        )
        try:
            with fetch(request, timeout=10) as response:
                body = json.loads(response.read(65536))
                healthy = response.status == 200
            if name == "ready":
                healthy = healthy and body.get("database") == "reachable"
            else:
                healthy = healthy and body.get("freshness") in {"live", "delayed", "silent"}
            results.append({"check": name, "healthy": healthy,
                            "state": body.get("freshness", body.get("status"))})
        except (HTTPError, OSError, ValueError):
            results.append({"check": name, "healthy": False, "state": "unavailable"})
    return results


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: check-ingestion-health.py https://your-deployment")
    results = check(sys.argv[1])
    print(json.dumps(results))
    raise SystemExit(0 if all(row["healthy"] for row in results) else 1)
