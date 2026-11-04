"""Conservative, durable AeroAPI accounting. Credit eligibility is account-specific."""

import fcntl
import json
import os
from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path


def units(value: float) -> int:
    return int(Decimal(str(value)) * 10000)


class AeroApiBudget:
    def __init__(self, state_path: str, monthly_budget_usd: float, cost_per_query_usd: float):
        self.state_path = Path(state_path)
        self.monthly_budget_usd = monthly_budget_usd
        self.cost_per_query_usd = cost_per_query_usd

    @staticmethod
    def _current_month() -> str:
        return datetime.now(UTC).strftime("%Y-%m")

    @contextmanager
    def _locked(self):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.state_path.with_suffix(".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def _read(self):
        try:
            state = json.loads(self.state_path.read_text())
            if not isinstance(state, dict) or not isinstance(state.get("month"), str):
                raise ValueError("Invalid budget ledger")
            queries = state.get("queries", 0)
            if not isinstance(queries, int) or queries < 0:
                raise ValueError("Invalid query count")
            # Older counters used one price for everything. Migrate conservatively.
            spent = state.get("spent_units", queries * max(units(self.cost_per_query_usd), 500))
            if not isinstance(spent, int) or spent < 0:
                raise ValueError("Invalid spend")
            if state["month"] == self._current_month():
                return {**state, "spent_units": spent}
        except FileNotFoundError:
            pass
        return {"month": self._current_month(), "queries": 0, "spent_units": 0, "windows": {}}

    def _write(self, state):
        temp = self.state_path.with_suffix(".tmp")
        with temp.open("w") as output:
            json.dump(state, output)
            output.flush()
            os.fsync(output.fileno())
        temp.replace(self.state_path)
        directory = os.open(self.state_path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def reserve(self, pages: int, price: float, window: str | None = None) -> bool:
        if pages <= 0 or price <= 0:
            raise ValueError("Positive pages and price required")
        with self._locked():
            state = self._read()
            if window and window in state.get("windows", {}):
                return False
            cost = pages * units(price)
            if state["spent_units"] + cost > units(self.monthly_budget_usd):
                return False
            state["spent_units"] += cost
            state["queries"] += pages
            # Reserve the polling window before HTTP too: crash/restart cannot duplicate it.
            if window:
                state.setdefault("windows", {})[window] = True
            self._write(state)
            return True

    @property
    def month_queries(self):
        with self._locked():
            return self._read()["queries"]

    @property
    def month_spend_usd(self):
        with self._locked():
            return self._read()["spent_units"] / 10000

    def allow(self, queries=1):
        return self.month_spend_usd + queries * self.cost_per_query_usd <= self.monthly_budget_usd

    def record(self, queries=1):
        if not self.reserve(queries, self.cost_per_query_usd):
            raise ValueError("Budget exhausted")

    def projected_month_end_usd(self):
        now = datetime.now(UTC)
        return round(self.month_spend_usd * 31 / max(now.day - 1 + now.hour / 24, 0.04), 2)

    def snapshot(self):
        spent = self.month_spend_usd
        return {
            "aeroapi_month": self._current_month(),
            "aeroapi_queries_mtd": self.month_queries,
            "aeroapi_spend_mtd_usd": spent,
            "aeroapi_budget_usd": self.monthly_budget_usd,
            "aeroapi_projected_month_usd": self.projected_month_end_usd(),
            "aeroapi_budget_used_pct": round(100 * spent / self.monthly_budget_usd, 1),
        }
