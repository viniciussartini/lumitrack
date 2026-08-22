# Auditoria de Qualidade — 2026-08-22

**Escopo:** projeto inteiro (`backend/`, `frontend/`, `iot-simulator/`, `deploy/`, `.github/`, `.claude/project_context/`, `.claude/docs/`), estado da branch `epic/225-correcoes-pos-deploy-2` no commit `c88577a`.
**Referências:** `06-code-quality-standards.md`, `03-arquitetura.md`, `10-design-system.md`, `04-tech-stack.md`, `07-decisoes-em-aberto.md`.
**Método:** leitura dos padrões → varredura estática (imports, comentários, tipagem, tokens de UI, configs de lint/dependency-cruiser/CI/husky) → leitura dirigida dos pontos quentes → confronto do `project_context/` com o código real.

---

## Sumário executivo

O código é, no geral, **maduro e bem cuidado**: tipagem estrita real (`noUncheckedIndexedAccess`, `noImplicitReturns` nos cinco tsconfigs), `any` praticamente ausente, camadas de módulo consistentes, cobertura de teste alta e densa em caminhos de segurança, e comentários que de fato explicam o *porquê*. Não encontrei over-engineering: nenhuma abstração especulativa, nenhuma camada inventada, nenhum componente de infra além do declarado. A trava anti-over-engineering do `06` está sendo respeitada.

O problema não é o código escrito — é a **distância entre o que os documentos declaram enforçado e o que a ferramenta de fato enforça**, mais uma classe de violação de comentário que virou sistêmica.

Três eixos concentram o risco:

1. **Comentário de rastreabilidade em escala industrial.** O `06` proíbe explicitamente referência a issue, PR, achado, sprint, data ou autor no código. Há **~214 referências a issue/PR e ~96 a "Fase N" espalhadas por 192 arquivos** — incluindo `app.ts`, `config/env.ts`, `auth.service.ts` e a maior parte dos serviços. Não é um deslize pontual; é o idioma dominante de comentário do projeto, o que torna a regra letra morta e envelhece mal exatamente como o `06` prevê.
2. **Travas mecânicas parcialmente decorativas.** `complexity`/`max-lines-per-function` estão ligadas mas desligadas em **54 arquivos** (47 no frontend — aproximadamente metade dos componentes de produção —, 5 no backend, 2 no simulador). `eslint-plugin-jsdoc`, que o `06` nomeia como o mecanismo de enforcement da documentação de exports, **não está instalado em nenhum dos cinco pacotes**. O pre-commit roda lint e format, mas não type-check, ao contrário do que o `06` afirma. O dependency-cruiser tem uma regra só, e não a de ciclo que o `03` diz ser verificável por ele; o frontend não tem dependency-cruiser nenhum.
3. **Drift de documentação viva pós-deploy.** A ADR-0011 (keep-alive via UptimeRobot, 2026-08-21) **não está indexada em nenhum dos quatro lugares que indexam ADRs**. O `04` afirma "15 jobs bloqueantes" (são 14) e "um adaptador por protocolo" (são 8 classes em 2 arquivos). O `03` afirma "sem feature flags além de `REGISTRATION_ENABLED`" (há mais três) e não lista a integração com a API da ANEEL. O `10` estima "~143 valores arbitrários" (medi 291).

Nenhum achado é bloqueante de funcionamento. Os de severidade Alta são de **erosão de padrão**: cada um enfraquece uma garantia que o kit assume existir, e o `revisao-codigo` é a única camada de revisão antes do merge (`06`, calibragem deste projeto) — ele julga com base nessas garantias.

**Distribuição:** 7 Alta · 16 Média · 15 Baixa (38 achados).

---

## Tabela de achados

| ID | Tipo | Sev. | Local |
|---|---|---|---|
| Q-01 | Comentários | **Alta** | 192 arquivos (backend, frontend, simulador) |
| Q-02 | Comentários | Média | `frontend/src/contexts/RealtimeContext.tsx:16`, `frontend/src/pages/about/AboutPage.tsx:12` |
| Q-03 | Comentários | Média | `frontend/src/pages/about/AboutPage.tsx:11` |
| Q-04 | Enforcement | **Alta** | `backend/package.json`, `frontend/package.json`, `iot-simulator/{server,ui}/package.json` |
| Q-05 | Comentários | Média | `backend/src/modules/property/property.service.ts:11`, `backend/src/app.ts:63`, e outros |
| Q-06 | Complexidade | **Alta** | `frontend/eslint.config.js:59-113`, `backend/eslint.config.js:75-110`, `iot-simulator/ui/eslint.config.js:54` |
| Q-07 | SOLID / naming | **Alta** | `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts` |
| Q-08 | Complexidade / DRY | **Alta** | `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:64-252` |
| Q-09 | SRP | Média | `backend/src/modules/consumption/consumption.service.ts:48-164` |
| Q-10 | Complexidade | Média | `backend/src/app.ts:63-237` |
| Q-11 | Complexidade | Média | `frontend/src/pages/landing/LandingPage.tsx` e 5 outras |
| Q-12 | DRY | Média | 14 services do backend (33 ocorrências) |
| Q-13 | DRY | Média | 3 details pages + 6 componentes |
| Q-14 | Número mágico | Média | 8 call sites no `frontend/src/pages/` |
| Q-15 | Número mágico | Baixa | `backend/src/app.ts:132`, `backend/src/shared/time/parseJwtExpiry.ts:10`, `backend/src/shared/database/timeBucket.ts:16` |
| Q-16 | Tipagem | Média | `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:74-249` |
| Q-17 | Tipagem | Baixa | `backend/src/modules/user/user.repository.ts:115` |
| Q-18 | Tipagem | Baixa | `frontend/src/components/consumption/ConsumptionChart.tsx:37`, `frontend/src/components/realtime/RealtimePowerChart.tsx:37` |
| Q-19 | Enforcement | Baixa | `frontend/src/contexts/RealtimeContext.tsx:118` |
| Q-20 | Direção de dependência | Média | `backend/.dependency-cruiser.cjs`, ausência no `frontend/` |
| Q-21 | Fronteiras de módulo | Média | 8 services do backend |
| Q-22 | Enforcement | Média | `scripts/lint-staged-run.mjs:15-18` |
| Q-23 | Testes | Média | `backend/src/shared/targetResolution.ts` |
| Q-24 | Testes | Baixa | `parseJwtExpiry.ts`, `hashToken.ts`, `middlewares/rateLimiter.ts` |
| Q-25 | Design system | **Alta** | 17 arquivos `.tsx` + `frontend/src/types/tariff-flag.types.ts:66-76` |
| Q-26 | Design system / drift | Média | 44 arquivos vs. `10-design-system.md:69` |
| Q-27 | Design system | Média | 15 arquivos `.tsx` |
| Q-28 | Design system | Baixa | `frontend/src/pages/report/ReportsPage.tsx`, `frontend/src/pages/simulation/SimulationPage.tsx` |
| Q-29 | Drift de doc | **Alta** | `03-arquitetura.md:121-132`, `04-tech-stack.md:29-39`, `07-decisoes-em-aberto.md:19`, `.claude/docs/README.md:47-58` |
| Q-30 | Drift de doc | Média | `04-tech-stack.md:19` |
| Q-31 | Drift de doc | Média | `04-tech-stack.md:16` |
| Q-32 | Drift de doc | Média | `03-arquitetura.md:71` |
| Q-33 | Drift de doc | Média | `03-arquitetura.md:74,111-115` |
| Q-34 | Drift de doc | Baixa | `07-decisoes-em-aberto.md:14` |
| Q-35 | Drift de doc | Baixa | `.claude/docs/README.md`, `03-arquitetura.md:107-109` |
| Q-36 | Drift de doc | Baixa | `10-design-system.md:69` |
| Q-37 | Clean code | Baixa | `backend/src/shared/notifications/notification-store.ts:24` |
| Q-38 | Clean code | Baixa | `backend/prisma/seed-demo/verify.ts:41-43` |

---

## Detalhamento

### Comentários e documentação (`06`)

**Q-01 — Comentário de rastreabilidade sistêmico · Alta**
`06` (linhas 58-71) proíbe categoricamente referência a issue, PR, relatório de auditoria, achado, sprint, data ou autor no comentário. Medição:

- **214 ocorrências** de `#NNN` / "issue" / "sub-issue" em **106 arquivos**;
- **96 ocorrências** de "Fase N" em **79 arquivos**.

Exemplos em código de produção quente:

- `backend/src/app.ts:87` — `// Host canônico (issue #183) — recusa Host fora do domínio real...`
- `backend/src/app.ts:187,190` — `// Efetiva troca de e-mail (issue #178)...` / `// Cadastro público (issue #181)...`
- `backend/src/config/env.ts:29,48,120,150` — quatro blocos ancorados em número de issue
- `backend/src/server.ts:40,57,65,66,102,161` — "Fase 2/3/4" e `issue #182`
- `backend/src/shared/crypto/meterCredentialEncryption.ts:8`, `backend/src/shared/security/httpsRedirect.ts:2`, `backend/src/shared/pagination.ts:3`
- `frontend/src/lib/dashboardKpis.ts:10,70-71` — JSDoc excelente em conteúdo, contaminado por `issue #233`/`#234`
- `frontend/src/lib/sessionRefresh.ts:4`, `frontend/src/config/navigation.ts:29`, `frontend/src/config/demoUsers.ts:3`
- `iot-simulator/server/src/broker/broker.ts:33-34`, `iot-simulator/server/src/mqtt/internalPublisher.ts:20`

O caso é agravado por comentários que declaram *quando* algo mudou (`"Antes disso o broker aceitava qualquer cliente anônimo"`, `"desde #99"`), que é exatamente o papel do git.

> **Recomendação:** varredura em lote reescrevendo cada bloco para preservar **só a explicação funcional** e remover a âncora. `// Host canônico (issue #183) — recusa Host fora do domínio real (400)...` vira `// Recusa Host fora do domínio real (400) e redireciona HTTP → HTTPS usando SEMPRE este valor fixo, nunca o header do cliente (evita open redirect via Host forjado).` — o conteúdo funcional já está lá; sobra remover o `(issue #183)`. Referência a **ADR** pode ficar (o `06` não a proíbe e o ADR é a fonte sancionada de decisão). Vale abrir um épico dedicado: 192 arquivos não cabem num PR de feature. Considerar uma regra de lint custom ou um hook de grep para impedir reincidência — o próprio `06` diz que o que pode virar lint deve virar.

**Q-02 — Rastreabilidade por data/autor · Média**
`frontend/src/contexts/RealtimeContext.tsx:16` — `"decisão do usuário (2026-08-04)"`; `frontend/src/pages/about/AboutPage.tsx:12` — `"decisão do usuário 2026-08-04"`. Data + autor são as duas categorias mais explicitamente vetadas.
> **Recomendação:** manter a justificativa ("um badge 'ao vivo' com o stream caído mente sobre a frescura do dado" é ótima), remover a atribuição.

**Q-03 — Comentário desatualizado · Média**
`frontend/src/pages/about/AboutPage.tsx:11` afirma que "Sobre o projeto" é a **única** rota do roadmap sem handoff. O próprio `10-design-system.md:60` lista **três** (`pages/report/`, `pages/simulation/`, `/sobre`). O `06` classifica comentário desatualizado como pior que ausente.
> **Recomendação:** corrigir para "uma das três rotas sem handoff" ou remover a contagem.

**Q-04 — `eslint-plugin-jsdoc` ausente · Alta**
`06:80` declara: *"`eslint-plugin-jsdoc` valida presença e forma dos blocos em exports públicos (`jsdoc/require-jsdoc`, `jsdoc/require-param`, `jsdoc/require-returns`)"*. O pacote **não consta em nenhum dos cinco `package.json`** e nenhuma `eslint.config.js` o configura. A regra existe só no papel — e a cobertura real de JSDoc reflete isso: excelente em alguns arquivos (`dashboardKpis.ts`, `server.ts`, `MinuteBuffer.ts`), inexistente em outros.
> **Recomendação:** ou instalar e ligar o plugin (com `severity: warn` inicial e escopo restrito a `**/*.service.ts`, `**/*.repository.ts` e `shared/**` para não explodir), ou corrigir o `06` para descrever o que de fato se enforça. A pior situação é a atual: o padrão diz que está garantido, o `revisao-codigo` confia nisso, e não está.

**Q-05 — Exports públicos sem bloco de documentação · Média**
Amostra representativa:

- `backend/src/modules/property/property.service.ts:11` — classe `PropertyService` e seus 5 métodos públicos (`create`, `findById`, `findAll`, `update`, `delete`), todos lançando `NotFoundError`/`ForbiddenError`/`ValidationError`, **sem um único bloco `/** */`**, sem `@throws`.
- `backend/src/app.ts:63` — `createApp()`, ponto de composição de toda a aplicação (`03:103-105`), sem JSDoc.
- `backend/src/shared/middlewares/authenticate.ts:36` — `createAuthenticateMiddleware()`, código de autenticação, sem bloco.
- `backend/src/shared/database/timeBucket.ts:15,19` e `backend/src/shared/targetResolution.ts:21` — comentário de linha explicando bem o *porquê*, mas o `06:43` exige que **contrato seja sempre em bloco**.
- `backend/src/modules/consumption/consumption.service.ts:32-36` — mesmo caso: comentário `//` onde deveria haver bloco de classe.

> **Recomendação:** priorizar por superfície de contrato — services, repositories e utilitários de `shared/` primeiro; controllers e rotas depois (o Express já documenta muito pelo shape). Se Q-04 for resolvido, isto vira consequência mecânica.

---

### Complexidade e SOLID

**Q-06 — Trava de complexidade neutralizada por exceção em massa · Alta**
`complexity: 12`, `max-depth: 4` e `max-lines-per-function: 60` estão configuradas nos quatro pacotes — e desligadas em:

- `frontend/eslint.config.js:59-108` — **47 arquivos**, incluindo `AuthContext`, `RealtimeContext`, `ThemeContext`, `Sidebar`, `LoginPage`, `RegisterPage`, `DashboardPage`, `ProfilePage`, `SecurityPage` e todas as details pages. Isso é aproximadamente **metade dos componentes de produção do frontend**.
- `backend/eslint.config.js:75-110` — `IoTConnectionManager.ts`, `consumption.service.ts`, `authenticate.ts`, `app.ts`, mais seeds e scripts.
- `iot-simulator/ui/eslint.config.js:54` — `NetworkCard.tsx`, `Dashboard.tsx`.

A catalogação explícita (em vez de `eslint-disable` disperso) é a decisão certa e está bem justificada nos comentários. O problema é o **saldo**: com metade do frontend fora, a regra deixa de dar sinal para código novo escrito dentro desses arquivos, que é onde a complexidade continua crescendo.
> **Recomendação:** trocar a exceção por arquivo por um **teto decrescente com prazo**. Concretamente: mover as ~15 telas de maior valor para fora da lista na Fase 18 e, para as demais, substituir `complexity: "off"` por `complexity: ["warn", 20]` — um teto frouxo ainda impede regressão, `off` não impede nada.

**Q-07 — `ModbusTcpConnection.ts`: 805 linhas, 7 classes · Alta**
O arquivo contém `ModbusTcpConnection`, `ModbusRtuConnection`, `EthernetIpConnection`, `ProfibusConnection`, `ProfinetConnection`, `Rs232Connection` e `Rs485Connection` — sete adaptadores de protocolo, com suas sete interfaces de config, num arquivo nomeado por **um** deles. Viola SRP (sete razões para mudar), o princípio de nome que revela intenção (`06:21`) e contradiz o `04-tech-stack.md:16` (ver Q-31).
> **Recomendação:** um arquivo por adaptador, mesmo diretório, mesmo `export`. É refatoração mecânica (mover blocos + reapontar o barrel de import em `IoTConnectionManager.ts:34-42`), sem mudança de comportamento — cabe na skill `refatoracao` num PR só. O `SERIAL_LINE_BUFFER_MAX_BYTES` e o que for comum sobem para um `serial-shared.ts`.

**Q-08 — `createConnection()`: 189 linhas, 8 ramos, ~25 repetições · Alta**
`IoTConnectionManager.ts:64-252`. Um `switch` de 8 casos onde cada caso repete literalmente o mesmo idioma:

```ts
const x = extraField<number>(extra, "pollingIntervalMs")
if (x !== undefined) { cfg.pollingIntervalMs = x }
```

`pollingIntervalMs` aparece 7 vezes, `unitId` 2, `baudRate` 3, `address`/`port` condicionais 2 cada. O `eslint.config.js:81` já reconhece o débito e o remete à Fase 16.
> **Recomendação:** a Fase 16 já prevê schema Zod por protocolo — é a solução certa e elimina de uma vez o switch, os `!` de Q-16 e o `extraField<T>` genérico não-validante. Enquanto não chega: um helper `assignDefined(cfg, { pollingIntervalMs, unitId })` corta ~120 das 189 linhas sem mudar semântica.

**Q-09 — `ConsumptionService.list()`: 117 linhas, 5 responsabilidades · Média**
`consumption.service.ts:48-164` faz, em sequência: parse Zod, resolução de posse + autorização, 4 buscas de repository, o caso especial de custo anual por propriedade (agregação de 12 custos mensais, `:91-121`) e o mapeamento final com 3 ramos de tarifação. O comentário `:91-94` explicando *por que* o piso anual não pode ser aplicado uma vez só é exemplar — mas está enterrado numa função que já não cabe na cabeça.
> **Recomendação:** extrair `computeYearlyPropertyCosts()` e `resolveBucketCost()` como métodos privados. A regra de negócio fica nomeada e testável em isolamento; o `list()` volta a ler como orquestração.

**Q-10 — `createApp()`: 175 linhas · Média**
`app.ts:63-237`. É o ponto de composição declarado pelo `03:103-105`, então tamanho é parcialmente inerente. Ainda assim mistura três coisas distintas: resolução de defaults de DI (`:64-75`), pipeline de middlewares de segurança (`:79-172`) e montagem de rotas (`:183-232`).
> **Recomendação:** extrair `applySecurityMiddlewares(app, appLogger, globalRateLimiter)` e `mountRoutes(app, deps)`. Baixo risco, alto ganho de legibilidade para quem chega.

**Q-11 — Componentes React acima de 350 linhas · Média**
`LandingPage.tsx` 732 · `ProfilePage.tsx` 619 · `PropertyDetailsPage.tsx` 547 · `AreaDetailsPage.tsx` 511 · `RegisterPage.tsx` 356 · `DeviceDetailsPage.tsx` 353. Todos na lista de exceção de Q-06.
> **Recomendação:** `LandingPage` é o caso mais fácil — os SVGs inline (`:240-270`, `:500-516`) são componentes puros sem estado, saem para `components/landing/` sem nenhum risco. `ProfilePage` concentra 3 formulários independentes (dados pessoais, troca de e-mail, exclusão de conta) que já são seções visuais distintas.

---

### DRY

**Q-12 — Idioma parse-or-throw repetido 33 vezes · Média**
Em 14 services do backend, sempre idêntico:

```ts
const parsed = xSchema.safeParse(input)
if (!parsed.success) {
    const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
    throw new ValidationError(firstError ?? "Dados inválidos")
}
```

Contagem: `auth.service.ts` 7 · `alert.service.ts` 4 · `meter.service.ts` 4 · `area.service.ts` 3 · `device.service.ts` 3 · `property.service.ts` 3 · `user.service.ts` 2 · outros 7 × 1. Não é coincidência semântica — é a mesma decisão de contrato repetida.
> **Recomendação:** `parseOrThrow<T>(schema: ZodType<T>, input: unknown): T` em `shared/validation/`. Além do corte de ~130 linhas, centraliza a decisão de *qual* erro do Zod vira mensagem de usuário — hoje mudá-la exige tocar 14 arquivos.

**Q-13 — Duplicação de UI: details pages e badge "ao vivo" · Média**
`PropertyDetailsPage.tsx` (547), `AreaDetailsPage.tsx` (511) e `DeviceDetailsPage.tsx` (353) têm a mesma estrutura: breadcrumb → cabeçalho com badge ao vivo → `MeterSection` → `ConsumptionSection`. O bloco do ponto verde ao vivo é textualmente idêntico em `PropertyDetailsPage.tsx:117`, `AreaDetailsPage.tsx:135`, `DeviceDetailsPage.tsx:132`, `LoginPage.tsx:120`, `LandingPage.tsx:174`, `LiveKpiCard.tsx:27`, `MeterSection.tsx:168` e `RealtimeChartCard.tsx:57` — **8 cópias**.
> **Recomendação:** extrair `<LiveBadge label="..." />` (resolve Q-13 e metade de Q-25 no mesmo movimento). Para as details pages, avaliar um `<EntityDetailsLayout>` — mas só se a terceira cópia realmente compartilhar comportamento, não só aparência (o `06:84` avisa contra deduplicar coincidência).

---

### Números mágicos

**Q-14 — `31` (teto de `pageSize`) literal em 8 call sites · Média**
`AlertsPage.tsx:39,46` · `PropertiesPage.tsx:33` · `PropertyDetailsPage.tsx:59` · `ReportsPage.tsx:29,30,31` · `DistributorsPage.tsx:31`. Cada um acompanhado de um comentário explicando que 31 é o teto do backend. Só `DashboardPage.tsx:37` nomeia (`PROPERTIES_PAGE_SIZE = 31`).
> **Recomendação:** `export const MAX_PAGE_SIZE = 31` em `frontend/src/types/pagination.types.ts` (que já documenta o espelhamento com `backend/src/shared/pagination.ts`). Se o backend mudar o teto, um lugar muda.

**Q-15 — Constantes não nomeadas em pontos sensíveis · Baixa**

- `backend/src/app.ts:132` — `maxAge: 31536000` (HSTS, 1 ano). O comentário diz "1 ano"; o número não.
- `backend/src/shared/time/parseJwtExpiry.ts:10,23` — fallback `15 * 60 * 1000` e default `60 * 1000` inline, ambos decisões de segurança silenciosas.
- `backend/src/shared/database/timeBucket.ts:16` — `'America/Sao_Paulo'` hardcoded no SQL. É a premissa que originou os bugs #233/#234 (ver nota abaixo) e não tem nome nem um único ponto de definição.

> **Recomendação:** `const HSTS_MAX_AGE_SECONDS = 31_536_000`, `const DEFAULT_JWT_EXPIRY_MS = 15 * 60 * 1000`, `const APP_TIMEZONE = "America/Sao_Paulo"`. Contraste positivo: `AneelTariffFlagSource.ts:32-35` faz exatamente isso (`FETCH_LIMIT`, `REQUEST_TIMEOUT_MS`, `MAX_ATTEMPTS`, `RETRY_DELAY_MS`) — é o padrão a replicar.

**Nota relacionada (não é achado próprio, é contexto de risco):** o contrato de `bucketStart` entre backend e frontend é ambíguo por construção — o backend devolve um timestamp *naive* cujos dígitos já são hora de parede de SP (`timeBucket.ts:16`), e o driver o serializa como se fosse UTC. `frontend/src/lib/dashboardKpis.ts` precisa manter **duas famílias de decodificação** (`toLocalDateKey` vs. `bucketDateKey`, `toLocalMonthKey` vs. `bucketMonthKey`) que não são intercambiáveis, com JSDoc extenso explicando a armadilha. Já produziu dois bugs em produção (#233 e #234, ambos corrigidos nesta branch). A documentação é exemplar, mas está compensando um contrato que poderia ser inequívoco: devolver `bucketKey: "2026-08-21"` como string, ao lado do `bucketStart`, eliminaria a classe inteira. Vale como candidato a ADR/issue, não como correção de auditoria.

---

### Tipagem

**Q-16 — Non-null assertions sobre dado vindo do banco · Média**
`IoTConnectionManager.ts` usa `config.host!`, `config.port!`, `config.topic!`, `config.address!` em **13 pontos** (`:74,75,76,95,96,97,116,140,164,183,217,236`), sobre campos declarados `string | null` / `number | null` em `MeterConnectionConfig` (`:46-54`). O `!` desliga o `strictNullChecks` justamente na fronteira onde o dado é menos confiável (vem do banco, potencialmente gravado por uma versão antiga do schema). Um medidor MQTT sem `topic` não falha com erro de validação — falha lá dentro do adaptador, com stack trace de biblioteca.
> **Recomendação:** é o mesmo alvo da Fase 16 (schema Zod por protocolo). Interinamente, um guard explícito por caso (`if (config.topic === null) throw new ValidationError("Medidor MQTT sem tópico")`) já converte falha obscura em falha fechada e legível.

**Q-17 — Cast duplo em escrita de usuário · Baixa**
`backend/src/modules/user/user.repository.ts:115` — `data: cleanData as unknown as Prisma.UserCreateInput`. O `as unknown as` existe porque `Object.fromEntries` perde o tipo. É o único cast duplo em código de produção do repositório inteiro (os demais 30+ estão em testes, onde é aceitável).
> **Recomendação:** substituir o `Object.fromEntries(...filter(...))` por construção explícita do objeto com spread condicional — recupera a tipagem e é mais legível que a versão atual.

**Q-18 — `any` remanescente · Baixa**
`ConsumptionChart.tsx:37` e `RealtimePowerChart.tsx:37` — `payload?: any[]` no tooltip do recharts, com `eslint-disable-next-line` explícito. É o único `any` do projeto (o resto dos matches são `expect.any()` de teste). O `06`/`CLAUDE.md` proíbem `any` e mandam usar `unknown` + narrowing.
> **Recomendação:** `payload?: { value?: number; payload?: ConsumptionBucket }[]` cobre o uso real; se não cobrir, `unknown[]` + narrowing no ponto de leitura. Duas linhas fecham a última brecha de `any` do projeto — vale pela higiene.

**Q-19 — Supressão de lint sem justificativa · Baixa**
`frontend/src/contexts/RealtimeContext.tsx:118` — `// eslint-disable-next-line react-hooks/exhaustive-deps` sem uma palavra de explicação, num efeito que gerencia a conexão SSE única do app. Todos os outros disables do projeto são justificados.
> **Recomendação:** ou justificar em uma linha (por que `queryClient`/`navigate`/`toast` estão intencionalmente fora do array), ou incluí-los — `queryClient` e `navigate` são estáveis por referência, então provavelmente incluir não custa nada e o disable some.

---

### Direção de dependência e fronteiras

**Q-20 — dependency-cruiser com uma regra só; frontend sem nenhuma · Média**
`backend/.dependency-cruiser.cjs` tem exatamente uma regra (`no-express-in-domain`). O `03:37` afirma: *"Sem dependência circular entre módulos — ... **Verificável por regra do dependency-cruiser (`06`)**"*. Essa regra **não existe**. O `frontend/` não tem dependency-cruiser nem no `package.json` nem no CI, apesar de ter uma estrutura de camadas própria (`pages` → `components` → `hooks` → `services` → `lib`) que se beneficiaria de uma regra de sentido único.
> **Recomendação:** adicionar `no-circular` (severity `error`) ao backend — é a regra que o `03` já promete e custa uma entrada no array. Para o frontend, uma regra só também basta: `services/` e `lib/` não podem importar de `pages/` ou `components/`.

**Q-21 — Services acessam repositories de outros módulos · Média**
O `03:70` declara: *"Comunicação entre módulos: **síncrona por interface (service → service)**, com o repositório como único ponto de acesso ao banco de cada módulo"*. Na prática o padrão é service → repository *de outro módulo*:

- `consumption.service.ts:7-15` → `MeterRepository`, `PropertyRepository`, `AreaRepository`, `DeviceRepository`, `DistributorRepository`, `TariffFlagRepository` (**6 módulos**)
- `export.service.ts:1-13` → `UserRepository`, `AlertRepository`, `AreaRepository`, `DeviceRepository`, `AuditRepository` (**5**)
- `meter.service.ts:11-13`, `meter-reading.service.ts:11-13`, `meter-target.ts:3-5` → Property/Area/Device (**3** cada)
- `device.service.ts:4-5`, `area.service.ts:4`, `simulation.service.ts:16-17`, `property.service.ts:7`, `alert-event.service.ts:3`

Isso significa que a regra de negócio de `PropertyService` (validação, autorização) pode ser contornada por seis consumidores que falam direto com `PropertyRepository`. `resolveRootProperty` (`shared/targetResolution.ts`) foi criada exatamente para centralizar a checagem de posse que se perdeu nesse caminho — é o sintoma.

Ressalva honesta de calibragem: todos os imports são `import type`, não há acoplamento de runtime, e a alternativa (service → service em 6 direções) pode gerar ciclo. Isto **não** é um pedido de refatoração — é um pedido de decisão explícita.
> **Recomendação:** escolher um dos dois e registrar. (a) Atualizar o `03:70` para descrever a realidade — "acesso de leitura direto ao repository de outro módulo é permitido; escrita e regra de negócio passam pelo service" —, ou (b) ADR declarando o padrão de acesso cross-módulo. O estado atual (documento diz uma coisa, código faz outra, sem regra mecânica) é o pior dos três.

**Q-22 — Pre-commit sem type-check · Média**
`06:103` exige *"husky + lint-staged: lint, format e **type-check** no pre-commit"*. `scripts/lint-staged-run.mjs:15-18` roda apenas `eslint --fix` e `prettier --write`. O type-check só acontece no CI (`frontend-build` / `backend-build`).
> **Recomendação:** ou adicionar `tsc --noEmit -p .` ao loop (o custo é real num monorepo, mas é o gate mais valioso), ou ajustar o `06` para dizer que type-check é gate de CI e não de pre-commit. Como em Q-04: o problema é a divergência, não a escolha.

---

### Testes

A cobertura é o ponto mais forte do projeto: **72 arquivos de teste no backend** (incluindo `env.test.ts`, `csrf.test.ts`, `outboundHost.test.ts`, `httpsRedirect.test.ts`, `app.log-redaction.test.ts`, `app.security-headers.test.ts`), suíte de rotas com supertest por módulo, e E2E Playwright cobrindo os fluxos críticos. Os nomes seguem o estilo comportamental que o `06:125` pede. Duas lacunas de sinal:

**Q-23 — `resolveRootProperty` sem teste próprio · Média**
`backend/src/shared/targetResolution.ts:21` é a primitiva de **resolução de posse** — a função que decide de quem é o recurso antes de `ConsumptionService` e `MeterReadingService` agregarem dados. `03:117-119` a coloca no centro do modelo de autorização. Não existe `targetResolution.test.ts`; ela é exercitada só indiretamente, via testes de rota. O `06:115` pede priorização explícita de caminhos de segurança.
> **Recomendação:** teste unitário com repositories mockados cobrindo os 6 caminhos (PROPERTY ok/404, AREA ok/área-404/propriedade-404, DEVICE ok/device-404/área-404/propriedade-404). É rápido de escrever e trava a regra contra regressão silenciosa.

**Q-24 — Utilitários de segurança sem teste dedicado · Baixa**
`shared/time/parseJwtExpiry.ts` (define tempo de vida de sessão e `maxAge` de cookie, com fallback silencioso), `shared/crypto/hashToken.ts` e `shared/middlewares/rateLimiter.ts`. Os três têm irmãos testados no mesmo diretório (`csrf.test.ts`, `blindIndex.test.ts`, `httpsRedirect.test.ts`), o que reforça a assimetria.
> **Recomendação:** `parseJwtExpiry` primeiro — é puro, o teste é de 10 linhas, e cobre o comportamento perigoso (string malformada → 15 min silenciosos).

---

### Design system (`10`)

**Q-25 — Cor hardcodada fora dos tokens · Alta**
`10:22` é explícito: *"**Proibido hardcodar** cor, espaçamento ou tipografia fora da escala de tokens (ex.: `#3B82F6`...)"*. Encontrei **54 ocorrências de hex de 6 dígitos em 17 arquivos `.tsx`**, com casos onde **o token equivalente já existe** em `frontend/src/styles/industry.css`:

| Hex hardcodado | Token existente | Onde |
|---|---|---|
| `#3f8f52` (ponto "ao vivo") | *nenhum* — cor órfã | 9 pontos: `DeviceDetailsPage:132`, `PropertyDetailsPage:117`, `LoginPage:120`, `LandingPage:172,174`, `LiveKpiCard:27`, `AreaDetailsPage:135`, `MeterSection:166,168`, `RealtimeChartCard:55,57` |
| `#2f6f3f` | `--color-status-success` (`industry.css:615`) | `ResetPasswordPage:94,96`, `ConfirmEmailChangePage:81,83` |
| `#5980a6` | `--color-accent` (`industry.css:11`) | `LandingPage:73,244-245,260,508,510,512,646` |
| `#1d1f20` | `--color-text` (`industry.css:10`) | `LandingPage:248,502,576` |
| `#e6ecf2` | `--color-text` do tema escuro (`industry.css:599`) | `LoginPage:118,130,135`, `RegisterPage:113` |
| `#d98a1e` | `--color-status-highlight` (`industry.css:619`) | `LandingPage:267,509,511,513,515` |

Caso mais grave por ser dado, não markup: `frontend/src/types/tariff-flag.types.ts:66-76` define **dois mapas de cor por bandeira** inteiramente em hex arbitrário (`GREEN: "text-[#8fd0a0]"`, `YELLOW: "#c98f2e"`, `RED_P1: "#c15a42"`, `RED_P2: "#a83f2c"`), com um comentário admitindo que o design system "só define a cor da bandeira Verde". Isto é uma **decisão de token não tomada**, exatamente o caso que o `10:22` manda resolver atualizando o tema, não driblando inline.

Isto é distinto da dívida já reconhecida no `10:69` — aquela é sobre **espaçamento e tipografia** ("o `@theme` mapeia cor, fonte, raio e sombra, mas **não** a escala tipográfica e de espaçamento"). **Cor está mapeada.** Hardcodar cor não tem a cobertura daquela nota.
> **Recomendação:** (1) trocar as 5 cores com token existente pela utilitária correspondente — é substituição mecânica; (2) promover `#3f8f52` a `--color-status-live` em `industry.css` e refletir via `/design-sync` (é a cor mais repetida do app e não tem nome); (3) promover as 4 cores de bandeira a tokens semânticos (`--color-flag-green/yellow/red-p1/red-p2`) — são cor de domínio, pertencem ao design system.

**Q-26 — Valores arbitrários dobraram sem o doc acompanhar · Média**
`10:69` estima *"~143 valores arbitrários entre colchetes"*. Medição atual: **291 ocorrências em 44 arquivos** (regex `\[\d+(\.\d+)?(px|rem|em|%)\]`, só `.tsx` de produção). Concentração: `LandingPage` 55 · `ProfilePage` 26 · `PropertyDetailsPage` 18 · `ConfirmEmailChangePage` 16 · `ResetPasswordPage` 14 · `AreaDetailsPage` 13 · `LoginPage` 12 · `ForgotPasswordPage` 12 · `RegisterPage` 11 · `MeterSection` 10.

O crescimento é esperado (a dívida de token é conhecida e o `10:69` orienta corretamente a seguir o valor do bundle), mas o **número no documento é o que dimensiona a Fase 18** — e está desatualizado por um fator de 2.
> **Recomendação:** atualizar o `10:69`. Idealmente, a Fase 18 mapeia a escala tipográfica e de espaçamento do Industry no `@theme` de uma vez — resolve os 291 de raiz em vez de um a um.

**Q-27 — Paleta pré-Industry em telas ativas · Média**
**66 ocorrências** de `slate-*`/`gray-*`/`amber-*` em **15 arquivos**: `ConsumptionChart` 10 · `ConsumptionTable` 9 · `AlertRowMenu` 7 · `AreaForm` 7 · `ReportsPage` 5 · `DeviceMenu` 5 · `AreaMenu` 5 · `PropertyMenu` 5 · `PlaceholderPage` 4 · `PropertyForm` 3 · `UserMenu` 2 · outros. O `10:69` fala em "~16 arquivos periféricos" — o número bate, mas alguns não são periféricos: `ConsumptionChart` e `ConsumptionTable` são o miolo do Histórico de Consumo, que acabou de ser retrabalhado nesta branch (`#226`, `#230`, `#239`).
> **Recomendação:** `ConsumptionChart` e `ConsumptionTable` primeiro — são o que o usuário olha mais e acabaram de receber trabalho, então o custo marginal de migrar agora é baixo.

**Q-28 — Telas sem handoff sem o marcador `TODO(design)` · Baixa**
`10:85` exige que versão provisória seja marcada com `// TODO(design): aguardando handoff — <tela>`. `AboutPage.tsx:10` cumpre. `ReportsPage.tsx` (menciona o `10` num comentário de JSX, mas sem o marcador) e `SimulationPage.tsx` (JSDoc diz "placeholder", sem marcador) não. Sem o marcador, esta auditoria não as reporta mecanicamente — que é exatamente a função do marcador (`10:86`).
> **Recomendação:** adicionar o marcador nas duas.

---

### Drift de documentação viva

Esta é a seção que mais mudou com o trabalho recente de deploy. O `project_context/` alimenta todas as demais skills — contexto desatualizado induz erro em cadeia.

**Q-29 — ADR-0011 não indexada em lugar nenhum · Alta**
`.claude/docs/adr/0011-keep-alive-monitor-externo-uptimerobot.md` existe, está aceita e datada de **2026-08-21**. Não aparece em:

- `03-arquitetura.md:121-132` — seção "ADRs já tomadas" termina na 0010;
- `04-tech-stack.md:29-39` — tabela "Decisões registradas" termina na 0010; a linha de Observabilidade (`:21`) descreve Kuma e health check do Render, sem mencionar o UptimeRobot;
- `07-decisoes-em-aberto.md:19` — "Resolvidas" termina na ADR-0010;
- `.claude/docs/README.md:47-58` — tabela de ADRs termina na 0010.

O `DEPLOY.md` a menciona, e o CHANGELOG tem a entrada — então o problema é só de indexação, mas é o índice que as skills leem.
> **Recomendação:** quatro linhas, quatro arquivos. Vale checar se o protocolo de ADR do `CLAUDE.md` não deveria listar explicitamente os quatro índices a atualizar — o esquecimento parece estrutural, não distração.

**Q-30 — Contagem de jobs de CI errada · Média**
`04-tech-stack.md:19` afirma **"15 jobs bloqueantes"**. `.github/workflows/ci.yml` define **14**: `secret-scan`, `frontend-{lint,build,test,audit}`, `backend-{lint,build,audit,test}`, `iot-simulator-{lint,build,test,audit}`, `e2e`.
> **Recomendação:** corrigir para 14 (ou nomear os grupos em vez de contar — contagem envelhece a cada job novo).

**Q-31 — "Um adaptador por protocolo" não é verdade · Média**
`04-tech-stack.md:16` — *"um adaptador por protocolo em `backend/src/modules/iot/iot-worker/protocols/`"*. O diretório tem **3 arquivos**: `IConnection.ts`, `MqttConnection.ts` e `ModbusTcpConnection.ts` — este último com 7 das 8 classes (ver Q-07).
> **Recomendação:** corrigir o `04` **ou** corrigir o código (Q-07). Como Q-07 é a refatoração certa por mérito próprio, resolver o código e deixar o `04` como está é a saída mais barata.

**Q-32 — Feature flags subcontadas · Média**
`03-arquitetura.md:71` — *"Sem i18n e sem feature flags além de `REGISTRATION_ENABLED`"*. Existem hoje **quatro**: `REGISTRATION_ENABLED` (`backend/src/config/env.ts:148`), `DEMO_LOGIN_ENABLED` (`:158`), `DEMO_BOOTSTRAP_ENABLED` (`iot-simulator/server/src/config/env.ts:36`) e `VITE_DEMO_MODE` (flag de build do frontend, `LoginPage.tsx:38`). Esta última é particularmente relevante porque o `render.yaml:104-110` documenta que ela e a `DEMO_LOGIN_ENABLED` são **independentes, sem fonte de verdade compartilhada** — exatamente o tipo de armadilha que o `03` existe para registrar.
> **Recomendação:** atualizar `03:71` listando as quatro e onde cada uma vive, com a nota da independência entre `VITE_DEMO_MODE` e `DEMO_LOGIN_ENABLED`.

**Q-33 — Integrações externas incompletas · Média**
`03-arquitetura.md:74,111-115` lista SMTP + 7 protocolos IoT e afirma *"Nenhuma integração de pagamento, mapa ou terceiro de observability está implementada"*. Faltam:

- **API de Dados Abertos da ANEEL** — `AneelTariffFlagSource.ts:19` faz `fetch` para `https://dadosabertos.aneel.gov.br` no boot e a cada 24h (ADR-0007). É uma integração externa de saída, com adapter próprio e schema de anti-corrupção (`aneel-response.schema.ts`) — precisamente o padrão que o `03:38` descreve.
- **UptimeRobot** — serviço externo de entrada, ADR-0011.

> **Recomendação:** acrescentar as duas em `03:111-115`. A da ANEEL é a mais importante: é a única chamada de saída não-IoT do backend, e quem for mexer em SSRF/allowlist precisa saber que ela existe.

**Q-34 — Pendência do `07` já resolvida · Baixa**
`07-decisoes-em-aberto.md:14` (item "App mobile") registra: *"**Pendência concreta:** o `README.md` da raiz linka `mobile/README.md`, que não existe no repositório."* O `README.md:51` hoje diz apenas `- **Mobile** *(planejado — escopo e stack ainda não decididos)*`, sem link. A decisão de fundo (haverá app?) continua legitimamente aberta; a pendência concreta não.
> **Recomendação:** remover a frase da pendência, manter o item.

**Q-35 — Índices e inventários incompletos · Baixa**

- `.claude/docs/README.md` não lista `DEPLOY.md` (procedimento de deploy, produzido pela Fase 13.5 e referenciado por `04`, `render.yaml`, `Dockerfile` e ADR-0011) nem `O-Sistema-Eletrico-Brasileiro.md` (que o `CLAUDE.md` declara ser fonte de verdade sincronizada com a wiki).
- `03-arquitetura.md:107-109` inventaria `shared/` mas omite `errors/` (`AppError.ts`, base de todo o tratamento de erro), `targetResolution.ts` (resolução de posse — central para autorização), `database/timeBucket.ts` e `test/`.

> **Recomendação:** completar os dois inventários. O `shared/errors` e o `targetResolution` são os que mais custam a quem chega — são exatamente o que se procura ao entender autorização e erro.

**Q-36 — Nota de estágio do `10` desatualizada · Baixa**
`10-design-system.md:69`, datada de 2026-08-09, subestima a dívida de valores arbitrários em ~2× (ver Q-26).
> **Recomendação:** reamostrar e redatar ao fechar a Fase 18.

---

### Outros

**Q-37 — `NotificationStore` sem expurgo por usuário · Baixa**
`backend/src/shared/notifications/notification-store.ts:24` — o `Map<userId, Notification[]>` tem cap **por usuário** (`MAX_NOTIFICATIONS_PER_USER = 100`, bem nomeado), mas nenhuma entrada é removida quando o usuário sai. O `Map` cresce monotonicamente com o número de usuários distintos que receberam ao menos uma notificação desde o boot. No escopo atual (demo, cadastro fechado, processo reiniciado a cada hibernação) é inofensivo; num processo de vida longa, não.
> **Recomendação:** um TTL simples ou expurgo no `removeAll` — não urgente, mas registrar como issue para não virar surpresa quando a hospedagem migrar para o Caminho B.

**Q-38 — Credenciais de demo impressas em stdout · Baixa**
`backend/prisma/seed-demo/verify.ts:41-43` imprime e-mail e senha das contas de demonstração. São contas sintéticas de escopo restrito (ADR-0010), então não é vazamento de PII — mas é credencial em log de build/deploy, que pode acabar em artefato de CI.
> **Recomendação:** imprimir só os e-mails e remeter a senha ao `DEPLOY.md`. (Interseção com a auditoria de segurança — reportado aqui por higiene de código.)

---

## Pontos fortes (o que não mexer)

Vale registrar, porque um laudo só de achados distorce o estado real:

- **Tipagem estrita de verdade.** `strict` + `noUncheckedIndexedAccess` + `noImplicitReturns` nos cinco tsconfigs, e o resultado aparece no código: dois `any` no projeto inteiro, ambos com disable explícito e localizado.
- **Zero over-engineering.** Procurei especificamente por abstração especulativa e não encontrei. `ITariffFlagSource` tem uma implementação só, mas serve a um fake de teste — é DIP que se paga, não ritual. Nenhum cache, fila ou réplica, coerente com a trava do `03:13`.
- **Comentários que explicam o *porquê*.** `IoTConnectionManager.ts:272-286` (por que revalidar SSRF a cada conexão em vez de fixar o IP), `app.ts:179-182` (por que `app.use` no login cobre `/mfa`), `env.ts:145-147` (por que `z.stringbool()` e não `z.coerce.boolean()`), `deploy/demo-entrypoint.sh:5-13` (por que o encaminhamento de sinal não é detalhe). Este é o padrão a proteger — o problema de Q-01 é a âncora de issue colada nele, não o conteúdo.
- **Cobertura de teste como sinal, não como número.** 72 arquivos de teste no backend cobrindo redação de log, cabeçalhos de segurança, CSRF, SSRF, redirect HTTPS e validação de env; E2E Playwright nos fluxos críticos; nomes no estilo comportamental. Vários testes documentam no próprio nome o bug que reproduzem.
- **Infraestrutura de deploy bem escrita.** `Dockerfile`, `deploy/demo-entrypoint.sh`, `render.yaml` e `docker-compose.yml` estão entre os artefatos mais bem documentados do repositório — cada decisão não óbvia (por que `-slim` e não `-alpine`, por que os dois processos no mesmo container, por que o `|| true` no curl) tem justificativa escrita ao lado.
- **Catalogação explícita de débito.** As listas de exceção do ESLint, apesar de Q-06, são a decisão certa: débito visível num lugar só vence `eslint-disable` espalhado. Manter o formato ao reduzir a lista.

---

## Priorização sugerida

**Agora (barato e destrava o resto)**
Q-29 (indexar ADR-0011 nos 4 lugares) · Q-30, Q-31, Q-32, Q-33, Q-34, Q-35, Q-36 (drift de doc — é tudo edição de texto) · Q-28 (dois marcadores `TODO(design)`) · Q-18, Q-19 (últimos `any` e o disable sem justificativa).

**Curto prazo (fecha a lacuna entre padrão declarado e enforçado)**
Q-04 (decidir sobre `eslint-plugin-jsdoc`) · Q-22 (decidir sobre type-check no pre-commit) · Q-20 (`no-circular` no backend) · Q-21 (ADR ou correção do `03` sobre acesso cross-módulo a repository) · Q-23 (teste de `resolveRootProperty`).

**Épico próprio**
Q-01 — os ~310 comentários de rastreabilidade em 192 arquivos. Não cabe num PR de feature e não deve ser feito aos pedaços, ou o padrão nunca fecha.

**Fase 18 (design system) — já planejado, com escopo revisado**
Q-25 (cor hardcodada — separar do débito de espaçamento, é violação distinta) · Q-26 (mapear escala tipográfica/espaçamento no `@theme`) · Q-27 (paleta pré-Industry, começando por `ConsumptionChart`/`ConsumptionTable`).

**Fase 16 (worker IoT) — já planejado**
Q-07 (dividir `ModbusTcpConnection.ts`) · Q-08 (`createConnection`) · Q-16 (non-null assertions) — os três são o mesmo alvo e caem juntos com o schema Zod por protocolo.

**Oportunista (quando o arquivo for tocado por outro motivo)**
Q-09, Q-10, Q-11, Q-12, Q-13, Q-14, Q-15, Q-17, Q-24, Q-37, Q-38.
