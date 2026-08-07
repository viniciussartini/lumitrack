# 04 — Tech Stack

> Tratar como **decidido**, salvo os itens de `07-decisoes-em-aberto.md`. Reflete o que está de fato em `package.json` — não um plano.

- **Frontend:** React 19 + TypeScript, Vite 8, Tailwind 4 (`@tailwindcss/vite`) + componentes próprios em `components/ui/` (Radix primitives por baixo) + Lucide, TanStack Query + Context API (sem Zustand), React Router (react-router 8, não `react-router-dom`), React Hook Form + `@hookform/resolvers`, Zod, date-fns, recharts (gráficos), sonner (toasts), axios, `@microsoft/fetch-event-source` (cliente SSE).
- **Backend:** Node.js 24, Express 5, TypeScript, Prisma 7 (client custom gerado em `backend/src/generated/prisma`), Zod.
- **Banco:** PostgreSQL 16.
- **Auth:** JWT + Refresh tokens (ver ADR-0002 — cookie `HttpOnly` no canal WEB, Bearer no MOBILE); MFA opcional via TOTP + backup codes (`otplib`, ver ADR-0003). Sem OAuth implementado — provedor em aberto (`07`).
- **Segurança:** helmet, `express-rate-limit`, bcryptjs, criptografia própria (AES-256-GCM + blind index HMAC-SHA256) para PII em repouso.
- **E-mail:** nodemailer (recuperação de senha).
- **PDF/QR:** pdfkit (export DSAR), qrcode (setup de MFA).
- **IoT:** mqtt, jsmodbus, ethernet-ip, node-snap7, serialport — um adaptador por protocolo em `backend/src/modules/iot/iot-worker/protocols/`. PROFIBUS é **stub deliberado** (`ProfibusConnection`, sem dependência npm): não existe lib estável para PROFIBUS em Node.js — a integração real exige hardware dedicado (ex.: Procentec ProfiHub, Siemens CP 5711) com SDK nativo do fabricante; `connect()` lança um erro claro orientando os passos necessários (ver comentário da classe).
- **iot-simulator:** aedes (broker MQTT embutido), Express, mqtt — simula os mesmos protocolos para desenvolvimento sem hardware.
- **Infra/deploy:** VM única na **Oracle Cloud Always Free, região São Paulo** — backend, frontend estático, PostgreSQL e o simulador IoT co-locados, sem operador estrangeiro (**ADR-0008**, decisão tomada como conformidade: elimina a transferência internacional em vez de contratar SCC). Nenhum artefato de deploy existe no repositório ainda — a ADR define a topologia e os gates de go-live, a automação é trabalho posterior.
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) — lint, build, test e `npm audit --audit-level=high` para backend e frontend, mais suíte E2E; Dependabot semanal (`.github/dependabot.yml`).
- **Testes:** Vitest + supertest (unit/integração, backend e frontend), Playwright (E2E, `frontend/tests/e2e/`).
- **Observabilidade:** pino + pino-http (logs estruturados). Sem Sentry/APM, sem uptime monitor, sem analytics de produto configurados — ver `07`.

> **Oportunidade concretizada:** `frontend/src/schemas/` já espelha parte dos schemas Zod do backend (auth, area, device, meter, property, alert) — mas não há geração/compartilhamento automático entre os dois pacotes; cada lado mantém o seu.
