"""Example/mock provider for local development and testing.

Generates synthetic flight data so you can run the system without
a real API key.
"""

import random
from datetime import datetime, timedelta, timezone
from typing import Any

from src.providers.base_provider import BaseFlightProvider

# Simulated airlines and routes at MIA
_AIRLINES = [
    ("AA", "American Airlines"),
    ("DL", "Delta Air Lines"),
    ("UA", "United Airlines"),
    ("B6", "JetBlue Airways"),
    ("NK", "Spirit Airlines"),
    ("LA", "LATAM Airlines"),
    ("AV", "Avianca"),
    ("CM", "Copa Airlines"),
    ("BA", "British Airways"),
    ("EK", "Emirates"),
]

_ORIGIN_AIRPORTS = [
    ("JFK", "John F. Kennedy International"),
    ("LAX", "Los Angeles International"),
    ("ORD", "O'Hare International"),
    ("ATL", "Hartsfield-Jackson Atlanta"),
    ("DFW", "Dallas/Fort Worth International"),
    ("LHR", "London Heathrow"),
    ("BOG", "El Dorado International"),
    ("GRU", "São Paulo–Guarulhos"),
    ("PTY", "Tocumen International"),
    ("MEX", "Mexico City International"),
    ("MAD", "Adolfo Suárez Madrid–Barajas"),
    ("CDG", "Charles de Gaulle"),
    ("DXB", "Dubai International"),
    ("SCL", "Santiago International"),
    ("EZE", "Ministro Pistarini International"),
]

_STATUSES = ["scheduled", "en_route", "en_route", "en_route", "landed", "delayed"]

_GATES = ["D1", "D5", "D12", "D22", "D30", "E2", "E7", "E14", "J3", "J8", "N5", "N12"]


class ExampleProvider(BaseFlightProvider):
    """Generates mock flight data for development."""

    @property
    def name(self) -> str:
        return "example"

    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        return [self._generate_flight("arrival", i) for i in range(25)]

    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        return [self._generate_flight("departure", i + 100) for i in range(25)]

    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        # Already in canonical format from _generate_flight
        return raw

    def _generate_flight(self, direction: str, seed: int) -> dict[str, Any]:
        rng = random.Random(seed + int(datetime.now(timezone.utc).timestamp()) // 300)
        airline_iata, airline_name = rng.choice(_AIRLINES)
        origin_iata, origin_name = rng.choice(_ORIGIN_AIRPORTS)
        flight_num = rng.randint(100, 9999)
        flight_iata = f"{airline_iata}{flight_num}"

        now = datetime.now(timezone.utc)
        sched_dep = now - timedelta(hours=rng.uniform(0.5, 6))
        sched_arr = sched_dep + timedelta(hours=rng.uniform(1.5, 10))
        delay = rng.choice([0, 0, 0, 5, 10, 15, 25, 45, 90])
        status = rng.choice(_STATUSES)

        # Position: scattered around South Florida / Caribbean approach
        lat = 25.7959 + rng.uniform(-3.0, 3.0) if status == "en_route" else None
        lon = -80.2870 + rng.uniform(-4.0, 4.0) if status == "en_route" else None
        alt = rng.randint(5000, 38000) if status == "en_route" else None
        heading = rng.uniform(0, 360) if status == "en_route" else None
        speed = rng.randint(200, 520) if status == "en_route" else None

        return {
            "flight_iata": flight_iata,
            "flight_icao": f"{airline_iata}L{flight_num}",
            "flight_number": str(flight_num),
            "airline_iata": airline_iata,
            "airline_name": airline_name,
            "aircraft_icao": rng.choice(["B738", "A320", "B77W", "A321", "E190", "B789"]),
            "aircraft_registration": f"N{rng.randint(100, 999)}{rng.choice('ABCDEFG')}{rng.choice('ABCDEFG')}",
            "direction": direction,
            "origin_iata": origin_iata if direction == "arrival" else "MIA",
            "origin_name": origin_name if direction == "arrival" else "Miami International Airport",
            "destination_iata": "MIA" if direction == "arrival" else origin_iata,
            "destination_name": "Miami International Airport" if direction == "arrival" else origin_name,
            "scheduled_departure": sched_dep.isoformat(),
            "actual_departure": (sched_dep + timedelta(minutes=delay)).isoformat() if status != "scheduled" else None,
            "scheduled_arrival": sched_arr.isoformat(),
            "actual_arrival": (sched_arr + timedelta(minutes=delay)).isoformat() if status == "landed" else None,
            "estimated_arrival": (sched_arr + timedelta(minutes=delay)).isoformat() if status == "en_route" else None,
            "status": status,
            "delay_minutes": delay,
            "latitude": lat,
            "longitude": lon,
            "altitude_ft": alt,
            "heading": heading,
            "ground_speed_knots": speed,
            "vertical_speed_fpm": rng.randint(-1500, 500) if status == "en_route" else None,
            "departure_terminal": rng.choice(["N", "S", ""]),
            "departure_gate": rng.choice(_GATES) if status != "scheduled" else None,
            "arrival_terminal": rng.choice(["N", "S", ""]),
            "arrival_gate": rng.choice(_GATES) if status in ("landed",) else None,
            "baggage_belt": str(rng.randint(1, 14)) if status == "landed" else None,
            "data_source": self.name,
        }
