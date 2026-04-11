# Cost Guardrails + Alerting Runbook (Vercel + Supabase)

## 1) Budget thresholds and owners

Set monthly hard/soft thresholds and route alerts to one owner channel.

- **Primary owner:** Raul
- **Primary channel:** GitHub issue + Telegram DM
- **Escalation window:** immediate for critical spend spikes, same-day for warning threshold

### Suggested thresholds

#### Vercel
- **Warning:** 60% of monthly budget consumed
- **Critical:** 85% of monthly budget consumed
- **Hard-stop review:** 95%+ (freeze non-essential preview builds)

#### Supabase
- **Warning:** 60% of plan quota (DB egress/storage/compute)
- **Critical:** 85% of quota or projected overage before cycle end
- **Hard-stop review:** sustained anomaly for >2 hours or projected 100% exhaustion

## 2) Alert setup checklist

### Vercel
- [ ] Enable usage alerts in Vercel billing settings
- [ ] Add warning + critical thresholds (60/85)
- [ ] Ensure owner email/notification route is active
- [ ] Verify first test alert delivery path

### Supabase
- [ ] Enable org/project usage alerts
- [ ] Add warning + critical quota thresholds
- [ ] Confirm notification recipients
- [ ] Validate quota metrics visible in project usage dashboard

### Cross-platform anomaly detection
- [ ] Daily check: spend trend vs previous 7-day average
- [ ] Flag anomaly if daily spend >1.8x rolling 7-day average
- [ ] Flag anomaly if API/egress growth >2x day-over-day without deploy note
- [ ] Log anomaly in `docs/evidence/cost/` with timestamp + source chart

## 3) Cost spike triage runbook

When a warning/critical alert fires:

1. **Confirm source**
   - Identify platform (Vercel/Supabase) and current threshold crossed
   - Capture evidence screenshot + timestamp

2. **Correlate with recent changes**
   - Check deploys in last 24h (preview/prod)
   - Check PR merge history and traffic anomalies

3. **Find top driver**
   - Vercel: build minutes, function invocations/duration, bandwidth
   - Supabase: DB egress, storage growth, realtime fanout, auth spikes

4. **Apply immediate containment (if critical)**
   - Pause non-essential preview deployments
   - Throttle/reduce polling intervals for ingestor jobs
   - Disable high-cardinality debug logging if active
   - Temporarily reduce expensive background jobs

5. **Stabilize and verify**
   - Re-check spend/usage after 30-60 minutes
   - Confirm trend is flattening
   - Open/update incident issue with root cause + mitigation

6. **Post-incident hardening**
   - Add one guardrail automation or budget alarm if missing
   - Document preventive action in release checklist

## 4) Verification log template

Use this for each alert test or real incident:

- Date/time (UTC):
- Platform:
- Threshold crossed:
- Evidence link:
- Suspected driver:
- Mitigation applied:
- Result after 60 min:
- Follow-up action:
