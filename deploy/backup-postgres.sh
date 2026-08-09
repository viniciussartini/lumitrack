#!/usr/bin/env bash
# deploy/backup-postgres.sh — Fase 13.5 Bloco A, issue #192.
#
# pg_dump do banco de produção via `docker compose exec`, com retenção.
# Chamado pelo timer systemd (deploy/lumitrack-backup.timer), mas pode
# rodar manualmente: ./deploy/backup-postgres.sh
#
# Requer rodar a partir da raiz do repositório clonado na VM (onde vive o
# docker-compose.yml) e deploy/.env já configurado (POSTGRES_USER/DB).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# shellcheck disable=SC1091
set -a && source deploy/.env && set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/lumitrack/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/lumitrack-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Fazendo dump de $POSTGRES_DB para $BACKUP_FILE..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"$BACKUP_FILE"

echo "==> Dump concluído ($(du -h "$BACKUP_FILE" | cut -f1))."

echo "==> Removendo dumps com mais de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name "lumitrack-*.sql.gz" -mtime "+$RETENTION_DAYS" -print -delete

echo "==> Backup concluído. Lembrete: um backup nunca testado não é um backup —"
echo "    procedimento de restauração testada em .claude/docs/DEPLOY.md."
