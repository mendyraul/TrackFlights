"""Hard monthly spend guard for FlightAware AeroAPI queries.

AeroAPI bills per query (a board fetch with max_pages=N bills N queries). The
free credit is $10/month; this guard stops the provider from issuing queries
once projected spend reaches the configured budget, so a wrong per-query price
assumption can never cause an overage.

The counter persists to a local JSON state file on the Pi (zero egress,
survives restarts) and rolls over automatically on month boundaries.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import structlog

logger = structlog.get_logger()


class AeroApiBudget:
    """Tracks query spend for the current calendar month (UTC)."""

    def __init__(
        self,
        state_path: str,
        monthly_budget_usd: float,
        cost_per_query_usd: float,
    ) -> None:
        self.state_path = Path(state_path)
        self.monthly_budget_usd = monthly_budget_usd
        self.cost_per_query_usd = cost_per_query_usd
        self._month = self._current_month()
        self._queries = 0
        self._load()

    @staticmethod
    def _current_month() -> str:
        return datetime.now(UTC).strftime("%Y-%m")

    def _load(self) -> None:
        try:
            state = json.loads(self.state_path.read_text())
            if state.get("month") == self._current_month():
                self._month = state["month"]
                self._queries = int(state.get("queries", 0))
        except FileNotFoundError:
            pass
        except (ValueError, KeyError, OSError):
            logger.warning("Unreadable AeroAPI budget state, starting fresh")

    def _persist(self) -> None:
        try:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self.state_path.write_text(json.dumps({"month": self._month, "queries": self._queries}))
        except OSError:
            logger.exception("Failed to persist AeroAPI budget state")

    def _rollover_if_needed(self) -> None:
        month = self._current_month()
        if month != self._month:
            logger.info(
                "AeroAPI budget month rollover",
                previous_month=self._month,
                previous_queries=self._queries,
            )
            self._month = month
            self._queries = 0
            self._persist()

    @property
    def month_queries(self) -> int:
        self._rollover_if_needed()
        return self._queries

    @property
    def month_spend_usd(self) -> float:
        return round(self.month_queries * self.cost_per_query_usd, 4)

    def allow(self, queries: int = 1) -> bool:
        """Whether issuing `queries` more billed queries stays within budget."""
        self._rollover_if_needed()
        projected = (self._queries + queries) * self.cost_per_query_usd
        if projected > self.monthly_budget_usd:
            logger.warning(
                "AeroAPI budget exhausted — polling halted until month rollover",
                month=self._month,
                queries_this_month=self._queries,
                spend_usd=self.month_spend_usd,
                budget_usd=self.monthly_budget_usd,
            )
            return False
        return True

    def record(self, queries: int = 1) -> None:
        self._rollover_if_needed()
        self._queries += queries
        self._persist()

    def projected_month_end_usd(self) -> float:
        """Naive linear projection of month-end spend from the burn rate so far."""
        now = datetime.now(UTC)
        day_fraction = (now.day - 1 + now.hour / 24) or 0.04
        days_in_month = 30
        return round(self.month_spend_usd * days_in_month / day_fraction, 2)

    def snapshot(self) -> dict[str, object]:
        """Structured log payload for the per-cycle spend projection."""
        return {
            "aeroapi_month": self._month,
            "aeroapi_queries_mtd": self.month_queries,
            "aeroapi_spend_mtd_usd": self.month_spend_usd,
            "aeroapi_projected_month_usd": self.projected_month_end_usd(),
            "aeroapi_budget_usd": self.monthly_budget_usd,
            "aeroapi_budget_used_pct": (
                round(100 * self.month_spend_usd / self.monthly_budget_usd, 1)
                if self.monthly_budget_usd
                else 0.0
            ),
        }
