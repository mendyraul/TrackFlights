"""Once-per-service-day baselines. No airport click ever invokes this collector."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

AIRPORTS = {
    "MIA": (25.7959, -80.287),
    "FLL": (26.0742, -80.1506),
    "PBI": (26.6832, -80.0956),
    "MCO": (28.4294, -81.3089),
    "RSW": (26.5362, -81.7552),
}
ZONE = ZoneInfo("America/New_York")


def service_window(now):
    local = now.astimezone(ZONE)
    start = local.replace(hour=4, minute=0, second=0, microsecond=0)
    if local < start:
        return None
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC), start.date().isoformat()


async def collect_morning_boards(provider, client):
    import structlog

    from src.config import settings

    window = service_window(datetime.now(UTC))
    if window is None:
        return 0
    start, end, day = window
    count = 0
    for airport in AIRPORTS:
        for board in ("scheduled_arrivals", "scheduled_departures"):
            # Unique airport/date/board/attempt prevents duplicate spend after restarts.
            reservation = f"morning:{airport}:{day}:{board}:1"
            if not provider.budget.reserve(
                2, settings.aeroapi_board_cost_per_page_usd, reservation
            ):
                continue
            try:
                flights = await provider._request_board(
                    "K" + airport,
                    board,
                    {
                        "max_pages": 2,
                        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    },
                )
                records = []
                for index, raw in enumerate(flights):
                    record = provider.normalize(
                        raw, "arrival" if board.endswith("arrivals") else "departure"
                    )
                    record["id"] = raw.get("fa_flight_id") or f"{airport}:{day}:{board}:{index}"
                    # Preserve documented fields supplied by the original call; no enrichment.
                    record["details"] = {
                        key: raw[key]
                        for key in (
                            "codeshares",
                            "codeshares_iata",
                            "operator",
                            "operator_icao",
                            "operator_iata",
                            "registration",
                            "aircraft_type",
                            "route",
                            "filed_airspeed",
                            "filed_altitude",
                            "scheduled_off",
                            "estimated_off",
                            "actual_off",
                            "scheduled_on",
                            "estimated_on",
                            "actual_on",
                            "estimated_out",
                            "estimated_in",
                            "cancelled",
                            "diverted",
                        )
                        if key in raw
                    }
                    for key in (
                        "latitude",
                        "longitude",
                        "altitude_ft",
                        "heading",
                        "ground_speed_knots",
                        "vertical_speed_fpm",
                    ):
                        record.pop(key, None)
                    records.append(record)
                client.table("airport_schedule_baselines").upsert(
                    {
                        "airport": airport,
                        "service_date": day,
                        "board": board,
                        "fetched_at": datetime.now(UTC).isoformat(),
                        "flights": records,
                        "partial": True,
                        "page_limit": 2,
                    },
                    on_conflict="airport,service_date,board",
                ).execute()
                count += len(records)
            except Exception:
                structlog.get_logger().exception(
                    "Morning board failed; reservation retained", airport=airport, board=board
                )
    return count
