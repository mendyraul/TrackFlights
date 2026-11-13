"""Client-side pacing so AeroAPI bursts stay under the account's rate limit.

The morning collector issues ten board requests and the regional snapshot one
more, all in the same poll cycle. Sent back-to-back, AeroAPI answers 429 after
the first few, and because failed requests keep their reservation (no paid
retries), those windows stay empty until the next service day. Counting the
result sets (pages) each request may return over a sliding minute avoids the
burst.
"""

import asyncio
import time
from collections import deque
from collections.abc import Awaitable, Callable

from src.config import settings

WINDOW_SECONDS = 60.0


class AeroApiPacer:
    """Keep the result sets requested in any 60 s window at or under the limit."""

    def __init__(
        self,
        result_sets_per_minute: float,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        # 0 (or less) disables pacing.
        self._limit = result_sets_per_minute
        self._clock = clock
        self._sleep = sleep
        self._sent: deque[tuple[float, int]] = deque()

    async def wait(self, pages: int) -> None:
        """Wait until `pages` more result sets fit in the window, then record them."""
        if self._limit <= 0:
            return
        pages = max(pages, 1)
        while True:
            now = self._clock()
            while self._sent and self._sent[0][0] <= now - WINDOW_SECONDS:
                self._sent.popleft()
            used = sum(p for _, p in self._sent)
            # A request larger than the limit goes alone in an empty window.
            if not self._sent or used + pages <= self._limit:
                self._sent.append((now, pages))
                return
            await self._sleep(self._sent[0][0] + WINDOW_SECONDS - now)


# One pacer per process: every AeroAPI call in the worker shares it.
pacer = AeroApiPacer(settings.aeroapi_result_sets_per_minute)
