# apps/ml: training and evaluation

Models are trained here, on a laptop, and shipped to the Pi as small JSON
files. The Pi runs them with `apps/ingestor/src/ml/model_json.py`, which needs
no numpy or scikit-learn. Feature code lives in the ingestor
(`src/ml/forecast_features.py`, `src/ml/phase_features.py`) and is imported
here, so training and serving compute features the same way.

Every model is scored on data it never saw (the most recent days) against a
simple baseline, and is exported only if it wins. Results, shipped or not,
are written to `reports/` and to `apps/web/src/lib/model-metrics.json`, which
the Behind the Scenes page shows.

## Setup

```bash
cd apps/ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests -q        # parity, labeling and training tests (synthetic data)
```

## Traffic forecast (needs ~4 weeks of `traffic_hourly`)

```bash
# traffic_hourly is public-read, so the anon key is enough
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_KEY=<anon key> \
  python -m trackflights_ml.export_traffic data/traffic.csv

python -m trackflights_ml.train_forecast data/traffic.csv
# -> reports/forecast.md (+ .png), models/forecast.json only if it beat both baselines
```

Baselines: same hour last week, and the hour-of-week average. Candidates:
ridge regression and shallow gradient boosting. Metric: MAE on the held-out
week.

## Arrival/departure classifier (needs ~2 weeks of track log)

Turn on the track log on the Pi first (`TRACK_LOG_PATH` in `.env.adsb`), then:

```bash
scp <user>@<pi>:/path/to/tracks.db data/tracks.db
python -m trackflights_ml.train_phase data/tracks.db
# -> reports/phase.md, reports/phase_label_samples.png,
#    models/phase.json only if it beat the hand-written rules
```

Look at `phase_label_samples.png` before trusting the numbers: it maps 40
random labeled tracks so you can see the labels make sense. The report also
says how many positions were dropped as unlabeled; a window-mounted antenna
loses low aircraft early, which limits how many arrivals get a label.

Baseline: the current rules (`src/services/phase.py`). Candidates: logistic
regression, a depth-6 decision tree, shallow gradient boosting. Metric:
macro-F1 on the held-out days (whole days, so one flight never ends up on
both sides of the split).

## Installing a model on the Pi

```bash
scp models/forecast.json <user>@<pi>:/home/<user>/trackflights/forecast.json
scp models/phase.json    <user>@<pi>:/home/<user>/trackflights/phase.json
# in .env.adsb on the Pi:
#   FORECAST_MODEL_PATH=/home/<user>/trackflights/forecast.json
#   PHASE_MODEL_PATH=/home/<user>/trackflights/phase.json
sudo systemctl restart mia-ingestor-adsb
journalctl -u mia-ingestor-adsb -n 30 --no-pager   # "Forecast model loaded" / "Phase model loaded"
```

A missing or broken model file is logged and ignored: the ingestor keeps
running with no forecast, or with the rule-based phase.

Commit `reports/`, `models/` and `apps/web/src/lib/model-metrics.json` after
a training run so the repo and the site show the same results.
