#!/bin/sh
set -eu

backup_dir=/root/chink-backups
database_container=chink-saas-db-1
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/chink-$timestamp.dump"

umask 077
mkdir -p "$backup_dir"
tmp="$target.tmp"
trap 'rm -f "$tmp"' EXIT
docker exec "$database_container" sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$tmp"
test -s "$tmp"
mv "$tmp" "$target"
find "$backup_dir" -maxdepth 1 -name 'chink-*.dump' -type f -mtime +13 -delete
echo "Respaldo creado: $target"
