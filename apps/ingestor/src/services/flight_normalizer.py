"""Flight normalization service — orchestrates provider.normalize() calls."""

import re
from typing import Any

import structlog

from src.providers.base_provider import BaseFlightProvider

logger = structlog.get_logger()

# ICAO airline designator -> IATA code, for carriers commonly seen around MIA.
# Lets ADS-B callsigns (e.g. "AAL123") key to the same flights_current row as
# schedule feeds that use IATA idents (e.g. "AA123").
ICAO_TO_IATA_AIRLINE = {
    "AAL": "AA",  # American
    "AAY": "G4",  # Allegiant
    "ACA": "AC",  # Air Canada
    "ASA": "AS",  # Alaska
    "AVA": "AV",  # Avianca
    "BAW": "BA",  # British Airways
    "BWA": "BW",  # Caribbean
    "CMP": "CM",  # Copa
    "DAL": "DL",  # Delta
    "EDV": "9E",  # Endeavor
    "ENY": "MQ",  # Envoy
    "FDX": "FX",  # FedEx
    "FFT": "F9",  # Frontier
    "GJS": "G7",  # GoJet
    "IBE": "IB",  # Iberia
    "JBU": "B6",  # JetBlue
    "JIA": "OH",  # PSA
    "KLM": "KL",  # KLM
    "LAN": "LA",  # LATAM
    "NKS": "NK",  # Spirit
    "RPA": "YX",  # Republic
    "SKW": "OO",  # SkyWest
    "SWA": "WN",  # Southwest
    "TAM": "JJ",  # LATAM Brasil
    "UAL": "UA",  # United
    "UPS": "5X",  # UPS
    "VIR": "VS",  # Virgin Atlantic
    "VOI": "Y4",  # Volaris
}

_ICAO_CALLSIGN_RE = re.compile(r"^([A-Z]{3})(\d[\dA-Z]*)$")


def icao_callsign_to_iata(callsign: str) -> str:
    """Convert an ICAO callsign ("AAL123") to an IATA ident ("AA123").

    Returns the callsign unchanged when the airline prefix is unknown or the
    callsign doesn't look like an airline flight (e.g. GA registrations).
    """
    match = _ICAO_CALLSIGN_RE.match(callsign.strip().upper())
    if not match:
        return callsign
    prefix, flight_number = match.groups()
    iata = ICAO_TO_IATA_AIRLINE.get(prefix)
    if iata is None:
        return callsign
    return f"{iata}{flight_number.lstrip('0') or '0'}"


def normalize_batch(
    provider: BaseFlightProvider,
    raw_flights: list[dict[str, Any]],
    direction: str,
) -> list[dict[str, Any]]:
    """Normalize a batch of raw flights from a provider.

    Skips flights that fail normalization and logs warnings.
    """
    normalized: list[dict[str, Any]] = []

    for raw in raw_flights:
        try:
            record = provider.normalize(raw, direction)
            if not record.get("flight_iata"):
                logger.warning("Skipping flight with no IATA code", raw=raw)
                continue
            normalized.append(record)
        except Exception:
            logger.exception("Failed to normalize flight", raw=raw)

    return normalized
