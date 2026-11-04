"""Independent position storage; only local observations feed receiver telemetry."""

import math
from datetime import UTC, datetime


def write_observations(client, source, flights):
    now = datetime.now(UTC).isoformat()
    rows = []
    for flight in flights:
        raw = flight.get("raw_data") or {}
        key = (
            raw.get("hex")
            or flight.get("aircraft_registration")
            or flight.get("id")
            or flight["flight_iata"]
        )
        if flight.get("latitude") is None or flight.get("longitude") is None:
            continue
        lat, lon = flight["latitude"], flight["longitude"]
        if (
            not math.isfinite(lat)
            or not math.isfinite(lon)
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            continue
        observed = flight.get("observed_at") or now
        try:
            age = (
                datetime.now(UTC).timestamp()
                - datetime.fromisoformat(observed.replace("Z", "+00:00")).timestamp()
            )
            if age < -30 or age > 48 * 3600:
                continue
        except (TypeError, ValueError):
            continue
        payload = {
            **flight,
            "id": f"{source}:{key}",
            "data_source": source,
            "icao_hex": raw.get("hex"),
            "model_phase": raw.get("phase"),
            "observed_at": observed,
            "updated_at": observed,
        }
        payload.pop("raw_data", None)
        rows.append(
            {
                "source": source,
                "aircraft_key": str(key),
                "observed_at": observed,
                "fetched_at": now,
                "payload": payload,
            }
        )
    if source == "flightaware":
        unique = {row["aircraft_key"]: row for row in rows}
        client.rpc("replace_regional_observations", {"p_rows": list(unique.values())}).execute()
    elif rows:
        # Collapse repeated aircraft in a batch before Postgres ON CONFLICT.
        unique = {row["aircraft_key"]: row for row in rows}
        client.table("aircraft_observations").upsert(
            list(unique.values()), on_conflict="source,aircraft_key"
        ).execute()
