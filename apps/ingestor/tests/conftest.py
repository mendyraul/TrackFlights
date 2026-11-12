import pytest
from src.services.aeroapi_pacer import pacer


@pytest.fixture(autouse=True)
def no_aeroapi_pacing(monkeypatch):
    """Tests must not sleep between fake AeroAPI calls; test_aeroapi_pacer covers spacing."""
    monkeypatch.setattr(pacer, "_limit", 0)
