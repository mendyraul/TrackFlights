#!/usr/bin/env bash
# Guard: if a change touches the database schema (supabase/migrations/**) but
# does NOT update the hand-maintained TypeScript types
# (apps/web/src/types/database.ts), the types have likely drifted from the
# schema. Fail with instructions to regenerate and reconcile.
#
# This is a pure git-diff check — it needs no database, so it runs cheaply in
# CI and pre-commit. Compares the working range against the merge base with
# origin/main (falls back to HEAD~1 locally).
set -euo pipefail

MIGRATIONS_GLOB="supabase/migrations/"
TYPES_FILE="apps/web/src/types/database.ts"

# Determine the base ref to diff against.
if git rev-parse --verify --quiet origin/main >/dev/null; then
  BASE="$(git merge-base origin/main HEAD 2>/dev/null || echo "")"
fi
if [ -z "${BASE:-}" ]; then
  BASE="$(git rev-parse --verify --quiet HEAD~1 || echo "")"
fi
if [ -z "${BASE:-}" ]; then
  echo "check-types-drift: no base ref to compare against; skipping."
  exit 0
fi

CHANGED="$(git diff --name-only "$BASE" HEAD)"

migration_changed=false
types_changed=false
while IFS= read -r f; do
  case "$f" in
    "$MIGRATIONS_GLOB"*) migration_changed=true ;;
    "$TYPES_FILE") types_changed=true ;;
  esac
done <<< "$CHANGED"

if [ "$migration_changed" = true ] && [ "$types_changed" = false ]; then
  echo "ERROR: a migration under ${MIGRATIONS_GLOB} changed, but ${TYPES_FILE} was not updated." >&2
  echo "The generated TypeScript types may have drifted from the schema." >&2
  echo "Run:  npm run db:gen-types   (after 'npx supabase start')" >&2
  echo "then reconcile apps/web/src/types/database.ts and commit it." >&2
  exit 1
fi

echo "check-types-drift: OK (migration_changed=${migration_changed}, types_changed=${types_changed})."
