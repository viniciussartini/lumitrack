# syntax=docker/dockerfile:1
#
# Imagem da DEMO PÚBLICA (ADR-0010) — backend + iot-simulator no MESMO
# container. Contexto de build é a raiz do repositório.
#
# Por que juntos, e não dois serviços: no Render, background workers não
# fazem parte do plano gratuito e serviços só expõem HTTPS — nunca TCP
# bruto. O backend fala MQTT (porta 1883) com o simulador, então dois
# serviços separados simplesmente não conseguiriam se falar. Como efeito
# colateral desejável, o simulador continua em loopback do ponto de vista
# do backend, preservando `IOT_ALLOWED_HOSTS=127.0.0.1/32` e o
# `DEMO_METER_HOST=localhost` do seed sem nenhuma alteração.
#
# Para rodar localmente ou self-hosted, use `docker-compose.yml` (caminho B
# do .claude/docs/DEPLOY.md), que mantém os dois em containers separados.

# ─── Estágio 1: build do backend ─────────────────────────────────────────────
# node:24-slim (não -alpine) nos dois estágios: node-snap7 e serialport são
# módulos nativos, e binário compilado contra glibc não roda em musl.
FROM node:24-slim AS backend-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 libudev-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
# prisma.config.ts resolve a datasource via env("DATABASE_URL") — `generate`
# nunca chega a conectar no banco, mas o loader do config falha se a
# variável não existir. Valor descartável, só existe neste estágio de build
# (Render injeta o DATABASE_URL real, do Neon, em runtime).
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"
RUN npx prisma generate
RUN npm run build

# ─── Estágio 2: build do simulador ───────────────────────────────────────────
# Workspace npm próprio (server + ui) — o `npm ci` roda na raiz do workspace
# para casar com o package-lock.json único; só o workspace `server` é
# compilado (a `ui` não vai para a demo).
FROM node:24-slim AS simulator-builder

WORKDIR /app/iot-simulator

COPY iot-simulator/package.json iot-simulator/package-lock.json ./
COPY iot-simulator/server/package.json server/package.json
COPY iot-simulator/ui/package.json ui/package.json
RUN npm ci

COPY iot-simulator/server ./server
RUN npm run build -w server

# ─── Estágio 3: runtime ──────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# node_modules copiado integral (com devDependencies) de propósito: o CLI
# `prisma` é devDependency e é necessário para `prisma migrate deploy` no
# release do Render. Trade-off deliberado de imagem maior por simplicidade
# operacional — mesmo racional já registrado em backend/Dockerfile.
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/prisma ./backend/prisma
COPY --from=backend-builder /app/backend/package.json ./backend/package.json

COPY --from=simulator-builder /app/iot-simulator/node_modules ./iot-simulator/node_modules
COPY --from=simulator-builder /app/iot-simulator/server/dist ./iot-simulator/server/dist
COPY --from=simulator-builder /app/iot-simulator/server/package.json ./iot-simulator/server/package.json

COPY deploy/demo-entrypoint.sh /usr/local/bin/demo-entrypoint.sh
RUN chmod +x /usr/local/bin/demo-entrypoint.sh

USER node

# O Render injeta PORT e roteia o tráfego HTTP para ela; o backend lê
# `env.PORT` (config/env.ts), então basta não fixar um valor aqui.
EXPOSE 3333

ENTRYPOINT ["/usr/local/bin/demo-entrypoint.sh"]
