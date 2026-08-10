# syntax=docker/dockerfile:1

# Build isolado do runtime — node-snap7 e serialport são módulos nativos
# (node-gyp) e exigem toolchain de compilação que não deve existir na
# imagem final (deploy/DEPLOY.md, Fase 13.5 Bloco A). node:24-slim (não
# -alpine) em ambos os estágios: musl (Alpine) e glibc (Debian) não são
# binário-compatíveis — compilar num e rodar no outro quebra os módulos
# nativos silenciosamente em runtime.
FROM node:24-slim AS builder

# python3/make/g++ (build-essential) para node-gyp; libudev-dev para o
# binding nativo do serialport (enumeração de portas seriais no Linux).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 libudev-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma.config.ts resolve a datasource via env("DATABASE_URL") — `generate`
# nunca chega a conectar no banco, mas o loader do config falha se a
# variável não existir. Valor descartável, só existe neste estágio de build.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"
RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# node_modules copiado integral (com devDependencies) de propósito: o CLI
# `prisma` (usado por `npm run db:migrate:deploy`, rodado sob demanda via
# `docker compose run`) é devDependency, e este projeto não separa um
# estágio "migrator" à parte — trade-off deliberado de imagem maior por
# simplicidade operacional (mesmo racional de KISS de 06-code-quality-standards.md,
# aceitável na escala de um portfólio, não de um cluster de produção real).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# Roda como usuário sem privilégio (já existe na imagem base node:*-slim) —
# negar por padrão vale para o container também, não só para o código.
USER node

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3333/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
