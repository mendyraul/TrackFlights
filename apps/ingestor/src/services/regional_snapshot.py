"""Daily, bounded FlightAware snapshot. Never a local receiver telemetry input."""

from datetime import UTC, datetime

import httpx

from src.config import settings
from src.services.aeroapi_pacer import pacer
from src.services.observations import write_observations


async def fetch_regional_snapshot(provider, client):
    now = datetime.now(UTC)
    if now.hour < 12:
        return
    if not provider.budget.reserve(
        4, settings.aeroapi_search_cost_per_page_usd, now.strftime("%Y-%m-%d") + ":regional"
    ):
        return
    south, west, north, east = (float(v) for v in settings.aeroapi_bbox.split(","))
    await pacer.wait(4)
    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.get(
            provider.base_url + "/flights/search",
            headers={"x-apikey": provider.api_key},
            params={"query": f'-latlong "{south} {west} {north} {east}"', "max_pages": 4},
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload.get("flights"), list):
        raise ValueError("FlightAware search response missing flights")
    flights = []
    for raw in payload.get("flights", []):
        position = raw.get("last_position") or {}
        timestamp = position.get("timestamp")
        if not timestamp:
            continue
        record = provider.normalize(raw, "arrival")
        record["observed_at"] = timestamp
        record["status"] = "en_route"
        record["id"] = raw.get("fa_flight_id") or raw.get("ident")
        record["raw_data"] = {"hex": raw.get("icao_address")}
        flights.append(record)
    write_observations(client, "flightaware", flights)
