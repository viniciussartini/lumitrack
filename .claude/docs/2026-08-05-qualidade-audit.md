# Auditoria de Qualidade — 2026-08-05

## 1. Sumário executivo

O código do LumiTrack é, no geral, **de qualidade acima da média para um MVP solo**: a arquitetura de módulos do backend é consistente (`routes → controller → service → repository`), os serviços de domínio são de fato framework-free e testáveis, `any` é praticamente inexistente em código de produção, os comentários explicam o *porquê* (não o *o quê*), e a rastreabilidade decisão → ADR → roadmap → changelog é exemplar.

O problema principal **não é o código escrito — é a ausência das travas mecânicas que o `06-code-quality-standards.md` declara obrigatórias**. Quatro dos cinco itens da seção "Enforcement automatizado" não existem no repositório: não há regras de complexidade no ESLint, não há `dependency-cruiser`, não há `husky`/`lint-staged`, e não há gate de formatação no CI. O resultado é previsível: as violações que essas ferramentas pegariam mecanicamente **estão presentes e acumulando** (uma função de 188 linhas, um arquivo de 662 linhas com 7 classes, 31 repetições do mesmo bloco de validação, 143 valores arbitrários de Tailwind fora da escala de tokens).

Foi encontrado **1 bug funcional real** (`Rs485Connection` quebra frames por caractere em vez de por linha), num caminho que não tem nenhum teste — sintoma direto do achado de cobertura: dos 7 adaptadores de protocolo IoT, apenas 1 é testado.

Há também **drift de documentação viva relevante**: `10-design-system.md` descreve como "divergência conhecida" exatamente os 3 arquivos que a Fase 6 já corrigiu, e **não menciona os ~16 arquivos que de fato ainda usam tokens pré-Industry**. Um agente que ler o `10` hoje conclui que a migração está mais completa do que está.

**Contagem:** 0 críticos · 4 altos · 17 médios · 14 baixos.

---

## 2. Escopo e método

| Item | Detalhe |
|---|---|
| Pacotes auditados | `backend/`, `frontend/`, `iot-simulator/server`, `iot-simulator/ui` |
| Arquivos de produção | ~153 (backend, excluindo `src/generated/prisma`) · ~175 (frontend) · ~28 (iot-simulator) |
| Referências normativas | `06-code-quality-standards.md`, `03-arquitetura.md`, `10-design-system.md`, `04-tech-stack.md`, `07-decisoes-em-aberto.md` |
| Método | Leitura estática (Read/Grep/Glob). Sem execução de lint, build, testes ou coverage — os achados de cobertura são por **presença/ausência de arquivo de teste e de caminho exercitado**, não por percentual. |
| Excluído | `**/node_modules/**`, `backend/src/generated/prisma/**` (código gerado), `.claude/design/**/*.dc.html` (protótipos, não código de produção) |

**Escala de severidade:** Crítico (quebra em produção / perda de dado) · Alto (bug real ou trava de qualidade ausente que deixa passar classes inteiras de defeito) · Médio (dívida que já custa manutenção ou induz erro) · Baixo (polimento, consistência).

---

## 3. Resumo dos achados

| # | Tipo | Sev. | Local |
|---|---|---|---|
| Q-01 | Bug de lógica | Alto | `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:626` |
| Q-02 | Enforcement ausente | Alto | 4× `eslint.config.js`; ausência de `.dependency-cruiser.*`, `.husky/` |
| Q-03 | CI / gates | Alto | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| Q-04 | Tipagem insegura | Alto | `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:62-250` |
| Q-05 | Complexidade | Médio | `IoTConnectionManager.ts:62-250` |
| Q-06 | SRP / nomeação | Médio | `ModbusTcpConnection.ts` (662 linhas, 7 classes) |
| Q-07 | DRY | Médio | 31 ocorrências em 13 `*.service.ts` |
| Q-08 | Drift de design system | Médio | `#3f8f52` em 8 arquivos |
| Q-09 | Drift de design system | Médio | `style={{ animation: "lt-pulse …" }}` em 10 arquivos |
| Q-10 | Drift de design system | Médio | tokens pré-Industry em ~16 arquivos de produção |
| Q-11 | Drift de design system | Médio | 143 valores arbitrários de Tailwind em 35 arquivos |
| Q-12 | Código morto | Médio | `frontend/src/components/layout/UserMenu.tsx:86-119` |
| Q-13 | DRY / abstração ignorada | Médio | `LiveKpiCard` duplicado em 3 páginas |
| Q-14 | DRY / abstração ignorada | Médio | `Blueprint` ignorado em 30 pontos |
| Q-15 | Type-safety latente | Médio | `frontend/src/lib/queryClient.ts:111-129` + 4 call sites |
| Q-16 | Cobertura de teste | Médio | superfície de Alertas do frontend (RF14–RF16) |
| Q-17 | Cobertura de teste | Médio | SSE client, CSRF, CRUD de Medidor (frontend) |
| Q-18 | Cobertura de teste | Médio | 6 de 7 adaptadores de protocolo IoT |
| Q-19 | Config TypeScript | Médio | `frontend/tsconfig.app.json`, `backend/tsconfig.json` |
| Q-20 | Config ESLint | Médio | ausência de `recommendedTypeChecked` |
| Q-21 | Doc drift | Médio | `10-design-system.md:30,43` |
| Q-22 | Doc drift | Médio | `03-arquitetura.md:77-81` |
| Q-23 | Doc drift | Médio | `04-tech-stack.md:5` |
| Q-24 | Dependência morta | Médio | `backend/package.json:50` (`profibus`) |
| Q-25..Q-38 | diversos | Baixo | ver §7 |

---

## 4. Achados de severidade **ALTA**

### Q-01 · Bug de lógica — `Rs485Connection` quebra frames por caractere
**Tipo:** bug funcional · **Severidade:** Alto
**Arquivo:** `/home/viniciussartini/Development/lumitrack/backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:626`

```ts
// Rs485Connection.connect(), linha 626
const lines  = this.buffer.split("")
```

O `Rs232Connection`, que o próprio comentário de `Rs485Connection` diz replicar ("O mesmo padrao de buffer de linhas que o Rs232Connection", `:623`), usa corretamente `this.buffer.split("\n")` em `:525`. Com `split("")` o buffer é fatiado **caractere a caractere**: cada caractere vira uma "linha", falha no `JSON.parse` e cai no `catch`, disparando `dataHandler({ raw: "<1 caractere>", … })` uma vez por byte. Nenhuma leitura RS-485 jamais é decodificada corretamente, e o `IoTDataProcessor` descarta todas como payload inválido.

Evidência corroborante de que houve perda de caracteres na edição original: o comentário do RS-232 em `:522` está truncado — `"processamos linhas completas ()."` — onde claramente havia um `\n` entre os parênteses.

**Recomendação:** corrigir para `split("\n")`. Seguir o procedimento da skill `correcao-bugs`: escrever primeiro um teste que alimente o handler `"data"` com dois chunks parciais formando uma linha JSON e afirme **uma** chamada de `dataHandler` com o objeto parseado. Extrair o parser de linhas para uma função pura compartilhada entre RS-232 e RS-485 (ver Q-06) — a duplicação foi a causa raiz.

---

### Q-02 · Enforcement automatizado — 4 dos 5 itens obrigatórios do `06` não existem
**Tipo:** processo / qualidade enforçada por ferramenta · **Severidade:** Alto
**Arquivos:** `backend/eslint.config.js:14-22`, `frontend/eslint.config.js:20-26`, `iot-simulator/server/eslint.config.js:14-19`, `iot-simulator/ui/eslint.config.js:20-23`; ausência de `.dependency-cruiser.*` e `.husky/` no repositório.

O `06-code-quality-standards.md:40-46` declara o princípio-guia — *"qualidade é enforçada por ferramenta, não por disciplina manual. Toda regra que puder virar lint, type-check ou gate de CI **deve** virar"* — e lista cinco travas. Estado real:

| Trava exigida (`06:42-46`) | Estado |
|---|---|
| TS strict + `noImplicitAny` + `noUncheckedIndexedAccess` + `noImplicitReturns` | **Parcial** — ver Q-19 |
| ESLint `complexity`, `max-lines-per-function`, `max-depth` + Prettier | **Ausente** — nenhuma das 4 configs tem qualquer regra de complexidade; só `no-unused-vars` foi customizada. Prettier existe só no `frontend/` |
| `husky` + `lint-staged` no pre-commit | **Ausente** — nenhum `.husky/`, nenhum `lint-staged` em nenhum `package.json` |
| `dependency-cruiser` validando direção de dependência | **Ausente** — nenhum arquivo de config em todo o repositório |
| CI falha em type-check, lint, **format** e testes | **Parcial** — sem gate de format; `iot-simulator/` fora (Q-03) |

Isto explica mecanicamente Q-05, Q-06, Q-11 e boa parte de Q-13/Q-14: são exatamente as classes de violação que essas quatro ferramentas pegariam sem intervenção humana. A direção de dependência hoje está correta (verificado manualmente em §8), mas **não há nada impedindo a primeira regressão** — nada quebra se um `*.service.ts` importar `express` amanhã.

**Recomendação (ordem de custo/benefício):**
1. Adicionar ao ESLint dos 4 pacotes: `complexity: ["error", 12]`, `max-depth: ["error", 4]`, `max-lines-per-function: ["error", {max: 60, skipBlankLines: true, skipComments: true}]`. Rodar com `--fix` desligado, catalogar as violações existentes e endereçá-las (Q-05, Q-06) em vez de silenciá-las com `eslint-disable`.
2. `dependency-cruiser` com uma regra só, a que o `03` mais valoriza: proibir `^backend/src/modules/.*\.(service|repository)\.ts$` → `^(express|helmet|cors|cookie-parser)$`. Uma regra que se paga é melhor que dez especulativas (YAGNI).
3. `husky` + `lint-staged` rodando `eslint --fix` e `prettier --write` nos arquivos staged.
4. Prettier no `backend/` e nos dois pacotes do `iot-simulator/` + job `format:check` no CI.

---

### Q-03 · CI e Dependabot ignoram o pacote `iot-simulator/` inteiro
**Tipo:** gate de CI · **Severidade:** Alto
**Arquivos:** `/home/viniciussartini/Development/lumitrack/.github/workflows/ci.yml` (jobs: `frontend-*`, `backend-*`, `e2e`) · `/home/viniciussartini/Development/lumitrack/.github/dependabot.yml:4,24,37`

O `03-arquitetura.md:35-39` estabelece `iot-simulator/` como um dos três pacotes independentes do monorepo, "cada um com seu próprio `package.json`, lint e testes". Ele tem de fato **14 arquivos de teste** (`broker.test.ts`, `simulationEngine.test.ts`, `signalGenerator.test.ts`, `deviceRunner.test.ts`, `store.test.ts`, as 3 suítes de rotas, `useNetworks.test.tsx`, `useLiveStatus.test.ts`, …). Nenhum deles roda em CI.

Consequências concretas:
- Um PR pode quebrar o simulador e o CI passa verde.
- Sem `npm audit --audit-level=high` — o único pacote do monorepo sem gate de vulnerabilidade, apesar de subir um **broker MQTT** (`aedes`) e um servidor Express.
- Sem Dependabot — as dependências divergem em silêncio (já divergem: `@types/node` está em `^25.3.0` no server e `^26.1.1` na ui, contra `^26.1.x` nos outros pacotes).

**Recomendação:** replicar os jobs `lint`/`build`/`test`/`audit` para `iot-simulator/server` e `iot-simulator/ui` (a raiz é workspace npm — `npm ci && npm run lint -w server -w ui` cobre os dois), e acrescentar as duas entradas correspondentes ao `dependabot.yml`.

---

### Q-04 · 22 non-null assertions sobre dados vindos do banco no caminho de conexão IoT
**Tipo:** tipagem insegura / falha aberta · **Severidade:** Alto
**Arquivo:** `/home/viniciussartini/Development/lumitrack/backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:62-250` (`config.host!` em `:72,:93,:138,:181`; `config.port!` em `:73,:94`; `config.address!` em `:95,:114,:162,:215,:234`; entre outras)

`MeterConnectionConfig` (`:44-52`) tipa `host`, `port`, `topic` e `address` corretamente como anuláveis — é o que o Prisma devolve. `createConnection` então **anula essa informação com `!`** em cada branch. O TypeScript para de reclamar, mas em runtime um `Meter` MQTT gravado sem `topic` (ou um MODBUS_TCP sem `host`) produz `undefined` dentro do adaptador, que tentará conectar em `undefined:undefined`.

Isto contraria dois princípios do kit ao mesmo tempo: **falhar fechado** (`06:21`) e **"parse, don't validate" / estados inválidos irrepresentáveis** (`06:67`). O `!` aqui é precisamente a válvula de escape que o `strict` existe para fechar.

Agravante: o `server.ts:156-167` monta esses configs a partir de `prisma.meter.findMany()` sem qualquer validação, e `IoTConnectionManager.start()` (`:279-285`) engole a falha com `log.error` — o medidor simplesmente nunca conecta, sem sinal claro de *por quê*.

**Recomendação:** um schema Zod por protocolo (`mqttConnectionSchema`, `modbusTcpConnectionSchema`, …), com `createConnection` fazendo `schema.parse(config)` e lançando um erro nomeado (`InvalidMeterConfigError`) que o `start()` loga com o campo faltante. Isto elimina os 22 `!` **e** os ~120 linhas de boilerplate `if (x !== undefined)` do Q-05 de uma vez: o `.parse()` já devolve um objeto sem chaves `undefined`.

---

## 5. Achados de severidade **MÉDIA**

### Q-05 · `createConnection()` — 188 linhas, 8 branches, boilerplate repetido 8×
**Tipo:** complexidade / DRY · **Arquivo:** `IoTConnectionManager.ts:62-250`

Função única com um `switch` de 8 casos; cada caso repete o mesmo padrão de 6–20 linhas (`const x = extraField<number>(extra, "x"); if (x !== undefined) { cfg.x = x }`). Excede qualquer `max-lines-per-function` razoável em ~3×.

**Recomendação:** resolvido por Q-04 (Zod por protocolo). Alternativa mínima se Q-04 for adiado: um helper `assignDefined(target, source)` reduz cada branch a ~5 linhas.

---

### Q-06 · `ModbusTcpConnection.ts` — 662 linhas, 7 classes de protocolos distintos
**Tipo:** SRP / nomeação · **Arquivo:** `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts`

O arquivo contém `ModbusTcpConnection`, `ModbusRtuConnection`, `EthernetIpConnection`, `ProfibusConnection`, `ProfinetConnection`, `Rs232Connection` e `Rs485Connection`. Seis razões para mudar, num arquivo nomeado por uma delas. O sintoma mais claro do problema: o stub de PROFIBUS (`:348-350`) instrui o desenvolvedor a "consultar a documentação em `.../ModbusTcpConnection.ts`" — o arquivo aponta para si mesmo como referência de outro protocolo.

O nome errado também produz um teste com nome errado: `ModbusTcpConnection.test.ts` testa exclusivamente `EthernetIpConnection`, e **nada de Modbus TCP**.

**Recomendação:** um arquivo por adaptador (`MqttConnection.ts` já é assim), com um `protocols/index.ts` reexportando. Extrair o parser de linhas serial compartilhado (RS-232/RS-485) para `protocols/serialLineParser.ts` — isso fecha Q-01 estruturalmente. Renomear o teste conforme o adaptador que ele cobre.

---

### Q-07 · Bloco de validação Zod duplicado 31 vezes em 13 services
**Tipo:** DRY · **Arquivos:** `backend/src/modules/**/*.service.ts` — 6× em `auth.service.ts` (`:66-73, :104-111, :153-160, :183-190, :213-220, :251-258`), 4× em `meter.service.ts` e `alert.service.ts`, 3× em `device/area/property.service.ts`, 1× em cada um dos demais.

Sempre idêntico:
```ts
const parsed = xSchema.safeParse(input)
if (!parsed.success) {
    const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
    throw new ValidationError(firstError ?? "Dados inválidos")
}
```
Não é "coincidência que se parece" (a ressalva do `06:25`): é literalmente a mesma decisão de política de erro, repetida. Se a mensagem padrão ou a estratégia de agregação de erro mudar, são 31 pontos de edição.

**Recomendação:** `shared/validation/parseOrThrow.ts` exportando `parseOrThrow<T>(schema: ZodType<T>, input: unknown): T`. Cada service passa de 6 linhas para 1: `const data = parseOrThrow(loginSchema, input)`. Ganho de tipo colateral: o retorno já vem narrowed, dispensando o `parsed.data` posterior.

---

### Q-08 · Verde `#3f8f52` hardcodado em 8 arquivos — não é token e diverge do bundle
**Tipo:** drift de design system · **Severidade:** Médio
**Arquivos:** `pages/landing/LandingPage.tsx:168,170` · `pages/auth/LoginPage.tsx:116` · `pages/property/PropertyDetailsPage.tsx:126` · `pages/area/AreaDetailsPage.tsx:148` · `pages/device/DeviceDetailsPage.tsx:132` · `components/meter/MeterSection.tsx:164,166` · `components/dashboard/RealtimeSection.tsx:111,113` · `components/dashboard/LiveKpiCard.tsx:27`

O `README.md` do bundle vigente (`.claude/design/2026-07-31-lumitrack-completo/README.md:47-48`) especifica o verde semântico como **`#2f6f3f`**, e `frontend/src/styles/industry.css:317` o formalizou como `--color-status-success`. O código usa em 8 lugares um **segundo verde, `#3f8f52`**, que não existe em nenhum token.

O próprio codebase reconhece o problema e depois o contorna: o comentário de `industry.css:309-315` explica que as cores semânticas foram formalizadas como tokens "porque `10-design-system.md` proíbe hardcode de cor fora da escala" — e `LandingPage.tsx:334` documenta explicitamente a escolha de driblar ("o handoff usa 2 tons próximos (ex.: `#3f8f52` na faixa e `#2f6f3f` …)"). O `10-design-system.md:48` responde a exatamente esse caso: *"Se o design pede um valor que não existe na escala, isso é uma decisão de token — atualizar o tema (e refletir no Claude Design via `/design-sync`), não driblar inline."*

**Recomendação:** promover a `--color-status-live` (ou `--color-status-success-bright`) em `industry.css`, mapear no `@theme inline` do `index.css`, trocar os 8 usos por `bg-status-live`/`text-status-live`, registrar a mudança de token no changelog e sincronizar de volta via `/design-sync`.

---

### Q-09 · Animação inline `lt-pulse` repetida em 10 arquivos
**Tipo:** drift de design system / DRY · **Arquivos:** `LandingPage.tsx`, `LoginPage.tsx`, `PropertyDetailsPage.tsx:127`, `AreaDetailsPage.tsx:149`, `DeviceDetailsPage.tsx`, `AlertsPage.tsx`, `MeterSection.tsx`, `RealtimeSection.tsx`, `LiveKpiCard.tsx:28`, `layout/Header.tsx`

```tsx
style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
```
O keyframe `lt-pulse` está corretamente em `industry.css:396-399`, mas a *declaração de uso* (duração, easing, iteração) é um estilo inline replicado 10×. Além de duplicação, é tipografia/movimento fora do vocabulário de classes do bundle.

**Recomendação:** adicionar `.lt-live-dot` na seção de adaptações do projeto de `industry.css` (junto de `.lt-navitem`, `.lt-selbtn`, etc., que já seguem esse padrão), encapsulando tamanho, `border-radius`, cor (Q-08) e animação. Os 10 usos viram `<span className="lt-live-dot" aria-hidden="true" />`.

---

### Q-10 · Tokens pré-Industry residuais em ~16 arquivos de produção
**Tipo:** drift de design system · **Severidade:** Médio

Arquivos com `slate-*` / `brand-*` fora de comentário (contagem de ocorrências):

| Arquivo | Ocorr. | Situação |
|---|---|---|
| `components/consumption/ConsumptionChart.tsx` | 14 | tela migrada (Fase 2) |
| `components/consumption/ConsumptionTable.tsx` | 10 | tela migrada (Fase 2) |
| `components/alert/AlertRowMenu.tsx` | 9 | tela migrada (Fase 3) |
| `components/area/AreaForm.tsx` | 8 | tela migrada (Fase 2) |
| `components/device/DeviceMenu.tsx` | 6 | tela migrada (Fase 2) |
| `components/area/AreaMenu.tsx` | 6 | tela migrada (Fase 2) |
| `components/property/PropertyMenu.tsx` | 5 | tela migrada (Fase 2) |
| `pages/report/ReportsPage.tsx` | 5 | **sem handoff — aceito** |
| `components/layout/UserMenu.tsx` | 4 | ramo morto, ver Q-12 |
| `components/PlaceHolderPage.tsx` | 4 | **sem handoff — aceito** |
| `components/property/PropertyForm.tsx` | 3 | tela migrada (Fase 2) |
| `components/property/PropertyForm.tsx`, `MeterForm.tsx`, `DeviceForm.tsx` | 1 cada | rodapé de form, tela migrada |
| `routes/ProtectedRoute.tsx:28`, `routes/PublicRoute.tsx:10` | 1 cada | **estado de carregamento visto em todo boot do app** |

Os dois últimos são os mais visíveis: `text-slate-500 dark:text-slate-400` é o texto de "carregando" que aparece antes de qualquer tela renderizar.

Somam-se os tokens legados ainda declarados em `frontend/src/index.css:27-35` (`--color-brand-*`, `--color-energy`, `--color-alert`, `--color-success`), cuja própria nota diz "Remover tela a tela conforme cada fase migra seus consumidores; nenhum uso novo deve ser adicionado a partir daqui".

**Recomendação:** um passe de limpeza dedicado (não misturado a outra feature) trocando por `text-muted` / `border-divider` / `bg-surface` / `text-accent`; depois remover o bloco `@theme` legado do `index.css` e adicionar um lint (`no-restricted-syntax` sobre `className` contendo `slate-|brand-`) para tornar a regressão impossível. Manter `ReportsPage` e `PlaceHolderPage` fora do escopo enquanto não houver handoff, com a exceção documentada.

---

### Q-11 · 143 valores arbitrários de Tailwind fora da escala de tokens, em 35 arquivos
**Tipo:** drift de design system · **Severidade:** Médio

`10-design-system.md:48` proíbe explicitamente o padrão, inclusive com o exemplo `mt-[13px]`. Amostra do que existe hoje:

- `frontend/src/components/auth/RecoverySteps.tsx:32` — `gap-[13px]` (o exemplo literal do documento)
- `frontend/src/pages/profile/ProfilePage.tsx` — 17 ocorrências (`p-[26px]`, `py-[18px]`, `text-[10px]`, `text-[17px]`, `text-[28px]`, `h-[15px]`…)
- `frontend/src/pages/landing/LandingPage.tsx` — 24 ocorrências
- `frontend/src/pages/property/PropertyDetailsPage.tsx` — 13 · `AreaDetailsPage.tsx` — 8 · `MeterSection.tsx` — 8

A causa não é descuido isolado: **o tema Tailwind mapeia cores, fontes, raio e sombra do Industry, mas não a escala tipográfica nem os passos de espaçamento nomeados do protótipo.** O `index.css:88` faz `--spacing: var(--space-1)` (3.4px), e valores do protótipo como 9px, 18px e 26px não caem nessa grade — logo, cada tela recorre ao colchete.

**Recomendação:** é uma **decisão de token**, não de implementação (§Tokens do `10`). Mapear no `@theme inline` os degraus que o protótipo de fato usa — p.ex. `--text-kicker: 11px`, `--text-card-title: 17px`, `--text-kpi: 30px`, `--spacing-card: 26px`, `--spacing-block: 18px` — e substituir os usos. Depois adicionar lint proibindo `\[[0-9.]+(px|rem)\]` em `className`. Sem o mapeamento primeiro, o lint só geraria `eslint-disable`.

---

### Q-12 · Código morto — variante `header` do `UserMenu` sem consumidor de produção
**Tipo:** código morto · **Arquivo:** `/home/viniciussartini/Development/lumitrack/frontend/src/components/layout/UserMenu.tsx:22, 86-119`

`variant` tem default `"header"` (`:22`), mas o **único** call site de produção é `components/layout/Sidebar.tsx:100`, que passa `variant="sidebar"`. A Fase 6 (#135/#136) moveu o menu para o rodapé da sidebar e o `Header.test.tsx:100` chega a asseverar que o Header *não* renderiza mais o `UserMenu`. O ramo `:86-119` — que concentra 4 das ocorrências de token pré-Industry do Q-10 — é inalcançável.

Agravante de teste: `UserMenu.test.tsx:57` renderiza `<UserMenu />` sem prop, ou seja, **a suíte de testes valida exclusivamente o ramo morto** e não cobre a variante que roda em produção.

**Recomendação:** remover a prop `variant` e o ramo `header`; ajustar `UserMenu.test.tsx` para renderizar a variante real. Corrigir também o comentário obsoleto em `routes/AppRouter.tsx:85` ("acessível via UserMenu no Header").

---

### Q-13 · `LiveKpiCard` existe, mas o card "Potência agora" é copiado literal em 3 páginas
**Tipo:** DRY / abstração ignorada · **Severidade:** Médio
**Arquivos:** `pages/property/PropertyDetailsPage.tsx:119-140` · `pages/area/AreaDetailsPage.tsx:141-162` · `pages/device/DeviceDetailsPage.tsx:125-141` — versus `components/dashboard/LiveKpiCard.tsx:18-41`

`LiveKpiCard` foi criado exatamente para esse markup (o comentário `:13-17` diz: "Promovido de dentro de `RealtimeSection.tsx` (#116) para ser reaproveitado também por `DashboardKpiRow` (#117)"). As três páginas de detalhe replicam o bloco inteiro byte a byte — mesmos `corner`, mesmo `#3f8f52`, mesma animação inline, mesmo `text-[30px] font-features-['tnum'_1]`.

O projeto tem um critério de promoção explícito e bom ("cria-se o primitivo quando um segundo consumidor real pedir a mesma API" — roadmap, Fase 1). Aqui o primitivo **já foi criado** e os consumidores 3º, 4º e 5º não o adotaram. Consequência prática: qualquer correção do Q-08/Q-09 precisa ser aplicada 4 vezes.

**Recomendação:** trocar os três blocos por `<LiveKpiCard label="Potência agora" isLive value={…} />`. `LiveKpiCard` já aceita `subValue` opcional, cobrindo as variações.

---

### Q-14 · `Blueprint` ignorado — as 4 marcas de canto escritas à mão em 30 pontos
**Tipo:** DRY · **Arquivos:** `components/ui/Blueprint.tsx:13-21` (o componente) versus 30 ocorrências de `<i className="corner tl" />…` em 20 arquivos (4× em `ProfilePage`, `PropertyDetailsPage`, `AreaDetailsPage`; 2× em `DeviceDetailsPage`; 1× em 16 outros, **incluindo o próprio `LiveKpiCard.tsx:20-23`**).

O componente `Blueprint` só é consumido por 6 arquivos. `PropertyCard.tsx` usa os dois estilos no mesmo arquivo.

**Recomendação:** decidir **uma** forma e aplicá-la. Recomendo o componente (é a que impede esquecer um canto), incluindo dentro de `LiveKpiCard`. Se a decisão for abandonar `Blueprint`, removê-lo — manter uma abstração com 6 consumidores contra 30 usos manuais é o pior dos dois mundos.

---

### Q-15 · `queryKey` de consumo compartilhada por retornos incompatíveis
**Tipo:** type-safety latente / fragilidade de design · **Severidade:** Médio
**Arquivos:** `frontend/src/lib/queryClient.ts:111-129` · `hooks/queries/useConsumption.ts:23-29` · `pages/property/PropertyDetailsPage.tsx:313` · `pages/area/AreaDetailsPage.tsx:321` · `components/dashboard/PropertyComparisonSection.tsx:40`

Quatro call sites constroem a mesma chave `queryKeys.consumption.list(targetType, targetId, granularity, page, pageSize)` com **dois `queryFn` de tipos de retorno incompatíveis**: `useConsumption` devolve o envelope paginado `ConsumptionListResponse`, os outros três devolvem `ConsumptionBucket | null`. O cache do TanStack Query é indexado só pela chave — ele serve o que estiver lá, do formato que for.

A colisão hoje é evitada por um **valor mágico**: os três call sites de "último bucket" usam `pageSize: 3`, escolhido não por necessidade de paginação mas para não bater com o `pageSize: 1` do `DashboardKpiRow`. O código documenta o truque em `PropertyComparisonSection.tsx:30-37` ("*pageSize maior só evita a colisão*"), e o `roadmap.md` (fechamento da Fase 4) registra que isso **já causou um bug real em produção** — a página quebrava porque o cache servia o formato errado.

O tipo não pode ajudar: `queryKey` é `readonly unknown[]`, sem relação com o tipo de `data`. A próxima pessoa que passar `pageSize: 3` por qualquer outro motivo reabre o bug.

**Recomendação:** dar às consultas de "último bucket" um **namespace próprio** — `queryKeys.consumption.latestBucket(targetType, targetId, granularity)` — de modo que a chave codifique o formato da resposta. Colisão passa a ser impossível por construção e o `pageSize: 3` mágico some. Aproveitar para extrair os três blocos `useQueries` quase idênticos em um `useLatestMonthlyBucket(targetType, ids)`.

---

### Q-16 · Superfície de Alertas do frontend (RF14–RF16) sem nenhum teste
**Tipo:** cobertura de caminho de negócio · **Severidade:** Médio

Sem arquivo de teste correspondente: `pages/alert/AlertsPage.tsx` (282 linhas) · `components/alert/AlertRowMenu.tsx` (187) · `components/alert/AlertForm.tsx` (164) · `components/alert/AlertTable.tsx` (94) · `components/alert/AlertFormDialog.tsx` (89) · `components/alert/AlertEventTable.tsx` (81) · `components/alert/AlertStatusBadge.tsx` (40) · `hooks/queries/useAlertMutations.ts` (83).

O contraste com os módulos irmãos é o que torna isso um sinal e não uma opinião: Área, Dispositivo e Propriedade têm todos `*Card.test.tsx`, `*Menu.test.tsx`, `*Form.test.tsx`, `*FormDialog.test.tsx` e `use*Mutations.test.tsx`. Alertas — que cobrem RF14/RF15/RF16 e são o **único mecanismo do produto que avisa o usuário sobre consumo anômalo** — não têm nenhum. Só `services/alert.service.test.ts` e `hooks/queries/useAlerts.test.tsx` (leitura) existem.

O `06:56` pede exatamente esta leitura: *"Cobertura como sinal, não meta cega — priorizar caminhos de negócio e segurança."*

**Recomendação:** replicar o padrão já consolidado de `AreaForm.test.tsx` / `AreaMenu.test.tsx` / `useAreaMutations.test.tsx` para o módulo de alertas. Prioridade nos dois de maior risco: `AlertForm` (validação de `referencePowerKw`/`tolerancePercent`, ver Q-33) e `useAlertMutations` (invalidação de cache após toggle/delete).

---

### Q-17 · SSE client, CSRF e CRUD de Medidor sem teste no frontend
**Tipo:** cobertura de caminho de segurança/infra · **Severidade:** Médio
**Arquivos sem teste:** `lib/sse/appStream.ts` (163) · `contexts/RealtimeContext.tsx` (136) · `lib/csrf.ts` (18) · `lib/queryClient.ts` (157) · `components/meter/MeterSection.tsx` (227) · `components/meter/MeterForm.tsx` (155) · `components/meter/MeterFormDialog.tsx` (94) · `hooks/queries/useMeterMutations.ts` (55)

`appStream.ts` concentra decisões não triviais: distinção entre erro fatal e retentável (`FatalStreamError`, `:66-71`), validação de `content-type` na abertura (`:114-127`), despacho por nome de evento (`:129-147`) e `openWhenHidden`. `RealtimeContext` gerencia o ciclo de vida da conexão em função da sessão, com um `eslint-disable react-hooks/exhaustive-deps` (`:126`) que só é seguro por inspeção. Nenhum dos dois tem teste, apesar de o backend ter `iot-stream.routes.test.ts` e `user-event-hub.test.ts`.

**Recomendação:** teste unitário de `appStream` com `fetchEventSource` mockado, cobrindo (a) 401 na abertura → fatal, sem retry; (b) `content-type` errado → fatal; (c) evento desconhecido → ignorado sem erro; (d) `data` malformado → `onError`, sem derrubar o stream. Para `RealtimeContext`, um teste de logout → cleanup chamado e `isConnected` volta a `false`.

---

### Q-18 · 6 dos 7 adaptadores de protocolo IoT sem teste
**Tipo:** cobertura · **Severidade:** Médio
**Arquivo:** `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.test.ts` (43 linhas, 2 casos, cobre só `EthernetIpConnection`)

Sem cobertura: `ModbusTcpConnection`, `ModbusRtuConnection`, `ProfinetConnection`, `Rs232Connection`, `Rs485Connection`, `ProfibusConnection`, mais a fábrica `createConnection` do `IoTConnectionManager` inteira. Foi exatamente nessa lacuna que o Q-01 se escondeu.

Reconhecimento merecido: o teste que existe é **excelente** — o comentário `:4-9` explica que ele bate contra o pacote real justamente porque um mock de módulo nunca pegaria a incompatibilidade de API que passou verde no PR #51. É o raciocínio certo; falta escalá-lo.

**Recomendação:** o parser de linhas serial (após a extração do Q-06) é uma função pura — teste barato e de alto valor, cobre RS-232 e RS-485 juntos. Para `createConnection`, um teste tabular protocolo→classe esperada mais um caso de config incompleta (que hoje passa silenciosamente por causa do Q-04).

---

### Q-19 · Flags de `tsconfig` exigidas pelo `06` faltando
**Tipo:** config de tipagem · **Severidade:** Médio
**Arquivos:** `frontend/tsconfig.app.json:16-19` · `backend/tsconfig.json:20-25` · `iot-simulator/ui/tsconfig.app.json`

`06:42` exige `strict`, `noImplicitAny`, `noUncheckedIndexedAccess` e `noImplicitReturns`. Estado:

| Flag | backend | frontend | iot-sim/server | iot-sim/ui |
|---|---|---|---|---|
| `strict` | ✅ | ✅ | ✅ | ✅ |
| `noUncheckedIndexedAccess` | ✅ | **❌** | ✅ | **❌** |
| `noImplicitReturns` | **❌** | **❌** | **❌** | **❌** |

`noUncheckedIndexedAccess` ausente no frontend é o mais custoso: acessos a arrays como `res.items[0]` (`PropertyComparisonSection.tsx:50`) e a índices de `readingsByMeterId` são tipados como não-nulos quando podem ser `undefined`.

**Recomendação:** ligar `noImplicitReturns` nos quatro (custo praticamente zero) e `noUncheckedIndexedAccess` no frontend numa branch dedicada — vai gerar erros reais, e cada um deles é um bug latente de `undefined` em runtime.

---

### Q-20 · ESLint sem `recommendedTypeChecked` num codebase intensamente assíncrono
**Tipo:** config de lint · **Severidade:** Médio · **Arquivos:** as 4 `eslint.config.js`

Todos usam `tseslint.configs.recommended` (sem type info). Isso desliga, entre outras, `@typescript-eslint/no-floating-promises` e `no-misused-promises` — as duas regras mais valiosas para este projeto especificamente: handlers Express assíncronos, listeners de worker (`processor.addSampleListener`, `server.ts:80-82`), schedulers e o padrão `void alertEvaluator.evaluate(...)` que hoje depende de disciplina manual.

**Recomendação:** migrar para `tseslint.configs.recommendedTypeChecked` com `parserOptions.projectService: true`. Se o custo de CI incomodar, ativar apenas as duas regras acima com `languageOptions.parserOptions.project` — já entrega a maior parte do valor.

---

### Q-21 · Doc drift — `10-design-system.md` descreve como pendente o que já foi feito, e omite o que falta
**Tipo:** drift de documentação viva · **Severidade:** Médio
**Arquivo:** `/home/viniciussartini/Development/lumitrack/.claude/project_context/10-design-system.md:30, 43`

Linha 30 (tabela de bundle vigente): *"Chrome do app logado (sidebar, topbar) … `components/layout/` — **ainda não migrado**, ver aviso abaixo"*.
Linha 43: *"**Divergência conhecida que resta:** `components/layout/Sidebar.tsx` e `Header.tsx` (mais o `bg-slate-50` de `AppShell.tsx`) ainda usam os tokens pré-Industry … Endereçado na **Fase 6** (issues #135 e #136)."*

A Fase 6 foi **concluída em 2026-08-04** (`roadmap.md:17` e o fechamento em `:250-256`, que declara textualmente "nenhum token pré-Industry restante em `Sidebar.tsx`/`Header.tsx`/`AppShell.tsx`"). Verificado no código: procede — os únicos matches de `slate-` em `Sidebar.tsx` são `translate-x`, e `AppShell.tsx` não tem mais `bg-slate-50`.

O impacto é duplo e ambos os lados enganam quem lê:
1. O documento aponta como divergência três arquivos **já corrigidos**.
2. Não menciona os ~16 arquivos que **de fato** ainda divergem (Q-10) — nem `#3f8f52` (Q-08), nem os 143 valores arbitrários (Q-11).

Um agente que consultar o `10` antes de trabalhar em UI vai evitar tocar em `Sidebar.tsx` (desnecessário) e vai reproduzir sem hesitação os tokens de `ConsumptionChart.tsx` (que deveria evitar).

**Recomendação:** atualizar a linha 30 para "migrado (Fase 6)"; substituir o bloco de "divergência conhecida" pela lista real do Q-10, marcando `ReportsPage`/`PlaceHolderPage` como exceções aceitas por ausência de handoff. Acrescentar Q-08/Q-09/Q-11 como divergências de token abertas.

---

### Q-22 · Doc drift — `03-arquitetura.md` lista 4 das 7 ADRs
**Tipo:** drift de documentação viva · **Severidade:** Médio
**Arquivo:** `/home/viniciussartini/Development/lumitrack/.claude/project_context/03-arquitetura.md:75-81`

A seção "ADRs já tomadas" para em `0004`. Existem em `.claude/docs/adr/`: `0005-industry-como-design-system.md`, `0006-migracao-incremental-por-fase.md` e `0007-bandeira-tarifaria-fonte-oficial-aneel.md`. A ADR-0007 é particularmente relevante para o `03`, porque introduz uma **dependência externa (ANEEL) no caminho do cálculo de custo (RF13)** — exatamente o tipo de decisão que a seção "Considerações de System Design" do próprio `03` manda registrar.

**Recomendação:** completar a lista. Considerar gerá-la a partir do diretório para não repetir o drift.

---

### Q-23 · Doc drift — `04-tech-stack.md` desatualizado em relação ao `package.json`
**Tipo:** drift de documentação viva · **Severidade:** Médio
**Arquivo:** `/home/viniciussartini/Development/lumitrack/.claude/project_context/04-tech-stack.md:5`

O documento se autodeclara fonte fiel (`:3`: *"Reflete o que está de fato em `package.json` — não um plano"*). Ausentes da lista de frontend, presentes em `frontend/package.json`:

| Pacote | Uso real |
|---|---|
| `react-markdown` ^10.1.0 | `LegalDocumentPage.tsx`, `AboutPage.tsx:1` |
| `remark-gfm` ^4.0.1 | idem, `AboutPage.tsx:2` |
| `clsx` ^2.1.1 + `tailwind-merge` ^3.6.0 | `lib/cn.ts`, usado em quase todo componente |
| `prettier-plugin-tailwindcss` | ordenação de classes |

Renderização de markdown vindo de arquivo é uma decisão de stack com implicação de segurança (sanitização de HTML) que merece estar registrada. Também vale registrar que `frontend` está em `typescript ~6.0.2` enquanto `backend` está em `^5.9.3` (com `ignoreDeprecations: "5.0"` em `backend/tsconfig.json:3` comentando a versão instalada).

**Recomendação:** atualizar `04:5` e acrescentar uma nota sobre a divergência de versão de TypeScript entre pacotes.

---

### Q-24 · Dependência morta `profibus@0.0.0` declarada e documentada como usada
**Tipo:** código/dependência morta + doc drift · **Severidade:** Médio
**Arquivos:** `backend/package.json:50` · `04-tech-stack.md:12`

`profibus` não é importado em lugar nenhum do código (verificado por grep sobre `from "profibus"`, `import("profibus")` e `require("profibus")` em todo `**/src/**/*.ts`: zero ocorrências). O adaptador `ProfibusConnection` (`ModbusTcpConnection.ts:336-357`) é um stub que lança em `connect()`, e a própria documentação dele (`:313-316`) explica por quê: "não existe uma lib npm publica e estavel para comunicacao PROFIBUS a partir do Node.js".

Ainda assim o pacote está em `dependencies` (não `devDependencies`) na versão `0.0.0` — instalado em produção, na superfície de `npm audit` e do Dependabot, sem entregar nada. E `04:12` o lista como se estivesse em uso.

**Recomendação:** remover de `package.json`, corrigir `04:12` para registrar PROFIBUS como stub deliberado (o comentário do código já explica bem a razão — vale referenciá-lo).

---

## 6. Achados de severidade **BAIXA**

| # | Tipo | Arquivo:linha | Descrição e recomendação |
|---|---|---|---|
| Q-25 | DRY / abstração ignorada | `pages/area/AreaDetailsPage.tsx:116-118` | Recalcula "leitura obsoleta" inline com o número mágico `10_000`, enquanto `hooks/useLiveMeterReading.ts:7` já define `STALE_THRESHOLD_MS` e encapsula o mesmo cálculo (e `PropertyDetailsPage.tsx:71` o usa). Adotar o hook. |
| Q-26 | Estado inválido representável | `modules/alert/alert-evaluator.ts:121, 189` | `state.startedAt!` — `EpisodeState.startedAt` é `Date \| undefined`, garantido não-nulo apenas pelo flag `firing`. Um union discriminado (`{firing: false} \| {firing: true; startedAt: Date}`) elimina os dois `!` (`06:67`). |
| Q-27 | Non-null assertion | `modules/simulation/simulation.service.ts:241` | `const watts = effectivePowerWatts!` — o invariante ("`WATTS_HOURS` sempre resolve potência") é real, mas invisível ao compilador. Estreitar por `data.inputMode` ou fazer `resolveEffectivePowerWatts` retornar `number` na sobrecarga de `WATTS_HOURS`. |
| Q-28 | DRY | `modules/auth/auth.controller.ts:138-141` vs `:326-331` | `logout()` repete as 4 chamadas de `clearCookie` que `clearAllCookies()` já encapsula. Chamar o helper. |
| Q-29 | Clean code | `shared/tariff/tariff.service.ts:49-57` | `calculateCore` recebe 7 parâmetros posicionais de mesmo tipo (`number`), enquanto os métodos públicos irmãos usam objeto nomeado — troca acidental de argumentos é indetectável. Padronizar no objeto. |
| Q-30 | SRP / tamanho | `modules/consumption/consumption.service.ts:29-38, 67-174` | Construtor com 8 colaboradores; `list()` com ~107 linhas e 3 responsabilidades (autorização, resolução de tarifa, projeção anual). Extrair `resolveTariffContext()` e `computeYearlyPropertyCosts()`. |
| Q-31 | Inconsistência funcional | `protocols/ModbusTcpConnection.ts:192` vs `:68` | `ModbusRtuConnection` lê sempre o registrador `0` (`readHoldingRegisters(0, 1)`), ignorando `config.address` — o TCP faz `parseInt(this.config.address)`. `address` no RTU é a porta serial, mas o registrador então deveria vir de `extra`. Hoje é silenciosamente fixo. |
| Q-32 | Números mágicos | `protocols/ModbusTcpConnection.ts` (passim) | `?? 5000` (5×), `?? 9600` (3×), `?? 1` (2×), `?? 8`, `?? "none"`. Extrair para constantes nomeadas no topo do módulo (`DEFAULT_POLLING_INTERVAL_MS`, `DEFAULT_BAUD_RATE`, …) — `06:18`. |
| Q-33 | Divergência de contrato | `frontend/src/schemas/alert.schema.ts:29` vs `backend/src/modules/alert/alert.schema.ts:13` | Frontend valida `meterId: z.string().min(1)`, backend exige `z.uuid()`. Sem impacto de segurança (o servidor decide), mas é a materialização do risco que `04:19` já registra: os schemas espelhados divergem em silêncio. Um teste de contrato ou geração a partir de fonte única resolveria. |
| Q-34 | Nomeação | `frontend/src/components/PlaceHolderPage.tsx` | Nome do arquivo (`PlaceHolder`) não bate com o export (`PlaceholderPage`), obrigando o import a repetir o erro (`SimulationPage.tsx:2`). Renomear. |
| Q-35 | Documentação | `README.md:15` | Link `[**Mobile (Planejado)**](mobile/README.md)` aponta para arquivo inexistente. O item está corretamente aberto em `07:8`, mas o link quebrado é real — trocar por texto sem link até a decisão. |
| Q-36 | Teste de API privada | `modules/iot/iot-worker/IoTDataProcessor.test.ts:9` | Testa o método `private process()` via `as unknown as {process: …}`. Preferir exercitar pelo `manager.onData` (o caminho real) ou tornar `process` público se ele é de fato a superfície testável. |
| Q-37 | Crescimento não limitado | `modules/alert/alert-evaluator.ts:53` | `episodes: Map<alertId, EpisodeState>` só é podado em `invalidateMeter()` e apenas para episódios `firing`. Alertas desabilitados que nunca dispararam permanecem no mapa pela vida do processo. Volume pequeno hoje; podar também o caso não-firing custa uma linha. |
| Q-38 | YAGNI | `backend/tsconfig.json:33-34` | `experimentalDecorators` + `emitDecoratorMetadata` ligados com o comentário "(futuro uso com Prisma/IoT)". Zero decorators no código (verificado). É exatamente a abstração especulativa que `06:5` e `06:27` proíbem. Remover. |

---

## 7. Direção de dependência (DIP) — verificação manual

Como não há `dependency-cruiser` (Q-02), a verificação foi feita por inspeção de imports.

| Regra do `03`/`06` | Resultado |
|---|---|
| `*.service.ts` não importa `express` | ✅ **Zero** ocorrências de `from "express"` em qualquer service |
| `*.service.ts` não instancia `PrismaClient` | ✅ Zero — todos recebem repositories por construtor |
| Domínio não importa `@prisma/client` diretamente | ⚠️ **3 exceções**: `consumption.service.ts:13`, `alert.service.ts:8` e `meter.service.ts:2` importam o enum `TargetType` de `@/generated/prisma/client.js`. É um enum de linguagem ubíqua, não o client — impacto prático baixo, mas é uma seta apontando para fora. Se `TargetType` fosse declarado em `shared/` (ou num `domain/types.ts`) e o Prisma o consumisse, o domínio ficaria 100% livre. |
| `shared/middlewares` pode depender de Express | ✅ Legítimo (é infra de borda por definição) |
| Módulos não leem tabelas uns dos outros | ✅ Repositories só tocam seu próprio model; travessias de posse passam por `meter-target.ts` (`resolveMeterTarget`), que recebe os repositories dos outros módulos por injeção — o padrão certo |
| Ponto de composição único | ✅ `app.ts:46-157` (`createApp(deps)`) e `server.ts` fazem toda a montagem; nenhum `new PrismaClient()` disperso |

**Conclusão:** a direção de dependência está **substancialmente correta hoje** — o que torna o Q-02 mais barato de resolver, não menos importante: uma regra de `dependency-cruiser` adicionada agora entra verde e congela um estado bom.

---

## 8. Pontos fortes (o que não deve ser mexido)

Registrados porque uma auditoria que só lista defeitos induz refatoração destrutiva:

- **`any` praticamente inexistente.** Duas ocorrências em código de produção (`ConsumptionChart.tsx:45`, `RealtimePowerChart.tsx:43`), ambas em tipos de tooltip do recharts, com `eslint-disable` pontual e justificado. O backend tem **zero** fora do Prisma gerado. Excelente aderência ao `06:42`.
- **Comentários de altíssima qualidade.** Explicam o *porquê*, incluindo trade-offs rejeitados e bugs históricos: `auth.service.ts:432-437` (por que pular o loop de bcrypt em códigos de 6 dígitos), `index.css:8-15` (por que `layer()` é obrigatório no import do Industry), `IoTDataProcessor.ts:21-24` (por que o worker não lança). É o padrão que o `06:19` pede, executado melhor do que o típico.
- **Falha fechada consistente no domínio.** `AlertEvaluator.evaluate` (`:101-111`) isola erro por alerta; `IoTDataProcessor` (`:144-151`) isola erro por listener; `TariffFlagSyncScheduler` mantém o último valor conhecido quando a ANEEL falha; `server.ts:177-181` não derruba a API se a restauração IoT falhar.
- **`TariffService`** — domínio puro, sem I/O, com as regras de negócio brasileiras (piso de disponibilidade por sistema elétrico, tributos "por dentro", CIP fora da base) nomeadas e documentadas com a norma de origem (REN 1.000/2021). Constantes nomeadas, zero número mágico. É o melhor arquivo do repositório.
- **`ModbusTcpConnection.test.ts:4-9`** — o raciocínio de "mock de módulo nunca pegaria isso, então testa-se contra o pacote real" é maduro e documenta a lacuna que deixou o CI verde num bump quebrado.
- **Composição por injeção (`createApp(deps)`)** e o padrão de camadas por módulo estão aplicados de forma uniforme nos 16 módulos — a consistência aqui é o que torna o codebase navegável.
- **Rastreabilidade decisão → ADR → roadmap → changelog.** Os fechamentos de fase do `roadmap.md` registram inclusive o que *saiu* do escopo e por quê, e os achados de execução (bug de `queryKey` da Fase 4, `body` sem layer da Fase 5). Isso é raro e vale preservar.
- **`06:29-38` (eficiência) bem observado:** `Map`/`Set` no cache do `AlertEvaluator` e no `MinuteBuffer`; paginação em todas as listagens; `Promise.all` em vez de sequência nos pontos quentes (`consumption.service.ts:99-102`).

---

## 9. Plano de ação sugerido

**Bloco 1 — corrigir o que está quebrado (1 issue, XS)**
- Q-01 (bug RS-485, com teste de regressão primeiro — skill `correcao-bugs`).

**Bloco 2 — instalar as travas antes de acumular mais dívida (1 issue, S/M)**
- Q-02 (ESLint complexity + dependency-cruiser + husky/lint-staged + Prettier), Q-03 (CI e Dependabot do `iot-simulator`), Q-19 (`noImplicitReturns` nos 4), Q-20 (`recommendedTypeChecked`).
- *Fazer antes do Bloco 3*: as regras vão apontar exatamente o que refatorar, com números em vez de opinião.

**Bloco 3 — dívida de complexidade do worker IoT (1 issue, M)**
- Q-06 (quebrar o arquivo por adaptador) → Q-04 (Zod por protocolo) → Q-05 (o boilerplate some junto) → Q-18 (testes do parser serial e da fábrica) → Q-31, Q-32, Q-24.

**Bloco 4 — sincronizar a documentação viva (1 issue, XS)**
- Q-21, Q-22, Q-23, Q-35. Barato e de alto retorno: **contexto desatualizado induz todas as outras skills a erro**, e o Q-21 em particular está ativamente enganando quem trabalha em UI.

**Bloco 5 — drift de design system (1 issue, M — parte de token, parte de limpeza)**
- Primeiro a decisão de token: Q-11 (mapear a escala tipográfica/espacial do Industry no `@theme`) e Q-08 (promover o verde a token) — com `/design-sync` de volta ao Claude Design.
- Depois a limpeza mecânica: Q-09, Q-10, Q-12, Q-13, Q-14, e a remoção do bloco `@theme` legado do `index.css`.

**Bloco 6 — cobertura de caminhos de negócio e segurança (1 issue, M)**
- Q-16 (Alertas, RF14–RF16), Q-17 (`appStream`/`RealtimeContext`), Q-15 (o namespace de `queryKey`, que é prevenção de bug e não só teste).

**Bloco 7 — polimento (1 issue, S, oportunista)**
- Q-07 (`parseOrThrow` — grande ganho de legibilidade por pouco esforço), Q-25 a Q-30, Q-33, Q-34, Q-36, Q-37, Q-38.

---

### Nota sobre `TODO(design)` remanescentes

Um único: `frontend/src/pages/about/AboutPage.tsx:7` — `// TODO(design): aguardando handoff — Sobre o projeto`. Está **conforme a regra de ausência** do `10-design-system.md:59-65`: avisado, decidido com o usuário (2026-08-04), implementado como versão provisória dentro do vocabulário Industry existente, registrado no roadmap (`:248`: "*a `auditoria-qualidade` vai reportar o `TODO(design)` até lá. Isso é intencional, não esquecimento*") e no changelog.

**Reportado conforme o protocolo, sem recomendação de ação.** Continua pendente apenas do handoff do Claude Design para `/sobre`. As telas `pages/report/` e `pages/simulation/` também não têm handoff e estão registradas como adiadas no roadmap — a ausência de `TODO(design)` nelas é coerente, já que não foram implementadas como versão provisória de um design ausente, e sim adiadas por inteiro.
