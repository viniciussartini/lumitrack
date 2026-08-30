#!/usr/bin/env bash
# deploy/update-production.sh
#
# Automatiza a promoção staging→main em produção (VPS, Caminho B do
# DEPLOY.md), substituindo o procedimento manual de ~5 comandos SSH — a
# Fase 13.7 já expôs o risco real desse procedimento manual: um
# `git reset --hard origin/main` encontrou 4 hotfixes aplicados à mão numa
# sessão anterior, nunca commitados (issue #257).
#
# Idempotente: rodar de novo sem nada novo em origin/main não faz nada além
# de confirmar que já está atualizado. Rodar como o usuário de serviço
# `lumitrack` (criado por deploy/provision-vm.sh, dono do checkout em
# /opt/lumitrack e membro do grupo docker):
#
#   sudo -u lumitrack ./deploy/update-production.sh
#
# Pré-requisito: backend/.env, iot-simulator/server/.env, deploy/.env e
# frontend/.env já configurados (ver DEPLOY.md, passo 5) — este script não
# cria nem edita nenhum deles.
#
# Nunca usa `git reset --hard`: divergência (local ou remota) é reportada
# e o script para, para o operador decidir — descartar histórico
# silenciosamente é exatamente o que causou o incidente da Fase 13.7.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ "$(id -un)" != "lumitrack" ]; then
    echo "ERRO: rode como o usuário de serviço 'lumitrack' (sudo -u lumitrack $0) — abortando." >&2
    exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERRO: branch atual é '$CURRENT_BRANCH', esperado 'main' — abortando." >&2
    exit 1
fi

# Falha com mensagem clara em vez de um `reset --hard` silencioso — é
# exatamente a lacuna que causou o incidente da Fase 13.7 (hotfixes
# aplicados à mão, nunca commitados, quase descartados sem comparação).
if [ -n "$(git status --porcelain)" ]; then
    echo "ERRO: há alterações não commitadas ou arquivos não rastreados em $REPO_DIR — abortando." >&2
    echo "Revise 'git status'/'git diff' manualmente (compare cada um contra origin/main antes de descartar) antes de rodar este script de novo." >&2
    exit 1
fi

echo "==> Buscando atualizações de origin/main..."
git fetch origin main

OLD_HEAD="$(git rev-parse HEAD)"
NEW_HEAD="$(git rev-parse origin/main)"

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
    echo "==> Já está atualizado (HEAD $OLD_HEAD) — nada a fazer."
    exit 0
fi

# Só segue se HEAD local é ancestral de origin/main — um fast-forward
# de verdade. Histórico divergente (commit local nunca publicado, ou
# force-push no remoto) precisa de decisão humana, não de um pull que
# reescreveria o que está aqui.
if ! git merge-base --is-ancestor "$OLD_HEAD" "$NEW_HEAD"; then
    echo "ERRO: HEAD local ($OLD_HEAD) não é ancestral de origin/main ($NEW_HEAD) — não é fast-forward." >&2
    echo "Histórico divergente: resolva manualmente (nunca com reset --hard automático)." >&2
    exit 1
fi

echo "==> Fast-forward: $OLD_HEAD -> $NEW_HEAD"
git pull --ff-only origin main

CHANGED_FILES="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")"

# Gatilho é "qualquer arquivo dentro da pasta que vira a imagem", não só
# Dockerfile/package-lock.json — o backend/Dockerfile faz `COPY . .` do
# diretório inteiro; rebuildar só quando o Dockerfile muda deixaria de
# reconstruir a imagem exatamente no caso mais comum de uma promoção
# staging→main (mudança de código em backend/src, sem tocar Dockerfile),
# rodando a versão ANTIGA do backend depois do "deploy".
rebuild_backend=false
if echo "$CHANGED_FILES" | grep -q '^backend/'; then
    rebuild_backend=true
fi

# Mesma lógica para o simulador — o Dockerfile faz `COPY server ./server`
# a partir da raiz do workspace `iot-simulator/` (contexto do build),
# usando o package-lock.json compartilhado ali.
rebuild_simulator=false
if echo "$CHANGED_FILES" | grep -qE '^iot-simulator/(server/|package(-lock)?\.json$)'; then
    rebuild_simulator=true
fi

# Frontend não tem imagem própria (site estático, servido pelo Caddy a
# partir de frontend/dist — ver DEPLOY.md passo 7.2); rebuild aqui significa
# rodar o build descartável de novo, não `docker compose build`.
rebuild_frontend=false
if echo "$CHANGED_FILES" | grep -q '^frontend/'; then
    rebuild_frontend=true
fi

if [ "$rebuild_backend" = false ] && [ "$rebuild_simulator" = false ] && [ "$rebuild_frontend" = false ]; then
    echo "==> Nenhum arquivo de backend/simulator/frontend mudou (só docs/config) — pulando rebuild e restart de serviço."
fi

if [ "$rebuild_backend" = true ]; then
    echo "==> Backend mudou — rebuildando a imagem..."
    docker compose build backend

    # Migração roda sempre que o backend é reconstruído (idempotente — sem
    # migração pendente, é um no-op) em vez de tentar detectar via git diff
    # exatamente quais arquivos de prisma/migrations/ são novos: mais simples
    # e mais seguro que uma heurística que pode errar. Usa o usuário
    # ADMINISTRATIVO do Postgres (deploy/.env) — o DATABASE_URL de
    # backend/.env é do usuário de runtime (lumitrack_app), sem permissão de
    # DDL, de propósito (ver DEPLOY.md, passo 7.1).
    echo "==> Aplicando migrações pendentes do Prisma..."
    # shellcheck disable=SC1091
    set -a && source deploy/.env && set +a
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public" \
        docker compose run --rm --user root -e DATABASE_URL backend npm run db:migrate:deploy

    echo "==> Recriando o container do backend..."
    docker compose up -d --force-recreate backend
fi

if [ "$rebuild_simulator" = true ]; then
    echo "==> Simulador mudou — rebuildando a imagem..."
    docker compose build simulator

    echo "==> Recriando o container do simulador..."
    docker compose up -d --force-recreate simulator

    # O simulador não persiste nada entre reinícios (estado só em memória,
    # de propósito) — recriá-lo sempre apaga a lista de medidores virtuais.
    echo "==> Recriando os 11 medidores virtuais (o simulador perdeu o estado ao reiniciar)..."
    ./deploy/seed-simulator-devices.sh
fi

if [ "$rebuild_frontend" = true ]; then
    echo "==> Frontend mudou — buildando (container descartável, mesmo procedimento do passo 7.2 do DEPLOY.md)..."
    docker run --rm -v "$REPO_DIR/frontend:/app" -w /app node:24-slim sh -c "npm ci && npm run build"
    chown -R lumitrack:lumitrack frontend/dist
fi

# Reiniciar o Caddy é barato (poucos segundos de interrupção) e cobre o
# caso do Caddyfile ter mudado (bind mount, só aplica em reinício) — sempre
# reiniciado, mesmo sem mudança detectada nos três blocos acima.
echo "==> Reiniciando o Caddy..."
docker compose --env-file deploy/.env up -d --force-recreate caddy

echo "==> Verificando /health do backend..."
if ! docker compose exec -T backend node -e "require('http').get('http://localhost:3333/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; then
    echo "ERRO: /health do backend não respondeu 200 depois do deploy — verifique 'docker compose logs backend'." >&2
    exit 1
fi

echo "==> Deploy concluído: HEAD agora em $NEW_HEAD."
