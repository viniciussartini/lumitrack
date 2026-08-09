# syntax=docker/dockerfile:1
#
# Build context é a raiz do workspace `iot-simulator/` (não `server/`) —
# server e ui são workspaces npm de um único package.json (ver
# iot-simulator/package.json), então `npm ci` precisa rodar a partir dali
# para casar com o package-lock.json único do workspace. docker-compose.yml
# referencia este arquivo com `context: ./iot-simulator, dockerfile: server/Dockerfile`.
#
# Sem módulo nativo aqui (aedes/express/mqtt são JS puro) — dispensa
# toolchain de build, diferente do backend/Dockerfile.
FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY ui/package.json ui/package.json
RUN npm ci

COPY server ./server
RUN npm run build -w server

# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# node_modules hoisted na raiz do workspace (comportamento padrão de npm
# workspaces) — copiado integral, mesmo trade-off documentado no
# backend/Dockerfile (simplicidade operacional > tamanho de imagem).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json

USER node

EXPOSE 1883 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4100/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
