# Alert Trigger Evidence Checklist (Issue #36)

Use this checklist for each critical alert synthetic test.

## 1) Test metadata
- [ ] Date/time (UTC + local)
- [ ] Environment (preview/staging/prod-safe simulation)
- [ ] Alert ID / signal name
- [ ] Test operator

## 2) Trigger procedure
- [ ] Exact trigger steps recorded
- [ ] Duration of trigger window recorded
- [ ] Safety rollback step defined before test start

## 3) Detection evidence
- [ ] Timestamp when condition crossed threshold
- [ ] Screenshot/log snippet of alert firing
- [ ] Channel confirmation (Telegram / issue link)
- [ ] Alert payload includes severity + owner + signal

## 4) Acknowledgement + response
- [ ] Who acknowledged
- [ ] Acknowledgement timestamp
- [ ] First mitigation action timestamp
- [ ] Time-to-acknowledge (TTA) captured

## 5) Recovery proof
- [ ] Recovery action performed
- [ ] Alert clear/resolved event captured
- [ ] Time-to-recover (TTR) captured
- [ ] No lingering side effects validated

## 6) Artifact storage
- [ ] Evidence file saved to `docs/evidence/phase2-alert-tests/`
- [ ] Filename uses pattern: `YYYY-MM-DD-<signal>-test.md`
- [ ] Linked from runbook or issue comment

---

## Suggested Evidence Template
```md
# Alert Test Evidence — <signal>
- Date:
- Environment:
- Operator:

## Trigger
...

## Detection
...

## Acknowledgement
...

## Recovery
...

## Metrics
- TTA:
- TTR:

## Artifacts
- Logs:
- Screenshots:
- Related issue/PR:
```
