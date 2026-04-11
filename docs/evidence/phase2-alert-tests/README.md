# Phase 2 Alert-Test Evidence

This folder stores reliability drill evidence for Issue #3 (Observability + reliability hardening).

## Create a signal-specific evidence template

From repo root:

```bash
./scripts/create-alert-evidence.sh health-endpoint-failure
```

The script requires a signal name and writes files using this convention:

`YYYY-MM-DD-<signal>-test.md`

Examples:
- `2026-04-11-cpu-test.md`
- `2026-04-11-health-endpoint-failure-test.md`

Then fill out the generated markdown file and link it in the Issue #3 thread.
