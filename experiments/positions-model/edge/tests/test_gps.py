"""Tests for NMEA parsing and station location resolution."""

from src import config
from src.gps.nmea_reader import parse_nmea_fix
from src.gps.station import StationLocator

# A real-ish GGA sentence near KMIA (lat 2547.595' N, lon 08017.434' W, alt 3.0m).
GGA = "$GPGGA,123519,2547.5950,N,08017.4340,W,1,08,0.9,3.0,M,46.9,M,,*47"
RMC = "$GPRMC,123519,A,2547.5950,N,08017.4340,W,022.4,084.4,230394,003.1,W*6A"


def test_parse_gga_fix():
    fix = parse_nmea_fix([GGA])
    assert fix is not None
    assert round(fix["latitude"], 3) == round(25 + 47.595 / 60, 3)
    assert round(fix["longitude"], 3) == round(-(80 + 17.434 / 60), 3)
    assert fix["altitude_m"] == 3.0


def test_parse_rmc_fallback_has_no_altitude():
    fix = parse_nmea_fix([RMC])
    assert fix is not None
    assert fix["altitude_m"] is None
    assert fix["latitude"] > 0
    assert fix["longitude"] < 0


def test_parse_ignores_invalid_and_void():
    assert parse_nmea_fix([]) is None
    assert parse_nmea_fix(["garbage", "$GPRMC,,V,,,,,,,,,*53"]) is None
    # GGA with fix quality 0 (no fix) is rejected.
    assert parse_nmea_fix(["$GPGGA,123519,2547.5950,N,08017.4340,W,0,00,,,M,,M,,*4F"]) is None


def test_station_locator_uses_gps_when_enabled(monkeypatch):
    monkeypatch.setattr(config.settings, "gps_enabled", True)
    monkeypatch.setattr(config.settings, "station_id", "pi-gps")
    locator = StationLocator(
        fix_reader=lambda: {"latitude": 25.5, "longitude": -80.5, "altitude_m": 5.0}
    )
    station = locator.get_station(force=True)
    assert station["source"] == "gps"
    assert station["latitude"] == 25.5
    assert station["station_id"] == "pi-gps"


def test_station_locator_falls_back_to_static(monkeypatch):
    monkeypatch.setattr(config.settings, "gps_enabled", False)
    monkeypatch.setattr(config.settings, "station_lat", 26.0)
    monkeypatch.setattr(config.settings, "station_lon", -81.0)
    monkeypatch.setattr(config.settings, "station_alt_m", 2.0)
    locator = StationLocator(fix_reader=lambda: None)
    station = locator.get_station(force=True)
    assert station["source"] == "static"
    assert station["latitude"] == 26.0
    assert station["altitude_m"] == 2.0


def test_station_locator_none_when_no_source(monkeypatch):
    monkeypatch.setattr(config.settings, "gps_enabled", False)
    monkeypatch.setattr(config.settings, "station_lat", None)
    monkeypatch.setattr(config.settings, "station_lon", None)
    locator = StationLocator(fix_reader=lambda: None)
    assert locator.get_station(force=True) is None
