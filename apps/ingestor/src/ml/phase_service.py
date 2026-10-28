"""Run the learned arrival/departure classifier on every poll.

Keeps the last ~3 minutes of positions per aircraft (for the altitude/speed
change features), builds features with the same function training used, and
returns each aircraft's phase in the site's vocabulary. Aircraft on the
ground are "on-ground" without asking the model (it is trained on airborne
positions only).
"""

from collections import deque
from typing import Any

from src.ml.model_json import JsonModel
from src.ml.phase_features import CLASS_TO_PHASE, phase_features

HISTORY_SECONDS = 180
FORGET_AFTER_SECONDS = 300


class PhaseClassifier:
    def __init__(self, model: JsonModel) -> None:
        unknown = set(model.classes) - set(CLASS_TO_PHASE)
        if model.kind != "classifier" or unknown:
            raise ValueError(f"not a phase model (kind={model.kind}, unknown classes={unknown})")
        self.model = model
        self._history: dict[str, deque[dict[str, Any]]] = {}
        self._last_seen: dict[str, float] = {}

    @property
    def version(self) -> str:
        return self.model.version

    def apply(self, observations: list[dict[str, Any]], now: float) -> dict[str, str]:
        """Classify each observation; updates obs["phase"] and returns {hex: phase}."""
        phases: dict[str, str] = {}
        for obs in observations:
            hex_id = obs["hex"]
            history = self._history.setdefault(hex_id, deque())
            self._last_seen[hex_id] = now
            point = {
                "ts": now,
                "lat": obs.get("lat"),
                "lon": obs.get("lon"),
                "alt_ft": obs.get("alt_ft"),
                "vrate_fpm": obs.get("vrate_fpm"),
                "gs_kt": obs.get("gs_kt"),
                "track": obs.get("track"),
            }
            if obs.get("on_ground"):
                phase = "on-ground"
            else:
                features = phase_features(point, list(history))
                phase = (
                    CLASS_TO_PHASE[self.model.predict_label(features)]
                    if features is not None
                    else obs.get("phase", "unknown")
                )
            obs["phase"] = phase
            phases[hex_id] = phase

            history.append(point)
            while history and now - history[0]["ts"] > HISTORY_SECONDS:
                history.popleft()

        for hex_id in [h for h, t in self._last_seen.items() if now - t > FORGET_AFTER_SECONDS]:
            self._history.pop(hex_id, None)
            self._last_seen.pop(hex_id, None)
        return phases
