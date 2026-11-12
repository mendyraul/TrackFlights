import asyncio
from unittest.mock import AsyncMock, MagicMock

from src.providers import flightaware_provider
from src.providers.flightaware_provider import FlightAwareProvider
from src.services.aeroapi_pacer import AeroApiPacer


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.sleeps = []

    def __call__(self):
        return self.now

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def test_requests_fill_the_window_then_wait_for_it_to_slide():
    clock = FakeClock()
    pacer = AeroApiPacer(6, clock=clock, sleep=clock.sleep)

    async def run():
        await pacer.wait(2)  # 2/6, immediate
        await pacer.wait(2)  # 4/6, immediate
        await pacer.wait(4)  # 8 > 6: waits until both earlier calls leave the window
        await pacer.wait(1)  # 5/6, immediate

    asyncio.run(run())
    assert clock.sleeps == [60.0]


def test_old_requests_leave_the_window():
    clock = FakeClock()
    pacer = AeroApiPacer(6, clock=clock, sleep=clock.sleep)

    async def run():
        await pacer.wait(4)
        clock.now += 30
        await pacer.wait(4)  # 8 > 6: waits the remaining 30 s
        clock.now += 61
        await pacer.wait(6)  # window empty again

    asyncio.run(run())
    assert clock.sleeps == [30.0]


def test_request_larger_than_limit_goes_alone():
    clock = FakeClock()
    pacer = AeroApiPacer(3, clock=clock, sleep=clock.sleep)

    async def run():
        await pacer.wait(4)  # empty window: allowed
        await pacer.wait(1)  # waits for the 4-page call to age out

    asyncio.run(run())
    assert clock.sleeps == [60.0]


def test_ten_morning_boards_stay_under_rate():
    """Ten 2-page boards plus the 4-page regional search: never over 6 sets/min."""
    clock = FakeClock()
    pacer = AeroApiPacer(6, clock=clock, sleep=clock.sleep)
    sent = []

    async def run():
        for pages in [2] * 10 + [4]:
            await pacer.wait(pages)
            sent.append((clock.now, pages))

    asyncio.run(run())
    for start, _ in sent:
        in_window = sum(p for t, p in sent if start <= t < start + 60)
        assert in_window <= 6


def test_zero_disables_pacing():
    clock = FakeClock()
    pacer = AeroApiPacer(0, clock=clock, sleep=clock.sleep)
    asyncio.run(pacer.wait(4))
    asyncio.run(pacer.wait(4))
    assert clock.sleeps == []


def test_board_request_waits_for_its_pages(monkeypatch):
    provider = FlightAwareProvider.__new__(FlightAwareProvider)
    provider.base_url = "https://example.test/aeroapi"
    provider.api_key = "test"
    fake_pacer = MagicMock()
    fake_pacer.wait = AsyncMock()
    monkeypatch.setattr(flightaware_provider, "pacer", fake_pacer)
    response = MagicMock()
    response.json.return_value = {"scheduled_arrivals": []}
    http = AsyncMock()
    http.get.return_value = response
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(flightaware_provider.httpx, "AsyncClient", lambda **_: context)

    asyncio.run(provider._request_board("KMIA", "scheduled_arrivals", {"max_pages": 2}))

    fake_pacer.wait.assert_awaited_once_with(2)
