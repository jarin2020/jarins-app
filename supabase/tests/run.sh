#!/usr/bin/env bash
# Applies the migrations to a throwaway database and runs the RLS assertions.
set -euo pipefail

DB="${JARINS_TEST_DB:-jarins_rls_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../.."

psql -d postgres -qc "drop database if exists $DB" >/dev/null
psql -d postgres -qc "create database $DB" >/dev/null
trap 'psql -d postgres -qc "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

# `authenticated` is cluster-wide, so create it only if this is the first run.
psql -d postgres -qtc "select 1 from pg_roles where rolname = 'authenticated'" \
  | grep -q 1 || psql -d postgres -qc "create role authenticated nologin" >/dev/null

psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/00_supabase_stubs.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Running RLS assertions against $DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/01_rls.test.sql" 2>&1 \
  | grep -E "PASS|FAIL" | sed 's/^psql.*NOTICE:  //'
echo "All RLS assertions passed."
