#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/3] Web production dependency audit"
(
  cd "$ROOT_DIR"
  GENERATED_LOCKFILE=0
  if [[ ! -f package-lock.json ]]; then
    echo "package-lock.json missing; generating temporary lockfile for audit..."
    npm install --package-lock-only --ignore-scripts --workspaces >/dev/null
    GENERATED_LOCKFILE=1
  fi

  npm audit --omit=dev --audit-level=high --workspace=apps/web

  if [[ "$GENERATED_LOCKFILE" -eq 1 ]]; then
    rm -f package-lock.json
  fi
)

echo "[2/3] Ingestor dependency audit"
(
  cd "$ROOT_DIR/apps/ingestor"
  if ! command -v pip-audit >/dev/null 2>&1; then
    echo "pip-audit not found; creating local virtualenv toolchain..."
    python3 -m venv "$ROOT_DIR/.venv-security"
    "$ROOT_DIR/.venv-security/bin/python" -m pip install --upgrade pip >/dev/null
    "$ROOT_DIR/.venv-security/bin/pip" install pip-audit >/dev/null
    PIP_AUDIT_BIN="$ROOT_DIR/.venv-security/bin/pip-audit"
  else
    PIP_AUDIT_BIN="$(command -v pip-audit)"
  fi

  AUDIT_VENV="$ROOT_DIR/.venv-ingestor-audit"
  python3 -m venv "$AUDIT_VENV"
  "$AUDIT_VENV/bin/python" -m pip install --upgrade pip >/dev/null
  "$AUDIT_VENV/bin/pip" install -r requirements.txt >/dev/null
  SITE_PACKAGES="$($AUDIT_VENV/bin/python -c 'import site; print(site.getsitepackages()[0])')"

  # Temporary exception: CVE-2026-4539 (pygments 2.19.2) currently has no published fixed version.
  "$PIP_AUDIT_BIN" --strict --ignore-vuln CVE-2026-4539 --path "$SITE_PACKAGES"
)

echo "[3/3] Secret hygiene grep"
(
  cd "$ROOT_DIR"
  git grep -nE "(SUPABASE_SERVICE_ROLE|API_KEY|SECRET|TOKEN)" -- . ':!package-lock.json' || true
)

echo "Security preflight complete."
