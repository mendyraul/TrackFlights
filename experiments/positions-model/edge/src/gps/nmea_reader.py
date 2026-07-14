"""Read a position fix from the u-blox GPS HAT over the Pi's GPIO serial port.

The HAT streams NMEA-0183 sentences (GGA, RMC, ...) on ``/dev/serial0`` (an alias
for ``/dev/ttyAMA0`` / ``/dev/ttyS0``). We parse the sentences ourselves — a tiny,
dependency-free parser — so the only runtime dep is ``pyserial`` for the byte I/O,
which keeps the footprint small on a 1GB Pi 3. ``GGA`` is preferred because it
carries altitude; ``RMC`` is the lat/lon fallback.
"""

from __future__ import annotations

import time
from collections.abc import Iterable

import structlog

logger = structlog.get_logger()


def _dm_to_degrees(value: str, hemisphere: str) -> float | None:
    """Convert an NMEA ddmm.mmmm / dddmm.mmmm coordinate to signed decimal degrees."""
    if not value or "." not in value:
        return None
    dot = value.index(".")
    deg_len = dot - 2  # the last two digits before the decimal are whole minutes
    if deg_len < 0:
        return None
    try:
        degrees = float(value[:deg_len] or "0")
        minutes = float(value[deg_len:])
    except ValueError:
        return None
    decimal = degrees + minutes / 60.0
    if hemisphere in ("S", "W"):
        decimal = -decimal
    return decimal


def parse_nmea_fix(lines: Iterable[str]) -> dict[str, float | None] | None:
    """Parse NMEA sentences into a position fix.

    Returns ``{"latitude", "longitude", "altitude_m"}`` once a valid fix is found,
    or ``None`` if no usable GGA/RMC fix is present. Altitude may be ``None`` when
    only an RMC fix is available.
    """
    lat: float | None = None
    lon: float | None = None
    alt: float | None = None

    for raw in lines:
        line = raw.strip()
        if not line.startswith("$"):
            continue
        body = line[1:].split("*", 1)[0]  # drop the leading '$' and any checksum
        parts = body.split(",")
        if not parts or len(parts[0]) < 5:
            continue
        sentence = parts[0][2:]  # strip the talker id (GP/GN/GL/...)

        if sentence == "GGA" and len(parts) >= 10:
            fix_quality = parts[6]
            la = _dm_to_degrees(parts[2], parts[3])
            lo = _dm_to_degrees(parts[4], parts[5])
            if fix_quality not in ("", "0") and la is not None and lo is not None:
                lat, lon = la, lo
                try:
                    alt = float(parts[9]) if parts[9] else alt
                except ValueError:
                    pass
        elif sentence == "RMC" and len(parts) >= 7:
            if parts[2] == "A":  # 'A' = valid fix, 'V' = void
                la = _dm_to_degrees(parts[3], parts[4])
                lo = _dm_to_degrees(parts[5], parts[6])
                if la is not None and lo is not None and lat is None:
                    lat, lon = la, lo

    if lat is None or lon is None:
        return None
    return {"latitude": lat, "longitude": lon, "altitude_m": alt}


def read_fix(
    port: str,
    baud: int,
    timeout: float = 1.0,
    window_seconds: float = 5.0,
) -> dict[str, float | None] | None:
    """Open the serial port and read NMEA until a fix is found or the window elapses.

    Returns ``None`` (and logs a warning) if ``pyserial`` is missing or the port can't
    be read — callers fall back to the configured static station coordinates.
    """
    try:
        import serial  # imported lazily so the package works without the HAT present
    except ImportError:
        logger.warning("pyserial not installed; cannot read GPS HAT")
        return None

    collected: list[str] = []
    try:
        with serial.Serial(port, baudrate=baud, timeout=timeout) as ser:
            deadline = time.monotonic() + window_seconds
            while time.monotonic() < deadline:
                raw = ser.readline()
                if not raw:
                    continue
                collected.append(raw.decode("ascii", errors="ignore"))
                fix = parse_nmea_fix(collected)
                if fix is not None:
                    return fix
    except Exception as exc:  # serial errors, permission, missing device, etc.
        logger.warning("GPS serial read failed", port=port, error=str(exc))
        return None

    return parse_nmea_fix(collected)
