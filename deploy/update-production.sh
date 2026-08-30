#!/usr/bin/env bash
# deploy/update-production.sh
#
# Automatiza a promoção staging→main em produção (VPS, Caminho B do
# DEPLOY.md), substituindo o procedimento manual de ~5 comandos SSH — o
# procedimento manual já expôs risco real na prática: um
# `git reset --hard origin/main` encontrou hotfixes aplicados à mão numa
# sessão anterior, nunca commitados.
#
# Idempotente e retomável: se um passo falhar no meio, a próxima execução
# refaz exatamente o que faltou — o progresso é rastreado por
# deploy/.last-deployed-sha (git-ignorado), não pelo HEAD do git (que já
# avança no `git pull`, antes de qualquer build). Rodar como o usuário de
# serviço `lumitrack` (criado por deploy/provision-vm.sh, dono do checkout
# em /opt/lumitrack e membro do grupo docker):
#
#   sudo -u lumitrack ./deploy/update-production.sh
#
# Pré-requisito: backend/.env, iot-simulator/server/.env, deploy/.env e
# frontend/.env já configurados (ver DEPLOY.md, passo 5) — este script não
# cria nem edita nenhum deles.
#
# Nunca usa `git reset --hard`: divergência (local ou remota) é reportada
# e o script para, para o operador decidir — descartar histórico
# silenciosamente é exatamente o tipo de incidente que este script existe
# para evitar.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# `docker-compose.yml` só interpola `${DOMAIN}` (usado pelo Caddy) a partir
# de `deploy/.env`, e essa interpolação só acontece com a flag `--env-file`
# — confirmado que a variável de ambiente `COMPOSE_ENV_FILE` NÃO é lida
# para isso nesta versão do compose (testado: `DOMAIN` continua vazio sem a
# flag, mesmo com a env var setada). Array reaproveitado em todo comando
# `docker compose` deste script, pra não repetir o caminho literal nem
# esquecer a flag num comando novo que alguém adicione depois.
COMPOSE_ENV=(--env-file "$REPO_DIR/deploy/.env")

STATE_FILE="$REPO_DIR/deploy/.last-deployed-sha"

# Espera até o comando ter sucesso, ou desiste após 10 tentativas (~30s) —
# cobre a janela entre `docker compose up -d` devolver o prompt (container
# CRIADO) e o processo lá dentro estar de fato pronto (healthcheck com
# `start_period`, ou o Express do simulador ainda inicializando). Sem isso,
# um `exec` logo após o recreate falha por timing, não por erro real — e
# como o container já foi trocado nesse ponto, um falso negativo aqui
# derrubaria o deploy à toa (sem nada de útil pra uma re-execução refazer).
wait_for() {
    local description="$1"
    shift
    local attempt
    for attempt in $(seq 1 10); do
        if "$@" >/dev/null 2>&1; then
            return 0
        fi
        sleep 3
    done
    echo "ERRO: $description não respondeu depois de 10 tentativas (~30s)." >&2
    return 1
}

if [ "$(id -un)" != "lumitrack" ]; then
    echo "ERRO: rode como o usuário de serviço 'lumitrack' (sudo -u lumitrack $0) — abortando." >&2
    exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERRO: branch atual é '$CURRENT_BRANCH', esperado 'main' — abortando." >&2
    exit 1
fi

# Falha com mensagem clara em vez de um `reset --hard` silencioso — um
# hotfix aplicado à mão, nunca commitado, não pode ser descartado sem
# comparação.
if [ -n "$(git status --porcelain)" ]; then
    echo "ERRO: há alterações não commitadas ou arquivos não rastreados em $REPO_DIR — abortando." >&2
    echo "Revise 'git status'/'git diff' manualmente (compare cada um contra origin/main antes de descartar) antes de rodar este script de novo." >&2
    exit 1
fi

echo "==> Buscando atualizações de origin/main..."
git fetch origin main

CURRENT_HEAD="$(git rev-parse HEAD)"
NEW_HEAD="$(git rev-parse origin/main)"

# Só segue se HEAD local é ancestral de origin/main — um fast-forward de
# verdade. Histórico divergente (commit local nunca publicado, ou
# force-push no remoto) precisa de decisão humana, não de um pull que
# reescreveria o que está aqui. Baseado no HEAD git real (não no arquivo de
# estado abaixo) — são preocupações diferentes: esta checa se dá pra puxar
# com segurança; o arquivo de estado checa o que já foi de fato aplicado.
if [ "$CURRENT_HEAD" != "$NEW_HEAD" ] &&
    ! git merge-base --is-ancestor "$CURRENT_HEAD" "$NEW_HEAD"; then
    echo "ERRO: HEAD local ($CURRENT_HEAD) não é ancestral de origin/main ($NEW_HEAD) — não é fast-forward." >&2
    echo "Histórico divergente: resolva manualmente (nunca com reset --hard automático)." >&2
    exit 1
fi

if [ "$CURRENT_HEAD" != "$NEW_HEAD" ]; then
    echo "==> Fast-forward: $CURRENT_HEAD -> $NEW_HEAD"
    git pull --ff-only origin main
fi

# O progresso é rastreado aqui, não pelo HEAD do git: o `git pull` acima já
# avança a árvore ANTES de qualquer build. Se um passo mais abaixo falhar,
# uma re-execução ingênua compararia HEAD local (já em NEW_HEAD) contra
# origin/main, veria que são iguais, e sairia dizendo "já atualizado" sem
# refazer o que faltou — produção desatualizada anunciando sucesso. Por
# isso o "já entregue" é lido de um arquivo, escrito só depois de TODO o
# resto deste script terminar com sucesso (última linha).
if [ -f "$STATE_FILE" ]; then
    LAST_DEPLOYED="$(cat "$STATE_FILE")"
    if ! git cat-file -e "$LAST_DEPLOYED" 2>/dev/null; then
        echo "AVISO: SHA em $STATE_FILE ($LAST_DEPLOYED) não existe mais no histórico local (rebase/force-push?) — tratando tudo como mudado." >&2
        LAST_DEPLOYED=""
    fi
else
    # Primeira execução: assume que o HEAD atual já está de pé (deploy
    # manual anterior, DEPLOY.md) — não força rebuild de tudo só porque o
    # arquivo de estado ainda não existe.
    LAST_DEPLOYED="$CURRENT_HEAD"
    echo "==> Sem estado anterior ($STATE_FILE não existe) — usando HEAD atual ($LAST_DEPLOYED) como baseline."
fi

if [ "$LAST_DEPLOYED" = "$NEW_HEAD" ]; then
    echo "==> Já está atualizado (último deploy = $NEW_HEAD) — nada a fazer."
    exit 0
fi

if [ -n "$LAST_DEPLOYED" ]; then
    CHANGED_FILES="$(git diff --name-only "$LAST_DEPLOYED" "$NEW_HEAD")"
else
    CHANGED_FILES="$(git ls-tree -r --name-only "$NEW_HEAD")"
fi

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

# Caddyfile é bind mount (docker-compose.yml) — o compose não detecta
# mudança de CONTEÚDO de um arquivo montado (só mudança na config do
# serviço em si), então precisa de recriação explícita.
rebuild_caddy=false
if echo "$CHANGED_FILES" | grep -q '^deploy/Caddyfile$'; then
    rebuild_caddy=true
fi

if [ "$rebuild_backend" = true ]; then
    echo "==> Backend mudou — rebuildando a imagem..."
    docker compose "${COMPOSE_ENV[@]}" build backend

    # Migração roda sempre que o backend é reconstruído (idempotente — sem
    # migração pendente, é um no-op) em vez de tentar detectar via git diff
    # exatamente quais arquivos de prisma/migrations/ são novos: mais simples
    # e mais seguro que uma heurística que pode errar. Usa o usuário
    # ADMINISTRATIVO do Postgres (deploy/.env) — o DATABASE_URL de
    # backend/.env é do usuário de runtime (lumitrack_app), sem permissão de
    # DDL, de propósito (ver DEPLOY.md, passo 7.1). Roda ANTES de recriar o
    # container do backend (mais abaixo) — o processo novo já sobe contra o
    # schema já migrado.
    echo "==> Aplicando migrações pendentes do Prisma..."
    # shellcheck disable=SC1091
    set -a && source deploy/.env && set +a
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public" \
        docker compose "${COMPOSE_ENV[@]}" run --rm --user root -e DATABASE_URL backend npm run db:migrate:deploy
fi

if [ "$rebuild_simulator" = true ]; then
    echo "==> Simulador mudou — rebuildando a imagem..."
    docker compose "${COMPOSE_ENV[@]}" build simulator
fi

if [ "$rebuild_frontend" = true ]; then
    # Build num diretório temporário, promovido por `mv` só no final — o
    # Caddy serve frontend/dist direto por bind mount, e o Vite esvazia
    # `outDir` no início do build; construir in-place deixaria o site
    # respondendo 404 durante a janela entre esvaziar e terminar de
    # escrever (uma falha no meio, ex.: OOM numa VPS pequena, travaria
    # nesse estado até intervenção manual).
    echo "==> Frontend mudou — buildando (container descartável, diretório temporário)..."
    BUILD_TMP="$(mktemp -d)"
    # --user "$(id -u):$(id -g)" (o próprio lumitrack, sem sudo — ele não
    # tem) em vez de rodar como root e depois `chown`: `lumitrack` não tem
    # sudo (deploy/provision-vm.sh cria com --shell /usr/sbin/nologin), e
    # um `chown` sem privilégio sobre arquivos gravados como root sempre
    # falharia, derrubando o deploy toda vez que o frontend mudasse.
    docker run --rm --user "$(id -u):$(id -g)" \
        -v "$REPO_DIR/frontend:/app" -v "$BUILD_TMP:/app/dist-build" -w /app \
        node:24-slim sh -c "npm ci && npm run build -- --outDir /app/dist-build"
    rm -rf "$REPO_DIR/frontend/dist"
    mv "$BUILD_TMP" "$REPO_DIR/frontend/dist"
fi

# Um `docker compose up -d` sem argumento de serviço recria sozinho
# qualquer serviço cuja configuração resolvida mudou — imagem nova
# (backend/simulador acima), variável de ambiente, ou o próprio
# `docker-compose.yml` (ex.: mudança de `network_mode` do simulador).
# Substitui os `--force-recreate` por serviço que existiam aqui antes: o
# compose já sabe o que precisa recriar sem depender da heurística de
# `grep` acima cobrir cada arquivo relevante.
echo "==> Sincronizando serviços com a configuração e as imagens atuais..."
docker compose "${COMPOSE_ENV[@]}" up -d

if [ "$rebuild_caddy" = true ]; then
    echo "==> Caddyfile mudou — forçando recriação do Caddy (bind mount, o compose não detecta sozinho)..."
    docker compose "${COMPOSE_ENV[@]}" up -d --force-recreate caddy
fi

if [ "$rebuild_simulator" = true ]; then
    echo "==> Aguardando a API do simulador responder..."
    wait_for "API do simulador" docker compose "${COMPOSE_ENV[@]}" exec -T simulator \
        node -e "require('http').get('http://localhost:4100/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

    # O simulador não persiste nada entre reinícios (estado só em memória,
    # de propósito) — recriá-lo sempre apaga a lista de medidores virtuais.
    echo "==> Recriando os 11 medidores virtuais (o simulador perdeu o estado ao reiniciar)..."
    ./deploy/seed-simulator-devices.sh
fi

echo "==> Aguardando /health do backend..."
if ! wait_for "/health do backend" docker compose "${COMPOSE_ENV[@]}" exec -T backend \
    node -e "require('http').get('http://localhost:3333/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; then
    echo "ERRO: /health do backend não respondeu 200 depois do deploy — verifique 'docker compose logs backend'." >&2
    exit 1
fi

echo "$NEW_HEAD" >"$STATE_FILE"
echo "==> Deploy concluído: HEAD agora em $NEW_HEAD (registrado em $STATE_FILE)."
