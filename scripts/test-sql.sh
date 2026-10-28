#!/usr/bin/env bash
# Apply every migration, in order, to a throwaway Postgres with Supabase's
# roles, then run supabase/tests/*.sql (each test RAISEs on failure).
#
#   Locally: needs Docker; starts and removes a postgres:16 container.
#   CI:      set DATABASE_URL to a Postgres service; psql must be on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  name="trackflights-sqltest-$$"
  docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null
  trap 'docker rm -f "$name" >/dev/null 2>&1' EXIT
  run_psql() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
else
  run_psql() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
fi

for _ in $(seq 60); do
  run_psql -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

# What Supabase provides before any migration runs.
run_psql <<'SQL' >/dev/null 2>&1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
SQL

for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  run_psql < "$f" 2>&1 | { grep -vE 'NOTICE|wal_level|logical changes|^$' || true; }
done

status=0
for t in supabase/tests/*.sql; do
  if run_psql -o /dev/null < "$t"; then echo "pass     $(basename "$t")"; else echo "FAIL     $(basename "$t")"; status=1; fi
done
exit $status
