# Phase 4 — Predictive Analytics & Anomaly Detection

## Overview

Phase 4 adds three capabilities to the MIA Flight Tracker:

1. **Weather integration** — Ingests current conditions and short-term forecasts from Open-Meteo (free, no API key).
2. **Delay prediction engine** — Rule-based scoring that estimates delay risk, expected delay minutes, and on-time probability for every tracked flight.
3. **Anomaly detection** — Statistical rules that flag unusual traffic patterns (volume spikes, mass delays, cancellation bursts, weather impact).

All three run inside the existing Python poller on each cycle (weather refreshes every 5 minutes).

---

## Architecture

```
poller cycle
  ├── flight ingestion (every cycle)
  ├── weather ingestion (every 5 min)
  │     └── OpenMeteoProvider → weather_snapshots table
  ├── delay predictions
  │     ├── feature_engineering.compute_features()
  │     └── DelayPredictor.predict_batch() → delay_predictions table
  └── anomaly detection
        └── AnomalyDetector.detect() → traffic_anomalies table
```

### Key files

| Layer | File | Purpose |
|-------|------|---------|
| Weather | `providers/weather/base_weather_provider.py` | Abstract base class |
| Weather | `providers/weather/openmeteo_provider.py` | Open-Meteo API client |
| Weather | `services/weather_ingester.py` | Fetch, normalize, upsert |
| ML | `ml/feature_engineering.py` | Build feature vectors per flight |
| ML | `ml/delay_predictor.py` | Score flights, upsert predictions |
| ML | `ml/anomaly_detector.py` | Statistical anomaly rules |
| Orchestration | `worker/poller.py` | Runs all services each cycle |
| Frontend | `hooks/useWeather.ts` | Current weather + forecast |
| Frontend | `hooks/usePredictions.ts` | Predictions + high-risk flights |
| Frontend | `hooks/useAnomalies.ts` | Anomalies + realtime subscription |

---

## Prediction Methodology

### Feature Engineering

`feature_engineering.compute_features(flight, weather, hourly_stats)` produces a dict with:

| Feature group | Features | Weight in scoring |
|---------------|----------|-------------------|
| **Weather** | `weather_severity` (composite of wind, visibility, precipitation, thunderstorm, fog, freezing), `wind_speed_knots`, `visibility_km`, `precipitation_mm` | 35% |
| **Carrier** | `carrier_delay_rate` (historical lookup per IATA code, e.g. Spirit 0.32, Frontier 0.28) | 25% |
| **Time** | `is_peak_hour` (7–9, 11–13, 17–19), `hour_sin`/`hour_cos` (cyclical encoding) | 20% |
| **Traffic** | `traffic_ratio` (current volume / typical 50-flight baseline) | 20% |

#### Weather severity formula

```python
severity = 0.0
if wind > 20 kts:  severity += 0.3
if visibility < 5 km:  severity += 0.25
if precipitation > 2 mm:  severity += 0.2
if thunderstorm:  severity += 0.4
if fog:  severity += 0.3
if freezing:  severity += 0.25
# Capped at 1.0
```

### Scoring

`DelayPredictor._score(features)` computes a weighted sum:

```
delay_risk = 0.35 × weather_severity
           + 0.25 × carrier_delay_rate
           + 0.20 × (0.15 if is_peak_hour else 0.0)
           + 0.20 × max(0, (traffic_ratio - 1.0) × 0.3)
```

Result clamped to [0, 1]. The individual factors dict is stored in the `factors` JSONB column for explainability.

### Output predictions (per flight)

| `prediction_type` | Formula | Example |
|--------------------|---------|---------|
| `delay_risk` | Raw score (0–1) | 0.62 |
| `delay_minutes` | `risk × 45` (linear scale) | 28 min |
| `on_time_probability` | `1 − risk` | 0.38 |

Confidence is calculated as `0.5 + 0.3 × data_completeness` where data_completeness measures how many feature inputs were non-null.

### Expiry

Predictions are valid for 2 hours (`expires_at = now + 2h`). Expired rows are cleaned up each cycle.

---

## Anomaly Detection Logic

`AnomalyDetector.detect(flights, hourly_stats, weather)` runs six independent rules. Each produces zero or more anomalies with a severity score.

### Rules

| Rule | Trigger | Severity mapping |
|------|---------|-----------------|
| **Volume spike** | Arrivals or departures z-score > 2.0 vs. rolling 24h mean/stddev | score ≥ 0.8 → critical, ≥ 0.6 → high, ≥ 0.4 → medium, else low |
| **Mass delay** | > 30% of active flights delayed | Same mapping |
| **Delay distribution shift** | Average delay > 25 minutes | Same mapping |
| **Cancellation spike** | > 10% of flights cancelled | Same mapping |
| **Congestion** | > 80 flights active simultaneously | Same mapping |
| **Weather impact** | Weather severity > 0.5 AND delay rate > 1.5× baseline | Same mapping |

### Anomaly lifecycle

- New anomalies are inserted with `is_active = TRUE`.
- On each cycle, previously active anomalies whose conditions no longer hold are set `is_active = FALSE` with `resolved_at = now`.
- The `traffic_anomalies` table is added to `supabase_realtime` publication, so the frontend receives new anomalies instantly via the `useAnomalies` hook.

### Severity levels

| Level | Meaning | UI treatment |
|-------|---------|-------------|
| `critical` | Immediate operational impact | Red alert banner |
| `high` | Significant deviation | Orange alert |
| `medium` | Notable trend | Yellow alert |
| `low` | Informational | Blue info badge |

---

## Database Tables

### `weather_snapshots`
- Keyed by `(airport_iata, observed_at)`.
- Stores temperature, wind (speed/direction/gust), visibility, precipitation, cloud cover, humidity, pressure, dew point, boolean flags (thunderstorm, fog, freezing), weather code + description.

### `delay_predictions`
- Keyed by `(flight_iata, scheduled_departure, prediction_type)`.
- `prediction_type` enum: `delay_risk`, `delay_minutes`, `on_time_probability`.
- `factors` JSONB stores the weight breakdown for explainability.
- `expires_at` for automatic cleanup.

### `traffic_anomalies`
- `anomaly_type` enum: `volume_spike`, `mass_delay`, `delay_distribution_shift`, `cancellation_spike`, `congestion`, `weather_impact`.
- `severity` enum: `low`, `medium`, `high`, `critical`.
- Tracks `metric_value`, `baseline_value`, `deviation_pct` for context.
- `affected_flights` JSONB array, `affected_airlines` text array.
- `is_active` boolean + `resolved_at` timestamp for lifecycle.

---

## Frontend Components

| Component | Data source | Description |
|-----------|-------------|-------------|
| `WeatherCard` | `useWeather()` | Current conditions (temp, wind, visibility, precip, clouds, humidity) + alert badges (thunderstorm, fog, freezing, high winds) |
| `AnomalyAlerts` | `useAnomalies()` | Severity-styled alert cards at top of dashboard. Shows title, description, affected flights/airlines, time ago. |
| `HighRiskFlights` | `usePredictions()` | Top 10 flights with delay_risk > 0.3, sorted by risk. Shows risk %, predicted delay minutes, top 3 contributing factors, confidence. |
| `DelayPredictionChart` | `usePredictions()` | Histogram of all flights bucketed by risk level (0-10%, 10-30%, 30-50%, 50-70%, 70-100%) with color-coded bars. |

---

## Upgrading to ML Models

The current rule-based engine is designed for easy replacement:

1. **Feature engineering is decoupled** — `compute_features()` already produces a feature dict. A trained model can consume the same features.

2. **Swap the scorer** — Replace `DelayPredictor._score()` with model inference:
   ```python
   # Current (rule-based)
   risk = self._score(features)

   # Future (model-based)
   import joblib
   model = joblib.load("models/delay_v1.pkl")
   risk = model.predict_proba(feature_vector)[0][1]
   ```

3. **Training data** — The `flights_history` and `delay_predictions` tables accumulate labeled data. Once enough history exists (recommended: 30+ days), train a model:
   ```
   Features: compute_features() output
   Label: was the flight actually delayed > 15 min? (from flights_history)
   ```

4. **Model serving options**:
   - **Embedded** (current path): Load sklearn/xgboost model in the poller process. Simplest, works on Raspberry Pi.
   - **API**: Deploy model behind a FastAPI endpoint. Poller calls it via HTTP. Better for larger models.
   - **Scheduled batch**: Run predictions on a cron schedule instead of every poll cycle.

5. **Anomaly detection upgrade** — Replace statistical rules with isolation forest or autoencoder trained on historical traffic patterns.

### Recommended progression

| Stage | Approach | Data needed |
|-------|----------|-------------|
| Now | Rule-based scoring | None (domain knowledge) |
| 30 days | Logistic regression | ~50k flight records |
| 90 days | Gradient boosted trees (XGBoost) | ~150k records |
| 6 months | Neural network or ensemble | ~300k records + weather history |
