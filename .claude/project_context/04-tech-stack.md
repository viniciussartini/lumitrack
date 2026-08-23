# 04 — Tech Stack

> Tratar como **decidido**, salvo os itens de `07-decisoes-em-aberto.md`. Reflete o que está de fato em `package.json` — não um plano.
>
> A entrevista de stack da skill `scaffold-projeto` (Fase 0, Bloco B) **não se aplica** aqui: o projeto não é greenfield e a stack já está em produção. Mudança de camada é decisão nova — exige ADR, não entrevista.
>
> **Segurança da stack:** as armadilhas específicas de cada tecnologia listada abaixo estão em `12-seguranca-por-tecnologia.md` — consulte as seções correspondentes (React, Express, Prisma, PostgreSQL, JWT, MFA/TOTP, hash de senha, containers, e-mail transacional) ao mexer na camada, em vez de ler o catálogo inteiro.

- **Frontend:** React 19 + TypeScript, Vite 8, Tailwind 4 (`@tailwindcss/vite`) + componentes próprios em `components/ui/` (Radix primitives por baixo) + Lucide, TanStack Query + Context API (sem Zustand), React Router (react-router 8, não `react-router-dom`), React Hook Form + `@hookform/resolvers`, Zod, date-fns, recharts (gráficos), sonner (toasts), axios, `@microsoft/fetch-event-source` (cliente SSE).
- **Backend:** Node.js 24, Express 5, TypeScript, Prisma 7 (client custom gerado em `backend/src/generated/prisma`), Zod.
- **Banco:** PostgreSQL 16.
- **Auth:** JWT + Refresh tokens (ver ADR-0002 — cookie `HttpOnly` no canal WEB, Bearer no MOBILE); MFA opcional via TOTP + backup codes (`otplib`, ver ADR-0003). Sem OAuth implementado — provedor em aberto (`07`).
- **Segurança:** helmet, `express-rate-limit`, bcryptjs, criptografia própria (AES-256-GCM + blind index HMAC-SHA256) para PII em repouso, guard de SSRF com allowlist (`IOT_ALLOWED_HOSTS`) nas conexões de saída do medidor, e gitleaks como gate de secret scanning no CI.
- **E-mail:** nodemailer (recuperação de senha).
- **PDF/QR:** pdfkit (export DSAR), qrcode (setup de MFA).
- **IoT:** mqtt, jsmodbus, ethernet-ip, node-snap7, serialport — sete protocolos em `backend/src/modules/iot/iot-worker/protocols/`, hoje concentrados em 3 arquivos (`MqttConnection.ts` tem o dele; os outros seis dividem `ModbusTcpConnection.ts`, 662 linhas — quebrar em um arquivo por adaptador é a Fase 16 do roadmap). PROFIBUS é **stub deliberado** (`ProfibusConnection`, sem dependência npm): não existe lib estável para PROFIBUS em Node.js — a integração real exige hardware dedicado (ex.: Procentec ProfiHub, Siemens CP 5711) com SDK nativo do fabricante; `connect()` lança um erro claro orientando os passos necessários (ver comentário da classe).
- **iot-simulator:** aedes (broker MQTT embutido), Express, mqtt — simula os mesmos protocolos para desenvolvimento sem hardware.
- **Infra/deploy — dois ambientes** (`.claude/docs/DEPLOY.md`, ADR-0012, Fase 13.7). **Produção real, VPS Hostinger em São Paulo (branch `main`, retoma a conclusão de conformidade da ADR-0008 — sem operador estrangeiro):** máquina única com backend, frontend estático, PostgreSQL e simulador co-locados. Orquestrado via **Docker Compose** (`docker-compose.yml` na raiz — serviços `postgres`, `backend`, `simulator`, `caddy`, `uptime-kuma`; `backend/Dockerfile` e `iot-simulator/server/Dockerfile` multi-stage, isolando o toolchain de build dos módulos nativos `node-snap7`/`serialport` do runtime); reverse proxy e TLS automático via **Caddy** (`deploy/Caddyfile`); provisionamento, backup com restauração testada e seed de demonstração em `deploy/` (`provision-vm.sh`, `backup-postgres.sh` + timer `systemd`, `seed-simulator-devices.sh`); `backend/package.json` tem `db:migrate:deploy` (`prisma migrate deploy`) além do `migrate dev` de desenvolvimento. **Staging/integração, Render + Neon (branch `staging`, ADR-0010 — fora do Brasil, escopo restrito a demonstração/validação):** site estático + web service Docker no Render, PostgreSQL no Neon, free tier sem cartão, declarado em `render.yaml`; backend e simulador rodam **no mesmo container** (`Dockerfile` na raiz + `deploy/demo-entrypoint.sh`) porque o Render não expõe TCP bruto entre serviços e o backend fala MQTT com o simulador. Todo PR de feature entra primeiro em `staging` para validação online, só depois é promovido a `main` (ver `08-convencoes-git.md`). Procedimento completo de deploy dos dois ambientes, checklist de `.env` de produção e restauração de backup em `.claude/docs/DEPLOY.md` — produzido pela **Fase 13.5 do roadmap** (gates #6 backup testado e #7 rotação de chaves da ADR-0008) e executado de fato na VPS pela **Fase 13.7**.
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`), **14 jobs bloqueantes** — `secret-scan` (gitleaks, config própria em `.gitleaks.toml`), `{backend,frontend,iot-simulator}-{lint,build,test,audit}` e `e2e` (Playwright); Dependabot semanal cobrindo os três pacotes (`.github/dependabot.yml`).
- **Testes:** Vitest + supertest (unit/integração, backend e frontend), Playwright (E2E, `frontend/tests/e2e/`).
- **Observabilidade:** pino + pino-http (logs estruturados). No **Caminho B** (self-hosted), monitor de uptime **Uptime Kuma auto-hospedado** (`ADR-0009`, container do `docker-compose.yml`, painel só acessível via túnel SSH) monitorando `/health`. No **Caminho A** (staging no Render) o Kuma não é usado, e desde a `ADR-0013` **não há mais nenhum monitor externo nem keep-alive** — vale só o health check nativo da plataforma (`healthCheckPath: /health` no `render.yaml`), e o ambiente hiberna por inatividade de propósito. Sem Sentry/APM nem analytics de produto.

> **Lacuna conhecida de observabilidade:** a produção é vigiada por um monitor que roda **dentro da própria máquina** que vigia — se a VPS cair, o Kuma cai junto e ninguém é avisado (custo aceito explicitamente na `ADR-0009`). A Fase 14 avalia fechá-la com um monitor externo, apoiada no raciocínio de conformidade preservado na `ADR-0011`.

> **Oportunidade concretizada:** `frontend/src/schemas/` já espelha parte dos schemas Zod do backend (auth, area, device, meter, property, alert) — mas não há geração/compartilhamento automático entre os dois pacotes; cada lado mantém o seu.

## Decisões registradas

ADRs que fixam escolhas de stack e infraestrutura (contexto completo em `.claude/docs/adr/`):

| ADR | Camada | Decisão |
|---|---|---|
| `0002` | Auth | Cookie `HttpOnly` no canal WEB, Bearer no MOBILE |
| `0003` | Auth | MFA opcional via TOTP + backup codes |
| `0004` | Backend | Monólito modular por domínio, DI via `createApp(deps)` |
| `0005` | Frontend | Industry como design system do produto |
| `0006` | Frontend | Migração para o Industry incremental, por fase do roadmap |
| `0007` | Domínio | Bandeira tarifária sincronizada da fonte oficial da ANEEL |
| `0008` | Infra | Hospedagem no Brasil, máquina única, sem operador estrangeiro (Caminho B) |
| `0009` | Observabilidade | Uptime Kuma auto-hospedado (Caminho B) |
| `0010` | Infra | Demo pública em Render + Neon, escopo restrito a demonstração (Caminho A) |
| `0011` | Observabilidade | Keep-alive da demo via UptimeRobot (monitor externo) — **substituída pela `0013`** |
| `0012` | Infra | Separação de ambientes — produção na VPS Hostinger (`main`), Render+Neon rebaixado a staging (`staging`) |
| `0013` | Observabilidade | Fim do keep-alive — o staging hiberna por desenho |
