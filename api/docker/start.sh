#!/bin/sh
# Runs when the public demo container starts (D19, B15).
#
# 1. Loads fresh sample data, so every start gives visitors the same demo.
#    Render's free plan has no lasting disk, so nothing else would survive a
#    restart anyway.
# 2. Starts Apache in the foreground, as the container's main process.
set -eu

# Apache's config reads PORT. Render sets it; 10000 is Render's default.
export PORT="${PORT:-10000}"

DB="${DEBONAIRE_DB:-/var/www/api/var/debonaire.sqlite}"
DB_DIR="$(dirname "$DB")"

php /var/www/api/database/seed.php --fresh

# Apache runs PHP as www-data. SQLite writes the database file and creates
# its -wal and -shm files next to it, so www-data must own the folder and
# everything in it.
chown -R www-data:www-data "$DB_DIR"

exec apache2-foreground
