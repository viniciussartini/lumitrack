# Auditoria de Qualidade — 2026-10-12

**Escopo:** o projeto inteiro (`backend/`, `frontend/`, `iot-simulator/`, `scripts/`, `.github/`, `.claude/project_context/`, `.claude/docs/`), na branch `staging`, HEAD `081542d`, working tree limpo.
**Raiz dos caminhos citados:** a raiz do repositório. Todo `arquivo:linha` abaixo é relativo a ela.
**Referências:** `06-code-quality-standards.md`, `03-arquitetura.md`, `10-design-system.md`, `04-tech-stack.md`, `07-decisoes-em-aberto.md`, `02-requisitos.md` e o laudo anterior `.claude/docs/2026-08-22-qualidade-audit.md`.
**Método:** li os padrões primeiro. Depois fiz uma varredura estática: configs de ESLint, dependency-cruiser, lint-staged e CI; contagem de linhas; `any`, casts e `!`; comentários de rastreabilidade; `TODO`; hex e valores arbitrários do Tailwind; imports entre módulos; acesso a Prisma fora de repository. Em seguida li com atenção os pontos quentes e as Fases 25–30 (grandezas por fase, histórico, relatórios, metas, Painel v2, sessões ativas). Por fim, comparei o `project_context/` com o código real.

---

## Sumário executivo

Desde 2026-08-22 o projeto **fechou a maior parte da distância entre o padrão declarado e o padrão aplicado**. Dos 38 achados anteriores, **17 foram resolvidos**, **10 mudaram** (quase todos para melhor) e **11 continuam**. Os destaques:

- `eslint-plugin-jsdoc` foi instalado e ligado nos quatro pacotes.
- `no-circular` entrou no dependency-cruiser dos quatro pacotes, e o frontend ganhou regra de camadas. O CI roda as duas coisas.
- O pre-commit agora faz type-check.
- `complexity: off` virou teto medido por arquivo.
- `ModbusTcpConnection.ts` foi dividido em um arquivo por adaptador, e os `!` do `IoTConnectionManager` deram lugar a um schema Zod.
- `parseOrThrow` centralizou as 33 repetições de validação.
- `resolveRootProperty` ganhou teste próprio.
- A paleta pré-Industry foi zerada.
- Os valores arbitrários caíram de 372 para cerca de 51, com uma regra de lint que impede a volta.
- Comentários de rastreabilidade caíram de cerca de 310 para cerca de 45.

O código novo das Fases 25–30 tem boa qualidade em geral. O módulo `session` (Fase 30) é exemplar: funções pequenas, JSDoc completo, falha fechada explicada e testes de rota e de repository. Metas, relatórios e histórico chegaram com testes unitários, de rota e E2E. Não encontrei over-engineering.

O risco se concentrou em três eixos:

1. **Um "god class" de tarifação.** `ConsumptionService` passou de 117 linhas problemáticas em um método (o antigo Q-09) para **1779 linhas, 12 dependências injetadas e seis responsabilidades** (consumo, resumo, conta do Grupo A, conta da Tarifa Branca, comparação ACR × ACL, comparação Convencional × Branca). O teto de ESLint por arquivo (`max-lines-per-function: 90`) foi criado para o `summary()` e hoje absorve qualquer método novo do arquivo.
2. **Documentação viva ficou para trás enquanto o código avançou nove fases.**
   - O `03` ainda fala em **16 módulos** (são 24), "um único caminho assíncrono" (há sete schedulers) e "nenhum cache" (há três caches em processo).
   - O índice de ADRs está desatualizado **nos quatro lugares que o indexam**. O `04` termina na ADR-0013 e faltam 12 ADRs.
   - O `10` afirma que Histórico, Metas, Configurações e o relatório A4 "não existem ainda" e lista uma única tela sem handoff, quando o código tem quatro marcadores `TODO(design)`.
   - O primeiro achado Alta do laudo anterior (Q-29, índice de ADRs) **voltou maior**. O esquecimento é estrutural, não pontual.
3. **As travas mecânicas existem, mas o catálogo de exceções não é revisado.** As exceções de complexidade ainda dizem "revisar na Fase 18", fase encerrada em 2026-09-02. Há **8 entradas apontando para arquivos que não existem mais**. A regra anti-regressão de tokens tem um ponto cego: `leading-[1.55]`, `max-w-[60ch]` e `text-[clamp(...)]` passam, alguns deles com 10 ou mais ocorrências.

Também entra um achado de correção com cara de qualidade: **`SimulationService` aplica a fórmula do Grupo B Convencional a qualquer propriedade** (Grupo A, Tarifa Branca e ACL) sem falhar fechado. O `ConsumptionService` falha fechado explicitamente nesses casos.

**Distribuição:** 3 Alta · 10 Média · 13 Baixa (26 achados).

---

## Reconciliação com o laudo de 2026-08-22

| ID antigo | Tema | Status | Onde está agora |
|---|---|---|---|
| Q-01 | Rastreabilidade sistêmica | **Mudado** — ~310 caiu para ~45 | Q-09 |
| Q-02 | Rastreabilidade por data/autor | **Mudado** — a data saiu do `RealtimeContext`; sobra "decisão do usuário" em `AboutPage.tsx:12` | Q-08 |
| Q-03 | Comentário desatualizado da `AboutPage` | **Persistente** (piorou: agora cita um bundle não vigente) | Q-08 |
| Q-04 | `eslint-plugin-jsdoc` ausente | **Mudado** — instalado, mas com escopo estreito | Q-17 |
| Q-05 | Exports públicos sem bloco | **Persistente** em `shared/`, rotas e arquivos de domínio sem sufixo | Q-17 |
| Q-06 | Complexidade `off` em massa | **Mudado** — virou teto por arquivo; o prazo venceu e há entradas mortas | Q-05 |
| Q-07 | `ModbusTcpConnection.ts` com 7 classes | **Resolvido** — 9 arquivos em `protocols/` | — |
| Q-08 | `createConnection()` com 189 linhas | **Mudado** — schema Zod + `withOptional`; 99 linhas, complexidade 19, teto 20/110 | (sem achado novo) |
| Q-09 | `ConsumptionService.list()` | **Mudado (agravado)** — `list()` foi resolvido, mas a classe inchou | **Q-01** |
| Q-10 | `createApp()` com 175 linhas | **Persistente** com teto (129 linhas, teto 140) e sem JSDoc | Q-05 / Q-17 |
| Q-11 | Componentes acima de 350 linhas | **Persistente (parcial)** — Property/AreaDetails encolheram; `PropertyForm` cresceu | Q-21 |
| Q-12 | parse-or-throw repetido 33× | **Resolvido** (`shared/validation/parseOrThrow.ts`) | — |
| Q-13 | Badge "ao vivo" ×8 | **Resolvido** (`LiveBadge`, `.lt-live-dot`) | — |
| Q-14 | `31` literal | **Mudado** — `MAX_PAGE_SIZE` existe, adoção parcial | Q-16 |
| Q-15 | Constantes sem nome | **Persistente**, e ganhou duplicação de fuso horário | Q-15 |
| Q-16 | `!` no `IoTConnectionManager` | **Resolvido** (`connectionConfigSchema.parse`, `IoTConnectionManager.ts:71`) | — |
| Q-17 | Cast duplo em `user.repository` | **Persistente** | Q-19 |
| Q-18 | `any` remanescente | **Persistente** | Q-18 |
| Q-19 | Disable sem justificativa | **Persistente** | Q-20 |
| Q-20 | dependency-cruiser incompleto | **Resolvido** — `no-circular` nos 4 pacotes, `no-ui-import-in-logic` no frontend, gate no CI | (lacuna nova em Q-10/Q-25) |
| Q-21 | Service → repository de outro módulo | **Resolvido** — ADR-0016 + `03:100` | — |
| Q-22 | Pre-commit sem type-check | **Resolvido** (`scripts/lint-staged-run.mjs:38-42`) | — |
| Q-23 | `resolveRootProperty` sem teste | **Resolvido** (`backend/src/shared/targetResolution.test.ts`) | — |
| Q-24 | Utilitários de segurança sem teste | **Persistente** | Q-22 |
| Q-25 | Hex hardcoded | **Mudado** — quase resolvido, restam 7 arquivos catalogados | Q-07 |
| Q-26 | Valores arbitrários | **Resolvido** — ~51 em 28 arquivos, com trava anti-regressão | (ponto cego em Q-06) |
| Q-27 | Paleta pré-Industry | **Resolvido** — zero `slate/gray/amber` | — |
| Q-28 | `TODO(design)` ausente | **Resolvido** — telas novas sem handoff já marcadas | (inventário em Q-04) |
| Q-29 | ADR-0011 não indexada | **Persistente (agravado)** — 12 ADRs fora de pelo menos um índice | **Q-02** |
| Q-30 | "15 jobs" no `04` | **Mudado** — agora são 15 e o `04` diz 14 | Q-23 |
| Q-31 | "Um adaptador por protocolo" | **Mudado** — o código foi corrigido, o `04` ficou velho | Q-23 |
| Q-32 | Feature flags no `03` | **Resolvido** (`03:71`) | — |
| Q-33 | Integrações externas no `03` | **Resolvido** (`03:116`); finalidade do SMTP desatualizada | Q-03 |
| Q-34 | Pendência do `07` | **Resolvido** | — |
| Q-35 | Índices e inventários | **Resolvido**; faltam `shared/session` e `shared/config` | Q-03 |
| Q-36 | Nota de estágio do `10` | **Resolvido** (`10:79`); drift novo em outras seções | Q-04 |
| Q-37 | `NotificationStore` sem expurgo | **Persistente** | Q-13 |
| Q-38 | Senha de demo em stdout | **Resolvido** — só imprime quando gerada localmente (`backend/prisma/seed-demo/verify.ts:42-55`) | — |

**Placar:** 17 resolvidos · 10 mudados · 11 persistentes.

---

## Tabela de achados

| ID | Tipo | Sev. | Local | Origem |
|---|---|---|---|---|
| Q-01 | SRP / complexidade | **Alta** | `backend/src/modules/consumption/consumption.service.ts:223-1779` | mudado (era Q-09) |
| Q-02 | Drift de doc (ADRs) | **Alta** | `04-tech-stack.md:31-44`, `03-arquitetura.md:124-141`, `.claude/docs/README.md:50-69`, `07-decisoes-em-aberto.md:21` | persistente (era Q-29) |
| Q-03 | Drift de doc (`03`) | **Alta** | `03-arquitetura.md:69,70,74,76,77,102,110,114` | **novo** |
| Q-04 | Drift de doc (`10`) | Média | `10-design-system.md:61,63,64,68,70` | **novo** |
| Q-05 | Enforcement (catálogo do ESLint) | Média | `frontend/eslint.config.js:85-517`, `backend/eslint.config.js:108-185` | mudado (era Q-06) |
| Q-06 | Design system (trava) | Média | `frontend/eslint.config.js:535`; 10+ arquivos `.tsx` | **novo** |
| Q-07 | Design system (hex) | Baixa | 7 arquivos catalogados | mudado (era Q-25) |
| Q-08 | Comentário desatualizado | Média | `consumption.service.ts:827`, `property.schema.ts:81`, `property.types.ts:100`, `schema.prisma:122`, `RetentionPurgeScheduler.ts:12`, `AboutPage.tsx:10` | **novo** (+ Q-02/Q-03 antigos) |
| Q-09 | Comentário de rastreabilidade | Média | ~45 pontos (lista abaixo) | mudado (era Q-01) |
| Q-10 | Fronteira de módulo | Média | `backend/src/modules/iot/iot-stream.routes.ts:46-59` | **novo** |
| Q-11 | Correção / falhar fechado | Média | `backend/src/modules/simulation/simulation.service.ts:134-183` | **novo** |
| Q-12 | Fronteira (infra transversal) | Baixa | `backend/src/modules/auth/email.service.ts:177`, `backend/src/server.ts:32` | **novo** |
| Q-13 | Linguagem ubíqua / memória | Baixa | `GoalAlertScheduler.ts:216`, `notification-store.ts:8-9,52-61` | novo + persistente (era Q-37) |
| Q-14 | DRY / consistência | Baixa | `consumption.service.ts:670,865,1585-1612,1697-1733`, `simulation.service.ts:67-82` | **novo** |
| Q-15 | Constantes / fuso horário | Baixa | `app.ts:144`, `parseJwtExpiry.ts:10,23`, `timeBucket.ts:16` + 5 arquivos do frontend | persistente (era Q-15) + novo |
| Q-16 | Número mágico | Baixa | 3 chamadas literais + 6 redeclarações | mudado (era Q-14) |
| Q-17 | JSDoc (escopo da trava) | Média | `backend/eslint.config.js:186-216`; `shared/`, rotas, arquivos de domínio sem sufixo | mudado (era Q-04/Q-05) |
| Q-18 | Tipagem (`any`) | Baixa | `ConsumptionChart.tsx:37-38`, `RealtimePowerChart.tsx:36-37` | persistente |
| Q-19 | Tipagem (casts) | Baixa | `user.repository.ts:149-160`, `PropertyForm.tsx:164-169` | persistente (era Q-17) + novo |
| Q-20 | Enforcement | Baixa | `frontend/src/contexts/RealtimeContext.tsx:164` | persistente (era Q-19) |
| Q-21 | Complexidade (UI) | Média | `PropertyForm.tsx` (760), `LandingPage.tsx` (727), `ProfilePage.tsx` (619) | persistente (era Q-11) |
| Q-22 | Testes | Baixa | `parseJwtExpiry.ts`, `hashToken.ts`, `rateLimiter.ts` | persistente (era Q-24) |
| Q-23 | Drift de doc (`04`) | Média | `04-tech-stack.md:9,14,15,16,19` | mudado (era Q-30/Q-31) + novo |
| Q-24 | Drift de doc (`06`) | Baixa | `06-code-quality-standards.md:86,89-95,99` | **novo** |
| Q-25 | Direção de dependência | Baixa | `backend/src/modules/meter/meter.service.ts:1`, `backend/.dependency-cruiser.cjs:14-26` | **novo** |
| Q-26 | Consistência (schedulers) | Baixa | `ReportScheduleScheduler.ts:36-48` vs. `RetentionPurgeScheduler.ts:44-52` | **novo** |

---

## Detalhamento

### SOLID e complexidade

**Q-01 — `ConsumptionService` virou god class · Alta · mudado (era Q-09)**
`backend/src/modules/consumption/consumption.service.ts` tem **1779 linhas**, 45 métodos e **12 dependências no construtor** (`:238-251`). Concentra seis razões de mudança diferentes:

- consumo e resumo: `list` (`:261`), `summary` (`:351`);
- conta binômia do Grupo A: `calculateGroupAMonthCost` / `calculateGroupAMonthlyCosts` / `buildGroupAMonthResult` (`:835-1297`);
- Tarifa Branca: `:670-834`;
- custo anual: `:502-588`, `:1365`;
- comparação ACR × ACL: `compareAclToAcr` (`:1582-1677`);
- comparação Convencional × Branca: `compareBrancaToConvencional` (`:1691-1778`).

A extração de `computeYearlyPropertyCosts` / `resolveBucketCost` recomendada no laudo anterior foi feita. Mesmo assim, o arquivo foi o destino de todo cálculo tarifário das Fases 19–22. Esse cálculo é o centro de metas (`goal-consumption.ts`), relatórios (`report.service.ts`) e Painel.

O override de `backend/eslint.config.js:122-139` (`max-lines-per-function: 90`) foi justificado pelo `summary()` (82 linhas), mas vale **para o arquivo inteiro**. `compareAclToAcr` e `compareBrancaToConvencional` (~90 linhas cada) cabem nele sem que ninguém precise reavaliar. É exatamente o efeito que o antigo Q-06 apontava.

> **Recomendação:** refatorar com a skill `refatoracao`, sem mudar comportamento.
> 1. Os calculadores de conta (Grupo A e Branca) vão para classes próprias, em `shared/tariff/` ou `modules/consumption/billing/`. Elas recebem `TariffCatalogRepository`, `MeterDemandRollupRepository` e `TariffService`.
> 2. As duas comparações vão para um `PropertyComparisonService` com controller próprio.
> 3. `ConsumptionService` fica só com `list`/`summary`, que orquestram.
> 4. Depois da divisão, troque o override por arquivo por um override do método específico (ou remova-o).
>
> A suíte atual (`consumption.service.test.ts`, rotas) serve como rede de caracterização.

**Q-21 — Componentes de UI grandes · Média · persistente (era Q-11)**

- `frontend/src/components/property/PropertyForm.tsx` tem **760 linhas** e foi o que mais cresceu (Grupo A, Azul, ACL, Branca). O teto é `complexity: 30` / `max-lines: 190` (`frontend/eslint.config.js:167-175`), os mais frouxos do projeto.
- `LandingPage.tsx` (727) e `ProfilePage.tsx` (619) estão iguais.
- `LoginPage` tem teto de 230 linhas (`:233-241`) e `AlertRowMenu` de 210 (`:385-392`).
- Melhorou: `PropertyDetailsPage` 547 → 409; `AreaDetailsPage` 511 → 309.

> **Recomendação:** `PropertyForm` primeiro. Cada bloco condicional (Grupo A, Azul, ACL, Grupo B/Branca) já é uma `<Section>` visual distinta e pode virar subcomponente com `register` e `errors` por prop. Isso derruba os dois tetos mais altos do catálogo.

### Enforcement (travas mecânicas)

**Q-05 — Catálogo de exceções do ESLint com prazo vencido e entradas mortas · Média · mudado (era Q-06)**
A troca de `off` por teto medido foi a decisão certa. O catálogo, porém, não é reavaliado:

- **Prazo vencido.** Todas as exceções dizem "Revisar na Fase 18" (`frontend/eslint.config.js:92`; `backend/eslint.config.js:111,144,156,169,180`; `iot-simulator/ui/eslint.config.js:85`), e a Fase 18 fechou em 2026-09-02. Nenhuma ganhou prazo novo.
- **8 entradas para arquivos que não existem mais** (removidos na reorganização da Fase 23):
  - `PropertiesPage.tsx` (`frontend/eslint.config.js:199` e `:597`);
  - `AreaMenu.tsx` (`:346`), `PropertyMenu.tsx` (`:356`), `DeviceMenu.tsx` (`:454`);
  - `AreaCard.tsx` (`:574`), `DeviceCard.tsx` (`:579`), `PropertyCard.tsx` (`:582`).
- **Exceções obsoletas ou superdimensionadas:**
  - `PropertyComparisonSection.tsx` (`:425`, teto 70): o componente tem cerca de 29 linhas.
  - `ReportsPage.tsx` (`:116-125`): o comentário diz "Complexidade 16, 102 linhas", mas a página foi reescrita na Fase 27 e hoje tem complexidade baixa. O teto de 20 deixa espaço para regressão.

> **Recomendação:** (1) apagar as 8 entradas mortas e a de `PropertyComparisonSection`; (2) medir de novo cada teto e ajustá-lo ao valor real; (3) trocar "revisar na Fase 18" por um gatilho que funcione: um item fixo na fase de polimento do roadmap ou um script que rode `eslint` com a regra global e liste os arquivos que já cabem nela.

**Q-17 — JSDoc: a trava cobre só parte do contrato público · Média · mudado (era Q-04/Q-05)**
`backend/eslint.config.js:186-216` aplica `jsdoc/require-jsdoc` só em `src/modules/*/*.{service,repository,controller}.ts`. Ficam de fora:

- **`shared/`**: cerca de 25 exports com comentário `//` onde o `06:41` exige bloco. Exemplos: `targetResolution.ts:16-28` (o ponto central de autorização), `security/csrf.ts:3-65` (5 funções), `security/outboundHost.ts` (4), `middlewares/rateLimiter.ts` (2), `crypto/hashToken.ts`, `time/parseJwtExpiry.ts`, `database/timeBucket.ts`, `pagination.ts`.
- **`app.ts:74`**: `createApp`, o ponto de composição, sem bloco nem tipo de retorno.
- **cerca de 20 `*.routes.ts`**.
- **Regra de domínio nova em arquivos sem sufixo**, padrão que cresceu nas Fases 25–30: `goal/goal-progress.ts`, `goal/goal-consumption.ts`, `report-schedule/nextRun.ts`, `report-schedule/scheduledPeriod.ts`, `meter/meter-target.ts` (2 exports sem bloco), `session/session-export.ts`, `report/generators/pdfLayout.ts` (2), `iot/iot-worker/*`. Por amostragem, a maioria tem JSDoc por disciplina, não por trava.
- **Tipos de domínio exportados com `//` em vez de bloco**: `consumption.service.ts:99-215` (`GroupABreakdown`, `ConsumptionBucketResponse`, `AclComparisonVerdict`...). A regra não cobre `TSTypeAliasDeclaration`.

> **Recomendação:** ampliar o `files` do bloco jsdoc para `src/shared/**/*.ts` e `src/modules/**/*.ts`, excluindo `*.routes.ts`, `*.schema.ts` e testes. Medir o débito antes, como já foi feito nos pacotes do simulador ("débito pequeno, corrigido junto"). Corrigir o `06:86` para descrever o escopo real (ver Q-24).

**Q-20 — Disable sem justificativa · Baixa · persistente (era Q-19)**
`frontend/src/contexts/RealtimeContext.tsx:164` — `// eslint-disable-next-line react-hooks/exhaustive-deps` sem explicação, em `[user?.id, isAuthenticated]`. Continua sendo o único disable sem justificativa do repositório.

> **Recomendação:** uma linha explicando por que o efeito reage só à identidade do usuário (o objeto `user` muda de referência a cada refresh do perfil e reabriria a conexão SSE à toa). `queryClient` e `navigate` são estáveis e podem entrar no array.

### Direção de dependência e fronteiras

**Q-10 — Rotas do módulo `iot` consultam a tabela `meter` direto pelo Prisma · Média · novo**
`backend/src/modules/iot/iot-stream.routes.ts:46-59` (`resolveUserMeterIds`) faz `prisma.meter.findMany` com os três caminhos de posse (propriedade, área, dispositivo). É o **único** acesso a Prisma fora de um `*.repository.ts` no backend (`shared/database/withPurgeTimeout.ts` é infra e não conta). Viola `03:98` ("só o repository dono lê a tabela") e o que a própria ADR-0016 mantém proibido ("pular a camada de repository acessando Prisma direto fora do módulo dono", `03:100`). A regra de posse também fica duplicada fora de `targetResolution` / `MeterRepository`. O dependency-cruiser não pega isso: a única regra de domínio é `no-express-in-domain`.

> **Recomendação:** mover para `MeterRepository.findIdsOwnedBy(userId)` e chamar a partir do `iot-stream.routes.ts`. Adicionar ao `backend/.dependency-cruiser.cjs` uma regra `prisma-only-in-repository`: `from` = `^src/modules/` sem `\.repository\.ts$`, `to` = `^src/generated/prisma/client` com `dependencyTypes` de valor (não `type-only`) e/ou `^src/shared/database/prisma\.ts$`.

**Q-12 — Envio de e-mail transversal mora no módulo `auth` · Baixa · novo**
`backend/src/modules/auth/email.service.ts:177` (`sendScheduledReportEmail`, Fase 27) é consumido por `backend/src/server.ts:32` para o módulo `report-schedule`. E-mail virou infra transversal com quatro finalidades, mas continua num módulo de domínio. `03:53` pede que o transversal viva em um lugar só, na borda.

> **Recomendação:** mover para `shared/email/` (transporte nodemailer + um template por finalidade). Deixar o tipo de cada função (`SendPasswordResetEmailFn` etc.) no módulo que o consome.

**Q-25 — Prisma em runtime dentro do domínio e lacuna do dependency-cruiser · Baixa · novo**
`backend/src/modules/meter/meter.service.ts:1` faz `import { TargetType } from "@/generated/prisma/client.js"` como **valor**. Os outros services importam só `type`. `no-express-in-domain` (`backend/.dependency-cruiser.cjs:14-26`) lista `express|helmet|cors|cookie-parser`, mas não o client do Prisma, que o `03:7` também cita como infra.

> **Recomendação:** trocar por `import type` + literal, ou por um enum de domínio. Pode entrar na mesma regra proposta em Q-10.

### Correção e falhar fechado

**Q-11 — `SimulationService` ignora o modelo tarifário da propriedade · Média · novo**
`backend/src/modules/simulation/simulation.service.ts:134-183` sempre calcula com `calculateForProperty` / `calculateForSubTarget`, a fórmula do Grupo B Convencional. O arquivo não tem nenhuma referência a `tariffGroup`, `groupBModality` ou `contractingEnvironment`. Simular uma propriedade **Grupo A, Tarifa Branca ou ACL** devolve um custo plausível e errado, sem erro. O `ConsumptionService` faz o oposto e falha fechado (`assertGroupACalculable`, `consumption.service.ts:856-888`). Agravantes:

- o mesmo bloco de 10 linhas é repetido em `:145-155` e `:160-170`;
- desde a Fase 23 o endpoint (`property.routes.ts:54`) não tem consumidor no frontend (nenhuma ocorrência de "simulation" em `frontend/src`). O RF22 está "implementado" só pela API e ninguém olha o resultado.

> **Recomendação:** (1) falha fechada imediata (`ValidationError`) para `tariffGroup !== "GROUP_B"`, `groupBModality === "WHITE"` e `contractingEnvironment === "ACL"`, com teste de regressão (TDD, skill `correcao-bugs`); (2) decidir com o usuário se o endpoint continua sem UI ou se vira item de roadmap. Achado de interseção com a auditoria de conformidade/negócio, registrado aqui pela regra de falha fechada do `06:23`.

### DRY e constantes

**Q-14 — Validações de pré-condição repetidas e política 403/404 inconsistente · Baixa · novo**

- O mesmo encadeamento "propriedade existe → é do usuário → tem medidor → distribuidora → bandeira" aparece em `consumption.service.ts:1585-1612`, `:1697-1733` e `simulation.service.ts:67-82`.
- A checagem da janela de ponta é escrita três vezes: `consumption.service.ts:670`, `:865`, `:1719`.
- Política inconsistente: as comparações respondem **403** para propriedade alheia (`consumption.service.ts:1589-1591`), revelando que ela existe. O `SessionService` documenta explicitamente responder **404** igual "sem revelar a existência" (`session.service.ts:55-58`).

> **Recomendação:** um helper privado `loadOwnedPropertyBillingContext(userId, propertyId)` resolve a repetição (cabe na refatoração de Q-01). A divergência 403 × 404 deve ser levada à auditoria de segurança para decidir a política do projeto.

**Q-15 — Constantes sem nome e fuso horário espalhado · Baixa · persistente + novo**

- Continua: `backend/src/app.ts:144` (`maxAge: 31536000`), `backend/src/shared/time/parseJwtExpiry.ts:10,23` (fallbacks `15 * 60 * 1000` e `60 * 1000`), `backend/src/shared/database/timeBucket.ts:16` (`'America/Sao_Paulo'` dentro do SQL).
- Novo, das Fases 27–29:
  - `"America/Sao_Paulo"` é redeclarado **5×** no frontend: `lib/reportSchedule.ts:11`, `lib/formatters/relativeTime.ts:1`, `lib/reportHistory.ts:5`, `lib/demandOverview.ts:4`, `lib/goals.ts:10`.
  - O backend tem **três mecanismos diferentes** para o fuso: SQL literal (`timeBucket.ts:16`), `SP_TZ` (`report/generators/format.ts:3`) e offset fixo de 3h (`shared/time/localTime.ts:5`).
  - `DAY_MS` é redeclarado 4× (`report.service.ts:43`, `report.schema.ts:17`, `nextRun.ts:8`, `scheduledPeriod.ts:13`).
  - Intervalos em linha: `TariffFlagSyncScheduler.ts:27`, `RetentionPurgeScheduler.ts:30`.

> **Recomendação:** `APP_TIMEZONE` em `frontend/src/lib/` e em `backend/src/shared/time/`, com um comentário (uma vez só) explicando por que o offset fixo de `localTime.ts` é seguro (o Brasil não tem horário de verão desde 2019). `HSTS_MAX_AGE_SECONDS` e `DEFAULT_JWT_EXPIRY_MS` como já recomendado antes.

**Q-16 — `MAX_PAGE_SIZE` adotado pela metade · Baixa · mudado (era Q-14)**
A constante existe (`frontend/src/types/pagination.types.ts:23`) e é usada em 4 pontos novos. Ainda há:

- **3 chamadas com `31` literal:** `pages/alert/AlertsPage.tsx:52`, `pages/property/PropertyDetailsPage.tsx:61`, `pages/distributor/DistributorsPage.tsx:31`;
- **6 redeclarações locais:** `DashboardPage.tsx:51`, `components/device/DeviceComparison.tsx:6`, `components/dashboard/ConsumptionHistorySection.tsx:17`, `components/dashboard/GoalSection.tsx:42`, `hooks/queries/useAclContracts.ts:9`, `components/property/AreaComparison.tsx:6`.

> **Recomendação:** substituição mecânica por `MAX_PAGE_SIZE`. Se algum ponto quer dizer "31 dias do mês" e não "teto do backend", dê o nome do conceito de negócio a ele.

**Q-26 — Schedulers com o mesmo esqueleto e garantias diferentes · Baixa · novo**
Sete schedulers sobem em `backend/src/server.ts:80-192`. `ReportScheduleScheduler.ts:36-48` tem guarda de reentrância (`running`), mas `RetentionPurgeScheduler.ts:44-52` não, entre outros. Seguindo o `06:105` (não deduplicar coincidência), não peço abstração. Peço consistência: uma passada que demore mais que o intervalo não deveria se sobrepor em nenhum deles.

> **Recomendação:** conferir a reentrância de cada scheduler. Se as sete implementações acabarem idênticas, aí sim vale um `PeriodicJob` pequeno em `shared/`.

### Tipagem

**Q-18 — `any` remanescente · Baixa · persistente**
`frontend/src/components/consumption/ConsumptionChart.tsx:37-38` e `frontend/src/components/realtime/RealtimePowerChart.tsx:36-37` (`payload?: any[]` do tooltip do recharts) continuam sendo os **dois únicos `any` de produção** do repositório.

> **Recomendação:** a mesma do laudo anterior. `TooltipProps` do recharts ou `unknown[]` + narrowing.

**Q-19 — Casts em caminho de escrita e em formulário · Baixa · persistente + novo**

- `backend/src/modules/user/user.repository.ts:149-160` — `cleanData as unknown as Prisma.UserCreateInput` continua sendo o único cast duplo de produção. Ele está no caminho que **cifra CPF/CNPJ**: se um campo de PII em texto puro entrasse ali, o compilador não avisaria.
- `frontend/src/components/property/PropertyForm.tsx:164-169` — cinco `watch("...") as T`. Sinal de que o `PropertyFormInput` (entrada do Zod) não carrega as uniões literais.

> **Recomendação:** no repository, montar o objeto com spread condicional (recupera o tipo). No formulário, tipar os campos de enum do schema de entrada para que `watch` devolva a união sem cast.

### Testes

**Q-22 — Utilitários de segurança sem teste dedicado · Baixa · persistente (era Q-24)**
`backend/src/shared/time/parseJwtExpiry.ts`, `backend/src/shared/crypto/hashToken.ts` e `backend/src/shared/middlewares/rateLimiter.ts` continuam sem arquivo de teste próprio. São exercitados só indiretamente (`auth.*.test.ts`). `parseJwtExpiry` ainda converte entrada malformada em 15 min sem avisar.

> **Recomendação:** `parseJwtExpiry.test.ts` primeiro: função pura, cerca de 10 linhas.

Cobertura das Fases 25–30, como sinal: boa e proporcional. Backend: `goal/*` (9 suítes), `report-schedule/*` (8), `report/*` (4), `demand/*` (3), `session/*` (3, incluindo revogação), `shared/session/sessionOrigin.test.ts`. Frontend: 32 suítes entre componentes e `lib/`. E2E: `goals`, `reports`, `report-schedules`, `history`, `security`. A lacuna real dessas fases está em Q-11 (a simulação não tem nenhum teste de Grupo A/Branca/ACL porque o caminho não existe).

### Comentários (`06`)

**Q-08 — Comentários desatualizados · Média · novo (+ antigos Q-02/Q-03)**
O `06:79` diz que comentário desatualizado é pior que comentário ausente. Encontrei estes:

- `backend/src/modules/consumption/consumption.service.ts:827-828` diz "só [Verde] está implementada; Azul/Convencional falham fechado (Fase 20)". O código aceita `BLUE` em `:870`.
- `backend/src/modules/property/property.schema.ts:81-82` diz "só Horária Verde tem cálculo implementado na Fase 19; Azul... chegam na Fase 20".
- `frontend/src/types/property.types.ts:100-105` diz "Só GREEN tem cálculo... o formulário só oferece GREEN". `PropertyForm.tsx:619` oferece Horária Azul.
- `backend/prisma/schema.prisma:122-124` diz "Azul chega na Fase 20".
- `backend/src/shared/retention/RetentionPurgeScheduler.ts:11-13` compara com o `HourlyRollupScheduler`, que não existe mais (foi substituído pelo `MinuteRollupScheduler`).
- `frontend/src/pages/about/AboutPage.tsx:10-12` diz "única rota do roadmap sem handoff" (há outras três, ver Q-04), cita o bundle `2026-07-31` (o vigente é `2026-09-06`) e mantém "decisão do usuário" (atribuição).
- `frontend/src/pages/property/AclComparisonPage.tsx:16-18` afirma que "O `10-design-system.md` confirma que não há mockup específico para esta tela". O `10` não diz isso (ver Q-04).

> **Recomendação:** reescrever cada um descrevendo o estado atual, sem número de fase. Exemplo para `consumption.service.ts:827`: "Verde e Azul têm cálculo; Convencional Binômia falha fechado". Vale incluir no checklist da skill `nova-feature`: "ao estender uma regra, procure comentários que a declaram inexistente".

**Q-09 — Comentário de rastreabilidade residual · Média · mudado (era Q-01)**
A queda de cerca de 310 para cerca de 45 ocorrências é real. O que sobra mostra **por onde o lint deixa passar**:

- **Número de issue sem termo do lint**: "Rastreado em #315" em `ModbusTcpConnection.ts:133`, `ModbusRtuConnection.ts:121`, `ProfinetConnection.ts:135` (todos em `backend/src/modules/iot/iot-worker/protocols/`).
- **Arquivos fora do escopo do lint**: `iot-simulator/server/eslint.config.js:11` e `iot-simulator/ui/eslint.config.js:13` ("#162", "a própria issue previu"); `scripts/lint-staged-run.mjs:20` ("issue #298").
- **Referência a laudo quebrada entre linhas**: `backend/src/modules/consumption/consumption.repository.ts:314-315` ("o laudo / de desempenho" não casa com "laudo de auditoria").
- **Em nome de teste (string, não comentário)**: `backend/src/config/env.test.ts:263` ("(#285)"); `frontend/src/lib/electricalQuantities.test.ts:70,79,102,131` ("RN34").
- **"Fase N" (~38 pontos, termo não coberto)**:
  - `backend/prisma/seed.ts:38,43,321,413`; `backend/prisma/schema.prisma:91,122-124,487,502`;
  - `backend/src/config/env.ts:242`; `backend/src/shared/test/clean-database.ts:48,59`; `clean-http-database.ts:27,34`;
  - `consumption.service.ts:828`; `iot/iot-worker/IoTDataProcessor.ts:73`; `property/property.service.ts:230`; `property/property.schema.ts:82,140,167`; `distributor/tariff-catalog.repository.ts:101`;
  - `frontend/src/lib/queryClient.ts:107`; `pages/property/BrancaComparisonPage.tsx:16-17`; `components/property/PropertyForm.tsx:468`; `types/property.types.ts:104`; `styles/industry.css:724,766`;
  - os blocos "Fase 12/18" dos quatro `eslint.config.js`.
- **Narrativa histórica** que explica o passado e não o código: `IoTConnectionManager.ts:66` ("Substitui os non-null assertions que existiam aqui"), `targetResolution.ts:24` ("que existiam antes").

> **Recomendação:**
> (1) Ampliar `local/no-comment-req-refs` para também casar `#\d{2,}` (fora de cor hex, que já é barrada em outra regra) e `\bFase \d+(\.\d+)?\b`. Cuidado: "fase A/B/C" elétrica não tem número, então o risco de falso positivo é baixo, mas meça antes.
> (2) Estender o lint (ou um grep no lint-staged) a `*.config.js` e `scripts/*.mjs`.
> (3) Varrer os ~45 pontos num PR só de `refactor`/`docs`.

### Design system (`10`)

**Q-06 — A trava anti-regressão de tokens tem ponto cego · Média · novo**
O seletor de `frontend/eslint.config.js:535` só casa `\[\d+(\.\d+)?(px|rem|em|%)\]`. Passam sem trava:

- `leading-[1.55]` (cerca de 12 ocorrências: `lib/markdown/industryMarkdownComponents.tsx:24`, `pages/landing/LandingPage.tsx:117,396,438,546,559,647`, `pages/auth/ConfirmEmailChangePage.tsx:76,86,102`, `ForgotPasswordPage.tsx:117`, `ResetPasswordPage.tsx:70,104`, `components/auth/BrandPanel.tsx:74`);
- `leading-[1.05]` / `leading-[1.03]` / `leading-[1.02]` (cerca de 15);
- `text-[clamp(...)]` nos títulos (`Header.tsx:56`, `LoginPage.tsx:177`, `RegisterPage.tsx:128`, `ForgotPasswordPage.tsx:65`, `ResetPasswordPage.tsx:126`, `ProfilePage.tsx:101`, `LandingPage.tsx:110,433,556`, `BrandPanel.tsx:70`, `industryMarkdownComponents.tsx:17`);
- `max-w-[NNch]`, `gap-[clamp(...)]` (`pages/report/ReportsPage.tsx:64`), `lg:max-h-[70vh]` (`components/analysis/AnalysisTree.tsx:184`), `opacity-[.14]`.

Pelo próprio critério do `10:79` (8 ou mais ocorrências reais → token), `leading-[1.55]`, `leading-[1.05]` e a escala de título responsivo já pedem nome.

> **Recomendação:** ampliar o regex para `\[(?:-?\d*\.?\d+(px|rem|em|%|ch|vh|vw)?|clamp\([^\]]*\))\]` e catalogar o débito como foi feito na Fase 18. Criar tokens `--leading-*` e um utilitário de título responsivo, e refletir via `/design-sync`.

**Q-07 — Hex residual nos arquivos catalogados · Baixa · mudado (era Q-25)**
Restam cerca de 30 hex em 7 arquivos dispensados da regra: `LandingPage.tsx` (19), `BrandPanel.tsx` (6), `LoginPage.tsx`, `Sidebar.tsx`, `UserMenu.tsx` (3 cada), `RecoverySteps.tsx` (2), `RegisterPage.tsx` (1). `#e6ecf2` é exatamente o `--color-text` do tema escuro e continua em linha em `components/auth/BrandPanel.tsx:43,74,83,105` e `pages/auth/RegisterPage.tsx:114`. `#d7e0ea` aparece em `components/layout/Sidebar.tsx:71,99`.

> **Recomendação:** substituição mecânica onde o token existe. Promover `#d7e0ea` se ele for semântico (texto do chrome escuro). Depois, encolher a lista de exceção.

**Q-04 — O `10` descreve um app que não é o atual · Média · novo**

- `10:68` afirma que a única tela sem handoff é "Sobre o projeto". O código tem **quatro** `TODO(design)`: `pages/about/AboutPage.tsx:10`, `pages/property/AclComparisonPage.tsx:16`, `pages/property/BrancaComparisonPage.tsx:14`, `components/meter/MeterForm.tsx:27`.
- `10:70` diz que Histórico, Metas, Configurações, a aba de grandezas elétricas e os relatórios agendados "ainda não têm implementação nenhuma". Todos foram entregues nas Fases 23–28.
- `10:64` diz que o template A4 "não existe ainda". `backend/src/modules/report/generators/reportPdf.ts` existe e o `02-requisitos.md:85` marca o RF40 como `[implementado]`.
- `10:63` diz que a versão anterior da Home é "o que está implementado hoje". O shell v2 entrou na Fase 23.
- A tabela `10:61` não mapeia `pages/history/`, `pages/analysis/`, `pages/area/` nem `pages/device/`.

É o documento que aplica a regra "proibido inventar layout". Com o inventário errado, a `nova-feature` pode tratar como "sem handoff" uma tela que tem handoff, ou o contrário.

> **Recomendação:** reescrever a seção "Bundle vigente" como **estado atual**: a tabela tela → bundle → código completa e a lista das 4 telas sem handoff, cada uma com o motivo. Isso também corrige o comentário de `AclComparisonPage.tsx:17`.

### Drift de documentação viva

**Q-02 — Índice de ADRs desatualizado nos quatro lugares · Alta · persistente (era Q-29)**

| Índice | Última ADR | Faltam |
|---|---|---|
| `04-tech-stack.md:31-44` | 0013 | 0014–0025 (12 ADRs, incluindo 0019 Grupo A, 0023 relatórios em Postgres, 0024 e-mail com anexo, 0025 sessões) |
| `03-arquitetura.md:124-141` | 0016 | 0017–0025 |
| `.claude/docs/README.md:50-69` | 0018 | 0019–0025 |
| `07-decisoes-em-aberto.md:21` ("Resolvidas") | — | 0016, 0017, 0019, 0020, 0021, 0023, 0024 |

O laudo anterior perguntava se o esquecimento era estrutural. A resposta é sim: ele se repetiu em todas as ADRs desde 2026-08-31.

> **Recomendação:** (1) eleger **um** índice canônico (o `.claude/docs/README.md`) e transformar a seção do `03` e a tabela do `04` em remissões ou em recortes por camada declarados como tal; (2) listar no protocolo de ADR do `CLAUDE.md` exatamente quais arquivos atualizar; (3) opcional: um teste ou script no CI que compare `ls .claude/docs/adr/` com as linhas do índice canônico.

**Q-03 — O `03` descreve a arquitetura da Fase 18 · Alta · novo**

- **Módulos.** `03:69` e `:102` falam em "16 módulos". São **24**: faltam `acl-contract`, `demand`, `demand-alert`, `goal`, `pld-quote`, `report`, `report-schedule` e `session`.
- **Assíncrono.** `03:70` diz que "o único caminho assíncrono é a ingestão IoT ... e a entrega via SSE". Hoje sobem **sete schedulers** no mesmo processo (`backend/src/server.ts:80-192`): rollup por minuto, rollup de demanda, alerta de demanda, alerta de meta, expurgo, sincronização de bandeira e envio de relatório agendado com SMTP. `03:73` ("forma da aplicação") também não os menciona.
- **Cache.** `03:77` diz "nenhum cache, fila ou réplica". Há três caches em processo com TTL: `backend/src/modules/tariff-flag/tariff-flag.repository.ts:60`, `distributor/distributor.repository.ts:60`, `distributor/tariff-catalog.repository.ts:27` (Fase 15). O `03:26-29` pede que cada cache tenha ADR.
- **SMTP.** `03:114` diz "recuperação de senha". Hoje há também confirmação de troca de e-mail e relatório agendado com anexo (ADR-0024), inclusive **para terceiros**.
- **Dados sensíveis.** `03:76` não lista os e-mails de destinatários de relatório (`backend/prisma/schema.prisma:1063-1065`, de terceiros) nem o rótulo de dispositivo e o IP mascarado das sessões (ADR-0025).
- **`shared/`.** `03:110` não inventaria `shared/session/` nem `shared/config/`.

> **Recomendação:** atualizar o "Específico do projeto". Para o cache: ADR curta registrando o requisito medido da Fase 15 (o `03` exige isso), ou citar a ADR se ela já existir. A seção de dados sensíveis tem interseção com o `09` e deve ser revisada junto com a próxima `auditoria-conformidade`.

**Q-23 — O `04` ficou para trás · Média · mudado (era Q-30/Q-31) + novo**

- `04:19` diz "**14 jobs bloqueantes**". `.github/workflows/ci.yml` tem **15**: o `root-format` (`:32`) não está na lista.
- `04:16` diz "hoje concentrados em 3 arquivos ... `ModbusTcpConnection.ts`, 662 linhas — quebrar ... é a Fase 16". A Fase 16 aconteceu: `protocols/` tem um arquivo por adaptador.
- `04:9` não cita `react-markdown` + `remark-gfm` (`frontend/package.json:37,40`), usados na "Sobre" e nas páginas legais, nem o React Compiler (`babel-plugin-react-compiler`, `:62`, Fase 17).
- `04:14-15` limitam nodemailer à "recuperação de senha" e pdfkit ao "export DSAR". Os dois agora geram relatórios (`backend/src/modules/report/generators/`), e o CSV é próprio (`report/csv.ts`).
- Versões de TypeScript diferentes (`backend` `^5.9.3`, `frontend` `~6.0.2`) não estão documentadas.

> **Recomendação:** corrigir as quatro linhas e, para os jobs, nomear os grupos em vez de contar (a contagem envelhece a cada job).

**Q-24 — O `06` descreve um enforcement diferente do real · Baixa · novo**

- `06:86` afirma que o plugin JSDoc "valida presença e forma dos blocos em exports públicos", sem qualificar o escopo (ver Q-17).
- `06:89-95` mostra `"auditoria"` como termo do `no-warning-comments`. As quatro configs usam `"laudo de auditoria"`, `"achado de auditoria"`, `"relatório de auditoria"` e explicam o motivo (`backend/eslint.config.js:69-75`). O exemplo do padrão diverge da prática.
- `06:99` mantém uma narrativa de processo ("Achado real (Fase 20, PR #401, revisão de código)...") num documento normativo. Rastreabilidade é permitida em docs, mas aqui é ruído no texto que as skills leem como regra.

> **Recomendação:** alinhar `06:86-99` às configs e mover a narrativa para o CHANGELOG ou para um ADR.

### Outros

**Q-13 — Notificação de meta reaproveita `alertId` e o store não expurga · Baixa · novo + persistente (era Q-37)**
`backend/src/modules/goal/GoalAlertScheduler.ts:216` grava `alertId: goal.id` em `Notification` (`backend/src/shared/notifications/notification-store.ts:8-9`). O nome do campo deixou de dizer o que ele carrega (`03:6`, linguagem ubíqua). O `NotificationStore` continua sem TTL, e `remove()` (`:52-61`) não apaga a lista vazia do `Map`.

> **Recomendação:** renomear para `sourceId` + `sourceType` (`ALERT | DEMAND_ALERT | GOAL`). Apagar a entrada do `Map` quando a lista esvaziar. O TTL continua oportunista.

---

## Pontos fortes (o que não mexer)

- **Travas que antes eram decorativas agora funcionam.** JSDoc nos quatro pacotes, `no-circular` e regra de camadas no frontend com gate de CI (`ci.yml:77,149,278`), type-check no pre-commit com o custo medido e documentado (`scripts/lint-staged-run.mjs:22-29`), regra local para RF/RN/FNC, anti-regressão de tokens. Q-05 e Q-17 pedem para **manter** isso vivo, não para trocar.
- **Módulo `session` (Fase 30).** `backend/src/modules/session/session.service.ts` é o modelo a seguir: funções pequenas e nomeadas, a falha fechada explicada no porquê (`:91-95`), 404 que não revela recurso alheio documentado no contrato (`:55-58`), relógio injetável e redução de tokens a sessões com regra explicada (`session-export.ts:29-39`).
- **Tipagem.** Dois `any` no repositório inteiro. `strict`, `noUncheckedIndexedAccess` e `noImplicitReturns` em todos os tsconfigs, e `exactOptionalPropertyTypes` no backend e no servidor do simulador. Os `!` que restam têm invariante explicada ao lado (ex.: `consumption.service.ts:850-853`).
- **Worker IoT.** Divisão por adaptador, `connectionConfigSchema` como camada anticorrupção da linha de banco e `withOptional` resolvendo `exactOptionalPropertyTypes` sem cast (`IoTConnectionManager.ts:55-71`).
- **Cobertura das features novas** proporcional ao risco, com E2E nos fluxos de metas, relatórios, agendamentos, histórico e segurança.
- **Zero over-engineering.** Procurei abstração especulativa nas Fases 25–30 e não encontrei. `ITariffFlagSource` continua com uma implementação mais o fake de teste (DIP que se paga), e os geradores de relatório são separados por documento real, não por hipótese.

---

## Priorização sugerida

**Agora (edição de texto, destrava as demais skills)**
Q-02 (índice de ADRs + protocolo no `CLAUDE.md`) · Q-03 (`03`) · Q-04 (`10`) · Q-23 (`04`) · Q-24 (`06`) · Q-08 (comentários desatualizados) · Q-05 (limpar as 8 entradas mortas do ESLint).

**Curto prazo (correção e fronteira)**
Q-11 (falhar fechado na simulação, TDD) · Q-10 (`MeterRepository.findIdsOwnedBy` + regra `prisma-only-in-repository`) · Q-14 (decidir a política 403/404 junto da auditoria de segurança) · Q-18, Q-19, Q-20 (últimos `any`, casts e disable).

**Refatoração dedicada (skill `refatoracao`)**
Q-01 (dividir `ConsumptionService`) · Q-21 (`PropertyForm` primeiro).

**Trava (fecha a porta para reincidência)**
Q-09 (ampliar `no-comment-req-refs` para `#NNN` e "Fase N", estender a configs e scripts) · Q-06 (ampliar o regex de tokens e criar tokens de `leading`/título) · Q-17 (ampliar o escopo do JSDoc).

**Oportunista**
Q-07, Q-12, Q-13, Q-15, Q-16, Q-22, Q-25, Q-26.
