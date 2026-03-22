"""Delay prediction engine.

Currently uses a rules-based scoring system.
Designed for easy replacement with a trained ML model (scikit-learn, XGBoost, etc.).

Produces:
  - delay_risk: probability that the flight will be delayed (0.0–1.0)
  - delay_minutes: expected delay in minutes
  - on_time_probability: probability of arriving on time (0.0–1.0)
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from supabase import Client

from src.ml.feature_engineering import compute_features

logger = structlog.get_logger()

MODEL_VERSION = "rules-v1"


class DelayPredictor:
    """Rule-based delay prediction service.

    Future: Replace score_flight() internals with a trained model while
    keeping the same interface.
    """

    def __init__(self, db: Client) -> None:
        self.db = db

    def predict_batch(
        self,
        flights: list[dict[str, Any]],
        weather: dict[str, Any] | None = None,
        traffic_stats: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Generate predictions for a batch of flights.

        Returns list of prediction records ready for DB upsert.
        """
        predictions: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=1)

        for flight in flights:
            features = compute_features(flight, weather, traffic_stats)
            scores = self._score(features)

            base_record = {
                "flight_iata": flight.get("flight_iata", ""),
                "scheduled_departure": flight.get("scheduled_departure"),
                "direction": flight.get("direction", "arrival"),
                "model_version": MODEL_VERSION,
                "feature_snapshot": features,
                "expires_at": expires.isoformat(),
            }

            # delay_risk prediction
            predictions.append({
                **base_record,
                "prediction_type": "delay_risk",
                "predicted_value": scores["delay_risk"],
                "confidence": scores["confidence"],
                "factors": scores["factors"],
            })

            # delay_minutes prediction
            predictions.append({
                **base_record,
                "prediction_type": "delay_minutes",
                "predicted_value": scores["expected_delay_minutes"],
                "confidence": scores["confidence"],
                "factors": scores["factors"],
            })

            # on_time_probability
            predictions.append({
                **base_record,
                "prediction_type": "on_time_probability",
                "predicted_value": scores["on_time_probability"],
                "confidence": scores["confidence"],
                "factors": scores["factors"],
            })

        return predictions

    def upsert_predictions(self, predictions: list[dict[str, Any]]) -> int:
        """Write predictions to the database."""
        if not predictions:
            return 0

        batch_size = 50
        total = 0
        for i in range(0, len(predictions), batch_size):
            batch = predictions[i : i + batch_size]
            self.db.table("delay_predictions").upsert(
                batch,
                on_conflict="flight_iata,scheduled_departure,prediction_type",
            ).execute()
            total += len(batch)

        logger.info("Predictions upserted", count=total)
        return total

    def cleanup_expired(self) -> int:
        """Remove expired predictions."""
        now = datetime.now(timezone.utc).isoformat()
        result = (
            self.db.table("delay_predictions")
            .delete()
            .lt("expires_at", now)
            .execute()
        )
        count = len(result.data or [])
        if count:
            logger.info("Cleaned up expired predictions", count=count)
        return count

    def _score(self, features: dict[str, float]) -> dict[str, Any]:
        """Rule-based scoring engine.

        Weights are manually tuned. Replace with model.predict() in future.
        """
        # ── Factor weights ───────────────────────────────────────────
        weather_weight = 0.35
        carrier_weight = 0.25
        time_weight = 0.20
        traffic_weight = 0.20

        # ── Weather score (0 = no risk, 1 = severe) ─────────────────
        weather_score = features.get("weather_severity", 0.0)

        # ── Carrier score ────────────────────────────────────────────
        carrier_score = features.get("carrier_historical_delay_rate", 0.20)

        # ── Time score ───────────────────────────────────────────────
        time_score = 0.0
        if features.get("is_peak_hour"):
            time_score += 0.3
        if features.get("is_evening"):
            time_score += 0.2  # Evening cascading delays
        if features.get("is_weekend"):
            time_score -= 0.1  # Weekends tend to be lighter
        time_score = max(0.0, min(time_score, 1.0))

        # ── Traffic score ────────────────────────────────────────────
        delayed_pct = features.get("current_delayed_pct", 0.0)
        traffic_score = min(delayed_pct * 2.0, 1.0)  # Scale up

        # ── Composite delay risk ─────────────────────────────────────
        delay_risk = (
            weather_score * weather_weight
            + carrier_score * carrier_weight
            + time_score * time_weight
            + traffic_score * traffic_weight
        )
        delay_risk = max(0.0, min(delay_risk, 1.0))

        # ── Expected delay minutes ───────────────────────────────────
        # Map risk to minutes using a non-linear curve
        if delay_risk < 0.2:
            expected_minutes = delay_risk * 15  # 0-3 min
        elif delay_risk < 0.5:
            expected_minutes = 3 + (delay_risk - 0.2) * 40  # 3-15 min
        elif delay_risk < 0.8:
            expected_minutes = 15 + (delay_risk - 0.5) * 100  # 15-45 min
        else:
            expected_minutes = 45 + (delay_risk - 0.8) * 150  # 45-75 min

        on_time_probability = max(0.0, 1.0 - delay_risk)

        # Confidence based on feature availability
        confidence = 0.5  # Base
        if features.get("weather_severity", -1) >= 0:
            confidence += 0.2  # Have weather data
        if features.get("carrier_historical_delay_rate", 0) > 0:
            confidence += 0.15
        if features.get("current_traffic_volume", 0) > 0:
            confidence += 0.15
        confidence = min(confidence, 1.0)

        factors = {
            "weather": round(weather_score * weather_weight, 3),
            "carrier_history": round(carrier_score * carrier_weight, 3),
            "time_of_day": round(time_score * time_weight, 3),
            "traffic": round(traffic_score * traffic_weight, 3),
        }

        return {
            "delay_risk": round(delay_risk, 4),
            "expected_delay_minutes": round(expected_minutes, 1),
            "on_time_probability": round(on_time_probability, 4),
            "confidence": round(confidence, 2),
            "factors": factors,
        }
