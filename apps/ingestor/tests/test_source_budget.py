import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from src.services.aeroapi_budget import AeroApiBudget


def budget(path, cap=9.5):
    return AeroApiBudget(str(path), cap, 0.02)


def test_prices_windows_and_restart(tmp_path):
    path = tmp_path / "budget.json"
    assert budget(path).reserve(4, 0.05, "regional")
    assert not budget(path).reserve(4, 0.05, "regional")
    assert budget(path).reserve(1, 0.005, "arrival")
    assert budget(path).month_spend_usd == 0.205


def test_concurrent_reservations_never_exceed_cap(tmp_path):
    path = tmp_path / "budget.json"
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: budget(path, 0.1).reserve(1, 0.05), range(20)))
    assert sum(results) == 2
    assert budget(path).month_spend_usd == 0.1


def test_corrupt_ledger_fails_closed(tmp_path):
    path = tmp_path / "budget.json"
    path.write_text("broken")
    with pytest.raises(ValueError):
        budget(path).reserve(1, 0.005)
    assert path.read_text() == "broken"


def test_old_ledger_migrates_conservatively(tmp_path):
    path = tmp_path / "budget.json"
    path.write_text(json.dumps({"month": AeroApiBudget._current_month(), "queries": 100}))
    assert budget(path).month_spend_usd == 5
    assert budget(path).reserve(1, 0.005)
    assert budget(path).month_spend_usd == 5.005


def test_write_failure_prevents_request_reservation(tmp_path, monkeypatch):
    instance = budget(tmp_path / "budget.json")

    def fail(_):
        raise OSError("disk full")

    monkeypatch.setattr(instance, "_write", fail)
    with pytest.raises(OSError):
        instance.reserve(1, 0.05)
