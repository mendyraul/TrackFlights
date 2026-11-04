"""Conservative airport-relative progress, independent of official schedule fields."""

import time
from datetime import UTC, datetime, timedelta

from src.services.flight_normalizer import icao_callsign_to_iata
from src.services.morning_board import AIRPORTS
from src.services.phase import bearing_deg, distance_km

NEARBY_FIELDS = {
    **AIRPORTS,
    "OPF": (25.907, -80.2784),
    "TMB": (25.6479, -80.4328),
    "FXE": (26.1973, -80.1707),
    "HWO": (26.0012, -80.2407),
    "SFB": (28.7776, -81.2375),
    "APF": (26.1526, -81.7753),
}


def ident(flight):
    return icao_callsign_to_iata(
        (flight.get("flight_icao") or flight.get("flight_iata") or "").strip().upper()
    )


def infer_progress(previous, current, airport):
    """Two fresh observations 15–180s apart; ground evidence is required for landing."""
    if previous is None:
        return None
    elapsed = current["time"] - previous["time"]
    if not 15 <= elapsed <= 180:
        return None
    lat, lon = AIRPORTS[airport]
    distance = distance_km(lat, lon, current["latitude"], current["longitude"])
    prior_distance = distance_km(lat, lon, previous["latitude"], previous["longitude"])
    altitude = current.get("altitude_ft")
    vrate = current.get("vertical_speed_fpm")
    if altitude is None:
        return None
    if altitude == 0 and distance <= 3:
        # Reject overlapping fields when another airport is closer.
        if any(
            distance_km(a, b, current["latitude"], current["longitude"]) < distance
            for key, (a, b) in NEARBY_FIELDS.items()
            if key != airport
        ):
            return None
        if previous.get("altitude_ft") == 0 and prior_distance <= 3:
            return (
                "Likely landed"
                if previous.get("approach_at", 0) >= current["time"] - 600
                else "Observed near airport"
            )
    if vrate is None:
        return None
    if (
        (
            previous.get("altitude_ft") == 0
            and prior_distance <= 3
            or previous.get("departed_at", 0) >= current["time"] - 180
        )
        and vrate >= 300
        and distance > prior_distance
    ):
        return "Departing"
    heading = current.get("heading")
    target = bearing_deg(current["latitude"], current["longitude"], lat, lon)
    offset = abs((heading - target + 180) % 360 - 180) if heading is not None else 180
    if (
        distance <= 20
        and 0 < altitude < 3000
        and vrate <= -300
        and offset <= 75
        and distance < prior_distance
        and (previous.get("vertical_speed_fpm") or 0) <= -300
    ):
        return "Approaching"
    return None


class AirportProgress:
    def __init__(self, client):
        self.client = client
        self.baselines = []
        self.loaded_at = 0
        self.previous = {}
        self.written = {}

    def record(self, observations):
        now = time.time()
        if now - self.loaded_at > 3600:
            cutoff = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
            result = (
                self.client.table("airport_schedule_baselines")
                .select("airport,service_date,board,flights")
                .gte("service_date", cutoff)
                .execute()
            )
            self.baselines = result.data or []
            self.loaded_at = now
        for observation in observations:
            if observation.get("data_source") != "adsb1090":
                continue
            stamp = datetime.fromisoformat(
                observation["observed_at"].replace("Z", "+00:00")
            ).timestamp()
            if not -30 <= now - stamp <= 120:
                continue
            matches = []
            for baseline in self.baselines:
                for flight in baseline["flights"]:
                    if not ident(flight) or ident(flight) != ident(observation):
                        continue
                    direction = baseline["board"]
                    field = (
                        "scheduled_arrival"
                        if direction.endswith("arrivals")
                        else "scheduled_departure"
                    )
                    endpoint = (
                        "destination_iata" if direction.endswith("arrivals") else "origin_iata"
                    )
                    if flight.get(endpoint) != baseline["airport"] or not flight.get(field):
                        continue
                    scheduled = datetime.fromisoformat(
                        flight[field].replace("Z", "+00:00")
                    ).timestamp()
                    if -3 * 3600 <= stamp - scheduled <= 12 * 3600:
                        matches.append((baseline, flight))
            # Arrival and departure of the same leg can match; ambiguity within a board cannot.
            for baseline, flight in matches:
                if (
                    sum(
                        b["airport"] == baseline["airport"] and b["board"] == baseline["board"]
                        for b, _ in matches
                    )
                    != 1
                ):
                    continue
                if (
                    observation.get("aircraft_registration")
                    and flight.get("aircraft_registration")
                    and observation["aircraft_registration"] != flight["aircraft_registration"]
                ):
                    continue
                key = (
                    baseline["airport"],
                    baseline["service_date"],
                    baseline["board"],
                    flight["id"],
                )
                current = {
                    **observation,
                    "time": stamp,
                    "icao_hex": observation.get("icao_hex")
                    or (observation.get("raw_data") or {}).get("hex"),
                }
                previous = self.previous.get(key)
                if previous and stamp - previous["time"] < 15:
                    continue
                if previous and (
                    previous.get("icao_hex") != current.get("icao_hex")
                    or stamp - previous["time"] > 180
                ):
                    previous = None
                if previous:
                    current["approach_at"] = previous.get("approach_at", 0)
                    current["departed_at"] = previous.get("departed_at", 0)
                state = infer_progress(previous, current, baseline["airport"])
                if state == "Approaching":
                    current["approach_at"] = stamp
                if state == "Likely landed":
                    current["approach_at"] = stamp
                if state == "Departing":
                    current["departed_at"] = stamp
                self.previous[key] = current
                if state and (
                    (
                        baseline["board"].endswith("arrivals")
                        and state in ("Approaching", "Likely landed", "Observed near airport")
                    )
                    or (
                        baseline["board"].endswith("departures")
                        and state in ("Departing", "Observed near airport")
                    )
                ):
                    last = self.written.get(key)
                    if last and last[0] == state and stamp - last[1] < 30:
                        continue
                    self.client.table("airport_flight_progress").upsert(
                        {
                            "airport": key[0],
                            "service_date": key[1],
                            "board": key[2],
                            "flight_key": key[3],
                            "state": state,
                            "observed_at": observation["observed_at"],
                            "evidence": {
                                "source": "adsb1090",
                                "icao_hex": observation.get("icao_hex")
                                or (observation.get("raw_data") or {}).get("hex"),
                                "latitude": observation["latitude"],
                                "longitude": observation["longitude"],
                            },
                        },
                        on_conflict="airport,service_date,board,flight_key",
                    ).execute()
                    self.written[key] = (state, stamp)
        self.previous = {
            key: value for key, value in self.previous.items() if now - value["time"] < 900
        }
        self.written = {key: value for key, value in self.written.items() if now - value[1] < 900}
