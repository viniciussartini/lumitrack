#!/usr/bin/env bash
# deploy/backup-postgres.sh
#
# pg_dump do banco de produção via `docker compose exec`, cifrado com age
# (chave assimétrica — este script só precisa da pública) e com retenção.
# Chamado pelo timer systemd (deploy/lumitrack-backup.timer), mas pode
# rodar manualmente: ./deploy/backup-postgres.sh
#
# Requer rodar a partir da raiz do repositório clonado na VM (onde vive o
# docker-compose.yml), deploy/.env já configurado (POSTGRES_USER/DB,
# BACKUP_ENCRYPTION_PUBLIC_KEY) e `age` instalado (deploy/provision-vm.sh já
# instala). A chave PRIVADA correspondente nunca deve estar na VM — sem
# ela, um backup vazado não expõe e-mail/nome/hash de senha/IP em texto
# claro; procedimento de restauração testada em .claude/docs/DEPLOY.md.

set -euo pipefail

# Backup e pasta de backups só legíveis pelo usuário de serviço (600 e 700),
# mesmo cifrados: um dump não é dado para outros usuários da máquina listarem.
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# shellcheck disable=SC1091
set -a && source deploy/.env && set +a

if [ -z "${BACKUP_ENCRYPTION_PUBLIC_KEY:-}" ]; then
    echo "ERRO: BACKUP_ENCRYPTION_PUBLIC_KEY não definida em deploy/.env — abortando sem gravar backup em texto claro." >&2
    exit 1
fi

if ! command -v age >/dev/null 2>&1; then
    echo "ERRO: binário 'age' não encontrado — deploy/provision-vm.sh deveria tê-lo instalado. Abortando sem gravar backup em texto claro." >&2
    exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/opt/lumitrack/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/lumitrack-$TIMESTAMP.sql.gz.age"
TMP_FILE="$BACKUP_FILE.tmp"

mkdir -p "$BACKUP_DIR"
# `mkdir -p` e o umask não mudam o que já existe: pasta criada por uma versão
# anterior do script (umask 022) e dumps antigos continuam abertos. Estas duas
# linhas são idempotentes e fazem a afirmação "700 e 600" valer em qualquer
# servidor, não só nos novos.
chmod 700 "$BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'lumitrack-*' ! -perm 600 -exec chmod 600 {} +

echo "==> Fazendo dump de $POSTGRES_DB, cifrando para $BACKUP_FILE..."
# Escreve em .tmp e só promove para o nome final se o pipe inteiro
# terminar com sucesso (set -o pipefail acima) — sem isso, um pg_dump ou
# age que falha no meio deixa um arquivo truncado com nome de backup bom,
# indistinguível de um backup íntegro até a hora da restauração.
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" |
    gzip |
    age -r "$BACKUP_ENCRYPTION_PUBLIC_KEY" >"$TMP_FILE"
mv "$TMP_FILE" "$BACKUP_FILE"

echo "==> Dump concluído ($(du -h "$BACKUP_FILE" | cut -f1))."

echo "==> Removendo dumps com mais de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" \( -name "lumitrack-*.sql.gz.age" -o -name "lumitrack-*.sql.gz" \) -mtime "+$RETENTION_DAYS" -print -delete

echo "==> Backup concluído. Lembrete: um backup nunca restaurado não é um backup —"
echo "    procedimento de restauração testada em .claude/docs/DEPLOY.md e"
echo "    registro em deploy/BACKUP-RESTORE-LOG.md."
