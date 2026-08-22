# 03 — Arquitetura

## Princípios (do kit — valem em qualquer estilo arquitetural)

- **Fronteiras explícitas por domínio** — cada módulo/serviço possui seus dados; **nunca** se acessa a tabela de outro módulo diretamente. A comunicação atravessa um contrato declarado (interface ou evento).
- **Linguagem ubíqua (DDD-lite):** módulos, classes, funções e tabelas usam os **termos do domínio do negócio** — se o usuário fala "tarefa", o código diz `Tarefa`, não jargão técnico inventado.
- **Direção de dependência apontando para dentro** — a regra de negócio (domínio) não depende de Express, Prisma ou Sentry; a infraestrutura depende do domínio (portas e adaptadores / DIP).
- Validação de input na borda; lógica de negócio isolada de framework e testável sem subir banco.
- Decisões arquiteturais relevantes registradas como **ADR** em `.claude/docs/adr/` (template em `adr/0000-template.md`; numeração sequencial `0001-titulo.md`).

## Considerações de System Design (proporcional ao estágio)

> **Trava:** default no **menor número de peças móveis** que atende o requisito — neste projeto, **monólito modular + PostgreSQL**. Só introduza componente novo (cache, fila, réplica, serviço separado) quando um requisito **real e medido** forçar — caso contrário é over-engineering (mesma lógica do YAGNI em `06`).

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

## Contratos entre módulos

- **Toda comunicação entre módulos passa por contrato explícito.** Defina qual estilo o projeto usa e quando cada um se aplica:
  - **Síncrona por interface/porta** — o chamador precisa da resposta para continuar. Acopla no tempo: se o outro módulo cair, este cai junto.
  - **Assíncrona por evento** — o emissor não precisa saber quem consome. Desacopla, ao custo de consistência eventual e de ordenação/duplicidade a tratar.
- **Evento é contrato público:** nome, payload e semântica versionados; alterar campo de evento quebra consumidores tanto quanto alterar assinatura de método.
- **Sem dependência circular entre módulos** — se A e B precisam um do outro, ou a fronteira está errada ou falta um terceiro conceito. Verificável por regra do dependency-cruiser (`06`).
- **Anti-corruption layer nas integrações externas:** o modelo do fornecedor **não entra** no domínio. Traduza na borda (adapter) — sem isso, uma mudança de API de terceiro se espalha por todo o código, e a troca de fornecedor vira reescrita.

## Consistência e transações

- **Fronteira transacional declarada:** o que precisa ser atômico e o que pode ser eventual. Transação que atravessa módulos costuma indicar fronteira mal traçada.
- **Consistência eventual é decisão de produto, não detalhe técnico** — se o usuário vê um estado intermediário, a UI precisa refletir isso (`10`).
- **Idempotência** em tudo que pode ser reentregue (job, webhook, retry) — ver `05` e `12`.
- **Transação não abrange sistema externo:** chamada a terceiro dentro de transação de banco segura conexão e falha de forma inconsistente. Use *outbox* ou compensação quando importar.

## Cross-cutting concerns

Declare **onde mora** cada preocupação transversal — é a pergunta que todo recém-chegado faz e que quase nunca está escrita:

- Autenticação e autorização · Validação de entrada · Tratamento de erro · Logging e correlação de requisição · Configuração por ambiente · i18n · Feature flags · Cache · Auditoria.

Regra geral: transversal vive em **um lugar só**, aplicado na borda ou por composição — nunca replicado em cada módulo. Se um módulo precisa de exceção, isso é ADR.

## Visão documentada da arquitetura

ADR registra **decisão pontual**; ninguém entende o sistema lendo doze ADRs em sequência. Mantenha uma visão de conjunto:

- **Nível 1 (contexto):** o sistema, seus usuários e os sistemas externos com que fala.
- **Nível 2 (contêineres):** as peças executáveis (frontend, API, banco, worker, cache) e como se comunicam.
- **Nível 3 (componentes)** só onde a complexidade justificar — não desenhe o que o código já mostra.
- Formato leve e versionado (Mermaid no repositório é suficiente); **atualizar faz parte da mudança**, não é tarefa separada. Diagrama desatualizado engana mais do que a ausência dele.

## Específico do projeto

> Os princípios acima são do kit e permanecem; esta seção é do LumiTrack. Diferente de um projeto greenfield, aqui as decisões **já estão tomadas** e registradas em ADRs — não há entrevista de fundação pendente.

- **Estilo arquitetural:** **monólito modular** por domínio (ADR-0004).
- **Módulos de domínio:** 16 módulos em `backend/src/modules/` (lista abaixo, em "Padrão de módulo").
- **Comunicação entre módulos:** síncrona por interface (service → service), com o repositório como único ponto de acesso ao banco de cada módulo. O único caminho assíncrono é a ingestão IoT (amostra → buffer → rollup) e a entrega ao navegador via SSE (`UserEventHub`).
- **Cross-cutting:** tudo em `backend/src/shared/` (detalhado abaixo) — auth/authz em `middlewares`, erro no error handler central, log em `logger` (pino), config por ambiente com fail-fast no boot, auditoria em `audit`. Sem i18n. Quatro feature flags, sem fonte de verdade compartilhada entre elas: `REGISTRATION_ENABLED` e `DEMO_LOGIN_ENABLED` (`backend/src/config/env.ts`), `DEMO_BOOTSTRAP_ENABLED` (`iot-simulator/server/src/config/env.ts`) e `VITE_DEMO_MODE` (build do frontend, `LoginPage.tsx`) — esta última é independente de `DEMO_LOGIN_ENABLED` (`render.yaml` documenta a armadilha: as duas precisam ser ligadas juntas manualmente).
- **Fronteira transacional:** atômico dentro de um agregado (usuário + consentimento, medidor + alvo); eventual entre amostra ingerida e leitura por minuto persistida (`MinuteRollupScheduler`) e entre episódio de alerta e notificação.
- **Forma da aplicação:** SPA (`frontend/`) + API separada (`backend/`), mais o worker de ingestão IoT no mesmo processo do backend.
- **Integrações externas:** SMTP (nodemailer) e os sete protocolos IoT (ver abaixo).
- **Atores e autorização:** usuário comum e `ADMIN` (RBAC lido do banco a cada requisição); não é multi-tenant — o isolamento é por posse de recurso (ver "Posse e autorização").
- **Dados sensíveis (cruzar com `09`):** CPF, CNPJ, endereço, segredo MFA e credencial MQTT do medidor, todos cifrados em repouso com AES-256-GCM e chaves segregadas por finalidade; retenção e expurgo em `shared/retention`.
- **Componentes de infra além do default:** nenhum cache, fila ou réplica — a trava acima se mantém.

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

`backend/src/shared/` concentra o que não pertence a nenhum módulo de domínio: `crypto` (AES-256-GCM para endereço, PII, segredo MFA e credencial de medidor; blind index, TOTP, hash de token, QR code), `audit` (trilha OWASP A09/Art. 46), `sse` (`UserEventHub`), `notifications`, `tariff` (`TariffService`), `retention` (expurgo agendado), `middlewares` (`authenticate`, `requireRole`, `blockDemoWrite`, rate limiters, error handler), `security` (CSRF, guard de SSRF em conexões de saída via `outboundHost`, redirect HTTPS com host canônico via `httpsRedirect`), `logger` (pino), `database` (client Prisma singleton, `timeBucket.ts` — decodificação de bucket agregado, mesma classe de bug já corrigida duas vezes em consumo/dashboard), `errors` (`AppError.ts` — base de todo tratamento de erro, capturado centralmente no error handler), `targetResolution.ts` (resolução de posse — o ponto central de autorização por recurso, ver "Posse e autorização" abaixo), `pdf` (export DSAR), `legal` (versão de consentimento), `time`, `validation`, `pagination` e `test` (fixtures e clientes Prisma dedicados aos testes de integração).

### Integrações externas

- **SMTP** (nodemailer) — recuperação de senha.
- **Protocolos IoT** — MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232, RS485 (adaptadores em `modules/iot/iot-worker/protocols/`).
- **API de Dados Abertos da ANEEL** (`AneelTariffFlagSource.ts`) — a única chamada de saída não-IoT do backend: `fetch` para `https://dadosabertos.aneel.gov.br` no boot e a cada 24h, com schema de anti-corrupção próprio (ADR-0007). Relevante para quem mexer em SSRF/allowlist de saída.
- **UptimeRobot** (ADR-0011) — integração externa de *entrada*: monitor de terceiro fazendo polling do `/health`.
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
- `adr/0008-hospedagem-brasil-oracle-always-free.md` — hospedagem numa máquina única no Brasil, sem operador estrangeiro. Tomada como decisão de **conformidade**, não só técnica. **Provedor e conclusão de conformidade substituídos pela ADR-0010**; continuam vigentes as restrições técnicas (por que serverless/scale-to-zero são inviáveis), a **condição de validade** (cadastro público fechado) e os **gates de go-live**.
- `adr/0009-observabilidade-uptime-kuma-autohospedado.md` — monitor de uptime auto-hospedado, para o caminho self-hosted.
- `adr/0010-demo-publica-free-tier-render-neon.md` — a demo pública roda em **Render + Neon**, fora do Brasil, com **escopo restrito a demonstração** (cadastro fechado, só contas sintéticas). Registra a transferência internacional que passou a existir (registros de acesso, sem SCC), o risco assumido e o **compromisso de migrar para o Brasil** antes de qualquer operação com usuário real.
- `adr/0011-keep-alive-monitor-externo-uptimerobot.md` — keep-alive da demo via UptimeRobot (monitor externo), aceitando o custo de não detectar a VM/serviço inteiro fora do ar.
- `adr/0012-separacao-producao-vps-staging-render-neon.md` — produção migra para VPS Hostinger em São Paulo (branch `main`, retoma a conclusão de conformidade da ADR-0008); Render+Neon é rebaixado a staging/integração (branch `staging`, ADR-0010 continua vigente para esse ambiente).
