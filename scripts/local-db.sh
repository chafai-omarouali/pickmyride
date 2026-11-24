#!/usr/bin/env bash
# Start een lokale PostgreSQL voor ontwikkeling/tests (poort 5433) en maakt de databases aan.
# Niet voor productie. Vereist PostgreSQL 15+ binaries.
set -euo pipefail
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DATA="${PGDATA_DIR:-/tmp/pickmyride-pg}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="su postgres -c"; fi
run() { if [ -n "$RUNAS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ ! -d "$DATA/data" ]; then
  mkdir -p "$DATA"; [ -n "$RUNAS" ] && chown postgres "$DATA"
  run "$PGBIN/initdb -D $DATA/data -U postgres -A trust >/dev/null"
fi
if ! run "$PGBIN/pg_ctl -D $DATA/data status" >/dev/null 2>&1; then
  run "$PGBIN/pg_ctl -D $DATA/data -o \"-p 5433 -k $DATA -c listen_addresses=127.0.0.1\" -l $DATA/log start" >/dev/null
  sleep 2
fi
for db in pickmyride pickmyride_test; do
  psql -h 127.0.0.1 -p 5433 -U postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 \
    || psql -h 127.0.0.1 -p 5433 -U postgres -qc "create database $db"
done
echo "PostgreSQL draait op 127.0.0.1:5433 (databases: pickmyride, pickmyride_test)"
