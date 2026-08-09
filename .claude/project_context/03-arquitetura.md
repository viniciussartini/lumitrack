# 03 — Arquitetura

## Princípios (decididos)

- **Monólito modular** — fronteiras claras por domínio; comunicação entre módulos por interfaces, nunca por acesso direto às tabelas de outro módulo.
- **Linguagem ubíqua (DDD-lite):** módulos, classes, funções e tabelas usam os **termos do domínio do negócio** — se o usuário fala "tarefa", o código diz `Tarefa`, não jargão técnico inventado.
- **Direção de dependência apontando para dentro** — a regra de negócio (domínio) não depende de Express, Prisma ou Sentry; a infraestrutura depende do domínio (portas e adaptadores / DIP).
- Validação de input na borda; lógica de negócio isolada de framework e testável sem subir banco.
- Decisões arquiteturais relevantes registradas como **ADR** em `.claude/docs/adr/` (template em `adr/0000-template.md`; numeração sequencial `0001-titulo.md`).

## Considerações de System Design (proporcional ao estágio)

> **Trava:** default no **mais simples** (monólito modular + Postgres). Só introduza componente novo (cache, fila, réplica) quando um requisito **real e medido** forçar — caso contrário é over-engineering (mesma lógica do YAGNI em `06`).

Antes de adicionar qualquer componente de infraestrutura, responda:

- **Escala esperada:** quantos usuários/requisições no horizonte real? (não no hipotético)
- **Perfil de carga:** leitura-pesada ou escrita-pesada? Onde está o gargalo?
- **Orçamento de latência:** o que precisa ser rápido o suficiente para o usuário?
- **Tolerância a falha:** o que **precisa** continuar de pé se um componente cair?
- **Assíncrono:** o que pode sair do caminho da requisição (e-mail, relatório, processamento) para uma **fila**?
- **Estado:** onde cada dado mora? O que é fonte da verdade?

Gatilhos que justificam evoluir (e o componente que costuma resolver):

- Mesma leitura cara repetida muitas vezes → **cache**.
- Trabalho lento bloqueando a resposta → **fila / job assíncrono**.
- Relatórios pesados competindo com o tráfego normal → **réplica de leitura**.
- Cada decisão dessas vira um **ADR** registrando o requisito que a motivou.

## Específico do projeto

### Monorepo

Três pacotes independentes, cada um com seu próprio `package.json`, lint e testes:

- **`backend/`** — API HTTP + worker de ingestão IoT (Express 5, Prisma 7, PostgreSQL).
- **`frontend/`** — SPA (React 19, Vite 8, Tailwind 4).
- **`iot-simulator/`** — workspace npm (`server/` + `ui/`) que simula dispositivos IoT reais via broker MQTT embutido (`aedes`), usado para desenvolvimento/demonstração sem hardware físico.

### Padrão de módulo (backend)

Todo módulo em `backend/src/modules/<nome>/` segue a mesma cadeia de camadas:

```
*.routes.ts → *.controller.ts → *.service.ts → *.repository.ts
```

- **`*.schema.ts`** — validação Zod na borda (parseia `req.body`/`req.query`/`req.params` antes de qualquer lógica).
- **`*.controller.ts`** — tradução HTTP ↔ domínio; sem regra de negócio.
- **`*.service.ts`** — regra de negócio, testável sem Express nem banco (mockando o repository).
- **`*.repository.ts`** — único ponto de acesso ao Prisma para aquele módulo; módulos não leem tabelas uns dos outros diretamente.
- Módulos sem estado próprio persistido (ex.: `simulation`) omitem `*.repository.ts`.

16 módulos ativos: `admin`, `alert`, `alert-event`, `area`, `auth`, `consumption`, `device`, `distributor`, `export`, `iot` (worker de ingestão, sem rota própria além do stream SSE), `meter`, `notification`, `property`, `simulation`, `tariff-flag`, `user`.

### Injeção de dependência

`createApp(deps: AppDependencies)` em [backend/src/app.ts](../../backend/src/app.ts) monta o Express recebendo (ou construindo default para) `prismaClient`, `processor` (IoT), `userEventHub` (SSE), `alertEvaluator`, `notificationStore` e os rate limiters. Esse é o ponto de composição — testes de integração instanciam `createApp` com um `PrismaClient` de teste e mocks pontuais, sem precisar subir o processo real.

### `shared/` — infraestrutura transversal

`backend/src/shared/` concentra o que não pertence a nenhum módulo de domínio: `crypto` (AES-256-GCM para endereço, PII, segredo MFA e credencial de medidor; blind index, TOTP, hash de token, QR code), `audit` (trilha OWASP A09/Art. 46), `sse` (`UserEventHub`), `notifications`, `tariff` (`TariffService`), `retention` (expurgo agendado), `middlewares` (`authenticate`, `requireRole`, rate limiters, error handler), `security` (CSRF, guard de SSRF em conexões de saída via `outboundHost`, redirect HTTPS com host canônico via `httpsRedirect`), `logger` (pino), `database` (client Prisma singleton), `pdf` (export DSAR), `legal` (versão de consentimento), `time`, `validation` e `pagination`.

### Integrações externas

- **SMTP** (nodemailer) — recuperação de senha.
- **Protocolos IoT** — MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232, RS485 (adaptadores em `modules/iot/iot-worker/protocols/`).
- Nenhuma integração de pagamento, mapa ou terceiro de observability (Sentry/APM) está implementada — ver `07-decisoes-em-aberto.md`.

### Posse e autorização

Toda autorização é por posse de recurso, resolvida bottom-up: `MeterReading/Alert → Meter → (Property | Area | Device) → Property → User`. RBAC (`Role.ADMIN`) é lido do banco a cada requisição — nunca um claim do JWT — para que promoção/rebaixamento tenha efeito imediato sem exigir novo login (ver ADR-0004 e `docs/RBAC_DESIGN.md` para uma evolução futura do modelo).

### ADRs já tomadas

- `adr/0001-claude-design-fonte-de-verdade-ui.md` — Claude Design como fonte de verdade de UI/UX.
- `adr/0002-token-storage-cookie-httponly.md` — cookie `HttpOnly` (WEB) / Bearer (MOBILE).
- `adr/0003-mfa-totp-opcional.md` — MFA opcional via TOTP + backup codes.
- `adr/0004-monolito-modular-por-dominio.md` — monólito modular por domínio, DI via `createApp(deps)`.
- `adr/0005-industry-como-design-system.md` — Industry como design system do produto.
- `adr/0006-migracao-incremental-por-fase.md` — migração incremental para o Industry, por fase do roadmap.
- `adr/0007-bandeira-tarifaria-fonte-oficial-aneel.md` — bandeira tarifária sincronizada da fonte oficial da ANEEL.
- `adr/0008-hospedagem-brasil-oracle-always-free.md` — VM única na Oracle Cloud Always Free em São Paulo, sem operador estrangeiro. Tomada como decisão de **conformidade**, não só técnica: elimina a transferência internacional em vez de contratá-la. Tem uma **condição de validade** (cadastro público fechado) e uma lista de **gates de go-live** — leia antes de publicar o ambiente.
