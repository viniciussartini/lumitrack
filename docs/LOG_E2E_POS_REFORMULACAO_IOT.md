# Log de implementação — Suíte e2e pós-reformulação IoT

> Registro cronológico do que foi executado em cada sub-issue do [PLANO_E2E_POS_REFORMULACAO_IOT.md](./PLANO_E2E_POS_REFORMULACAO_IOT.md) (sub-issues detalhadas em [ISSUES_E2E_POS_REFORMULACAO_IOT.md](./ISSUES_E2E_POS_REFORMULACAO_IOT.md)), incluindo desvios do plano original e decisões tomadas durante a implementação. Branch: `test/e2e-rework-iot`. O texto de commit não fica neste arquivo — é dado na conversa, um por sub-issue completa.

---

## Nota de ambiente — browsers do Playwright disponíveis (15/07/2026)

Diferente de todas as fases anteriores deste projeto (`LOG_IMPLEMENTACAO_IOT.md` Fase 5 desvio #6, `LOG_SIMULADOR_IOT.md` Fase 1 desvios #11 e #3 da Sub-issue 5), **a rede do ambiente não está mais bloqueando o CDN do Playwright**. `npx playwright install chromium firefox` completou (938 MB em `~/.cache/ms-playwright`: chromium-1228, chromium_headless_shell-1228, firefox-1532, ffmpeg-1011).

Consequência prática: pela primeira vez neste projeto a verificação de e2e é feita **rodando a suíte de verdade nos dois browsers**, não por inferência a partir de `tsc`/Vitest/`curl`. Todas as seções abaixo trazem números reais de execução.

Ressalva: `npx playwright install --with-deps` **falha** neste ambiente — o `--with-deps` troca para root via `sudo` para instalar bibliotecas de sistema e não há terminal para a senha. O fallback sem `--with-deps` funcionou porque as libs de sistema já estavam presentes (os browsers sobem e executam). Quem for reproduzir num ambiente limpo pode precisar instalar as deps de sistema à parte.

---

## Nota de ambiente — o local NÃO reproduz o CI sem backend rodando (15/07/2026)

Descoberto ao medir o baseline da Sub-issue 1: `CI=true npx playwright test` local dá **14 passando / 74 falhando**, enquanto o CI em `main` dá **8 passando / 80 falhando** ([run 29459167184](https://github.com/viniciussartini/lumitrack/actions/runs/29459167184)). A suíte é a mesma; o ambiente é que não é.

**Causa:** o job `e2e` do CI (`.github/workflows/ci.yml`) sobe um Postgres de serviço, aplica as migrations e roda `npm run dev` do backend em background antes do Playwright. Localmente não há backend na porta 3333. Isso muda o que acontece com uma rota **não mockada**:

- **No CI:** a chamada chega ao backend real → **401** (sem sessão) → o interceptor do `api` dispara `lumitrack:unauthorized` → o app redireciona para `/login` no meio do teste → "element was detached from the DOM".
- **Local:** o proxy do Vite não conecta (`ECONNREFUSED 127.0.0.1:3333`) → o erro **não** é um 401 → nenhum redirect → o teste sobrevive e às vezes passa.

Ou seja, os 6 testes de diferença passam localmente **por acidente**: dependem de uma rota não mockada falhar de um jeito que o CI não reproduz.

**Consequência para as próximas sub-issues:** "verde local" não é prova de "verde no CI" enquanto houver rota não mockada. Duas leituras práticas: (a) a meta das sub-issues #3–#5 é que **nenhuma** requisição vaze para o backend — se nenhuma vaza, os dois ambientes convergem; (b) antes de declarar o marco de fim da Fase 1, rodar a suíte com o backend local de pé (`cd backend && npm run dev`, Postgres de dev já existente), que é a configuração fiel ao CI. Registrado aqui porque nenhum documento do épico previa essa diferença — o plano assumia que `CI=true` bastava para fidelidade, e ele só cobre `webServer`/`retries`, não o backend.

---

## Sub-issue 1 — Fixtures compartilhados em `tests/e2e/support/`

**Data:** 15/07/2026

### O que foi implementado

Novo diretório `frontend/tests/e2e/support/` com quatro módulos, extraindo o que hoje está duplicado nos 9 specs (a exploração confirmou: **zero** código compartilhado hoje — cada spec tem sua própria cópia dos helpers, com divergências reais entre elas).

- **`api.ts`** — `fulfillJson(route, data, status = 200)`, `fulfillError(route, message, status)` e `fulfillPaginated(route, items, opts?)`. O último monta o envelope `{status:"success",data:{items,total,page,pageSize}}` conforme `src/types/pagination.types.ts`, com `total` default = `items.length`, `page` = 1 e `pageSize` = `DEFAULT_PAGE_SIZE` (importado do próprio app, não redigitado como `10`).
- **`appShell.ts`** — `mockAppShellBackground(page)` cobrindo as **quatro** chamadas que qualquer rota autenticada dispara só por montar o AppShell: `GET /api/alerts` (paginado), `GET /api/alerts/firing` (array cru), `GET /api/notifications` (array cru), `GET /api/iot/stream` (`text/event-stream`, body vazio). Mais `setupAuth(page, user = FAKE_USER)` mockando `GET /api/auth/me` — único caminho de "usuário autenticado" desde a #06 (sessão em cookie httpOnly, sem token em localStorage para pré-semear).
- **`fixtures.ts`** — `FAKE_USER`, `DIST_CEMIG`, `PROP_1`, `AREA_1`, `DEVICE_1`, `METER_1`, `ALERT_1`, `BUCKET_HOUR_1|2`, `BUCKET_DAY_1|2`, todos **tipados com os types reais do app** (`import type` de `src/types/*`).
- **`devtools.ts`** — `hideDevTools(page)`. Mantido apesar de ser no-op no CI (o job roda `vite preview`, onde o DevTools não existe no bundle por ser gated por `import.meta.env.DEV`); continua necessário localmente, onde o webServer é `vite dev`.

Nenhum spec consome `support/` ainda — a migração é das sub-issues #3–#5, conforme o critério de aceite da própria sub-issue.

### Desvios do plano

1. **`FAKE_USER` não tem o campo `role`**, embora o `FAKE_USER` atual de `auth.spec.ts:11` tenha (`role: "USER"`). O backend realmente devolve `role` (RBAC, #16), mas o type `User` do frontend não o modela e um grep confirmou que **nenhuma tela do frontend lê `role`**. Tipar a fixture como `User` e manter o campo exigiria um `as` para escapar do excess property check — exatamente o padrão que escondeu uma fixture desatualizada por meses em `dataExportPdf.test.ts` (ver "Revisão pós-implementação" em `LOG_IMPLEMENTACAO_IOT.md`). Preferi remover o campo morto a enfraquecer o type-check.
2. **Imports por caminho relativo (`../../../src/types/...`), não pelo alias `@/`.** O alias existe em `tsconfig.app.json`, mas o `tsconfig.json` da raiz do frontend só tem `references` (sem `compilerOptions.paths`) — que é o arquivo que o Playwright consulta para resolver imports em runtime. Como quase todos os imports de `support/` são `import type` (apagados na compilação), o alias até funcionaria por acidente; `DEFAULT_PAGE_SIZE` é um import de **valor** e quebraria. Caminho relativo funciona nos dois casos sem mexer em config de build — e a alternativa (adicionar `paths` ao tsconfig raiz) mudaria a configuração do projeto inteiro para conveniência de um diretório de teste.
3. **`fixtures.ts` usa timestamps literais fixos** (`"2026-07-15T12:00:00.000Z"`), não `new Date().toISOString()` como o `FAKE_USER` de hoje. A data de "agora" não muda nenhuma assertion, e um literal mantém o teste determinístico.
4. **`fulfillJson`/`fulfillError` adotaram a assinatura majoritária** (7 dos 9 specs: `status = 200` opcional no primeiro, obrigatório no segundo). `dashboard.spec.ts` e `report.spec.ts` divergem hoje (`fulfillJson` sem `status`, `fulfillError` com default 500) — mas os dois são deletados pela sub-issue #2, então a divergência morre sozinha.
5. **Um smoke test descartável foi usado para verificar a entrega** (ver abaixo) — não previsto no plano, mas sem ele a sub-issue seria commitada com verificação limitada a type-check, já que `support/` por definição não é coletado como spec.
6. **Nenhum `ALERT_EVENT_*` ou fixture de `Notification` criada** — o plano lista `BUCKET_*` mas não estes, e eles só são necessários nas sub-issues #6 e #10 (Fase 2). Criar agora seria adivinhar o shape de uso antes de existir um consumidor.
7. **`mockAppShellBackground` só intercepta `GET`** em `/api/alerts` e `/api/notifications`, caindo em `route.fallback()` nos demais métodos — não estava no plano. Sem isso, um `POST /api/alerts` (criar alerta, sub-issue #6) ou um `DELETE /api/notifications` (limpar todas, #10) casaria a mesma URL e receberia a resposta da **listagem**: uma falha silenciosa, com o teste vendo "sucesso" e nada acontecendo. Com o guard, o método não mockado vaza e falha alto.

### Testes escritos

Nenhum teste permanente — a sub-issue entrega apenas helpers, e o critério de aceite é explícito: "nenhum spec ainda consumindo".

Para verificar a entrega foi criado um **smoke test descartável** (`tests/e2e/support-smoke.spec.ts`, 2 testes), rodado nos dois browsers e **removido antes do commit**:

- "setupAuth + mockAppShellBackground renderizam o AppShell autenticado" — navega para `/dashboard`, assere `Olá, João` visível e a URL estável em `/dashboard`, e — via um listener de `request` — confirma que as três chamadas de fundo (`/api/alerts/firing`, `/api/notifications`, `/api/iot/stream`) foram de fato disparadas e interceptadas (nenhuma vazou para o backend real → nenhum 401 → nenhum redirect para `/login`).
- "listagem paginada chega no shape `Paginated<T>`" — `/propriedades` com `fulfillPaginated(route, [PROP_1])` renderiza o nome da propriedade, provando que o envelope montado pelo helper é o que os hooks de lista esperam.

O primeiro é, na prática, um ensaio do que a sub-issue #3 vai fazer com `auth.spec.ts`: confirma que os mocks de firing/notifications são mesmo o que conserta o "element was detached from the DOM".

### Verificação executada

- `npx playwright install chromium firefox` — OK (ver "Nota de ambiente" acima).
- `npx tsc -p tsconfig.app.json --noEmit`: **zero erros no projeto inteiro** (o `tsconfig.app.json` inclui `tests/`, então `support/` é type-checado de verdade).
- `npx eslint tests/e2e/support`: limpo, zero avisos.
- **Smoke test descartável**: 4/4 nos dois browsers (2.7s), rodado duas vezes — antes e depois do guard de método do desvio #7.
- **Suíte completa (`CI=true npx playwright test`, build+preview, 2 browsers, retries: 2)**, rodada duas vezes:
  - **com** o smoke presente: 92 testes, 74 falhando / 18 passando (3.9min);
  - **sem** o smoke (baseline final): 88 testes, **74 falhando / 14 passando** (3.9min).

  A contagem de falhas é **idêntica** nas duas (74), e a de passes difere exatamente pelos 4 testes do smoke — confirmando os dois critérios de aceite: `support/` **não é coletado como spec** pelo `testDir: ./tests/e2e` (arquivos sem `.spec.ts` são ignorados — o plano pedia para confirmar; confirmado empiricamente) e a sub-issue **não altera o resultado da suíte**, por desenho (não conserta spec nenhum, só cria o que as #3–#5 vão consumir).

- **Divergência com o número do plano, investigada:** o plano e o épico falam em "80 de 88 quebrados / 8 passando"; localmente são **74 quebrados / 14 passando**. Não é ruído nem melhora — é a ausência do backend local (ver "Nota de ambiente" acima). Os 14 que passam aqui são `auth.spec.ts` (10 = 5 testes × 2 browsers, **incluindo o de logout**, que no CI falha), `area.spec.ts` (2) e `device.spec.ts` (2). A diferença de 6 é exatamente 3 testes × 2 browsers que dependem de uma rota não mockada falhar como `ECONNREFUSED` (local) em vez de `401` (CI). Coerente com o diagnóstico do plano: é o 401 que dispara o redirect para `/login`, não a falha de rede.

### Próximo passo

Sub-issue #2 — podar os 4 specs obsoletos (`dashboard`, `report`, `consumption`, `alerts`; ~2.522 linhas). Não depende da #1 e derruba a maior parte dos 80 testes quebrados de uma vez. Depois: #3 (`auth.spec.ts`), #4 (`properties`/`area`/`device`), #5 (`distributors`) — as três dependem da #1 e fecham a Fase 1 com o CI verde.

---

## Sub-issue 2 — Podar os specs obsoletos

**Data:** 16/07/2026

### O que foi implementado

Removidos os 4 specs que testam features excluídas no rework IoT — nenhum tinha o que consertar, todos os cenários dependiam de telas/modelos que não existem mais:

- `tests/e2e/dashboard.spec.ts` (419 linhas, 6 testes) — dashboard é `PlaceholderPage`.
- `tests/e2e/report.spec.ts` (462, 8 testes) — rota `/…/relatorio` cai no fallback `*` → `/login`.
- `tests/e2e/consumption.spec.ts` (698, 5 testes) — consumo não tem mais create/edit/delete.
- `tests/e2e/alerts.spec.ts` (943, 10 testes) — modelo de alerta invertido por completo.

Total: **2.522 linhas, 29 testes (×2 browsers = 58 execuções) removidos**, via `git rm`.

### Desvios do plano

Nenhum — execução exatamente como especificado (delete puro, sem substituto: a cobertura perdida é rastreada pelas sub-issues #6/#7/#8 da Fase 2).

### Testes escritos

Nenhum — sub-issue de remoção pura. Confirmado por `grep` que os únicos resquícios dos 4 arquivos nos specs sobreviventes são comentários de diagnóstico histórico (`auth.spec.ts`, `device.spec.ts`, `distributors.spec.ts`, `area.spec.ts`, `properties.spec.ts` e `support/devtools.ts` citam `consumption.spec.ts` como onde a flakiness do DevTools foi originalmente diagnosticada) — nenhum import real, nada quebra com a remoção.

### Verificação executada

- `npx eslint tests/e2e` e `npx tsc -p tsconfig.app.json --noEmit`: limpos.
- **Suíte completa (`CI=true npx playwright test`)**: **30 testes, 14 passando / 16 falhando** — exatamente a previsão (88 − 58 = 30; os 14 que já passavam antes da poda são todos de `auth`/`area`/`device`, nenhum dos 4 arquivos removidos estava entre eles, então a contagem de passes não muda). Specs sobreviventes: `auth.spec.ts`, `area.spec.ts`, `device.spec.ts`, `distributors.spec.ts`, `properties.spec.ts`.
- **Uma execução intermediária deu um resultado espúrio** (15 testes, todos falhando, `Protocol error: Cannot navigate to invalid URL`) — investigado antes de aceitar qualquer número: reproduzir `auth.spec.ts` isolado (`--project=chromium`) passou 5/5 limpo, com os logs de `[WebServer]` presentes normalmente. Uma reexecução completa e limpa (removendo `dist/`/`test-results/` antes) deu o resultado estável acima. Ficou sem causa raiz identificada — hipótese mais provável é contenção de recursos entre execuções consecutivas de `npm run build && npm run preview` no mesmo shell —, mas não se repetiu; registrado para o caso de reaparecer nas próximas sub-issues.
- **Efeito colateral corrigido**: ao limpar os artefatos da execução espúria, um `rm -rf playwright-report` (sem barra final) apagou o diretório inteiro em vez de só o conteúdo, removendo `playwright-report/index.html` — que está **versionado** (achado de higiene do repo, não específico desta sub-issue: `frontend/.gitignore` não ignora `test-results/` nem `playwright-report/`, e os dois têm arquivos rastreados por acidente). Restaurado via `git checkout`. Fica registrado como pendência de limpeza do `.gitignore`, fora do escopo desta sub-issue.

### Próximo passo

Sub-issue #3 — consertar `auth.spec.ts`: trocar os helpers locais pelos de `support/`, cobrir firing/notifications via `mockAppShellBackground`. Depois #4 (`properties`/`area`/`device`) e #5 (`distributors`), fechando a Fase 1 com o CI verde.

---

## Sub-issue 3 — Consertar `auth.spec.ts`

**Data:** 16/07/2026

### O que foi implementado

`auth.spec.ts` migrado para `support/`: `FAKE_USER` local removido (importado de `support/fixtures`), `hideDevTools` local removido (importado de `support/devtools`), `mockAppShellBackground` local removido (importado de `support/appShell`). Arquivo caiu de 183 para 121 linhas.

O teste "autentica com sucesso" manteve sua lógica própria de `let loggedIn = false` + `GET /auth/me` condicional — é comportamento específico deste teste (simular o bootstrap não-autenticado até o `POST /login` completar), não algo generalizável para `setupAuth` (que mocka `/auth/me` com um usuário fixo desde o início, usado pelo teste de logout).

### Desvios do plano

1. **A assertion pós-login não precisou mudar.** O escopo da sub-issue previa "ajustar a assertion pós-login: `/dashboard` hoje renderiza `PlaceholderPage` com `<h1>Olá, {firstName}!`" — mas o arquivo **já** asserta `/olá, joão/i` desde antes desta sub-issue (o autor do spec original, embora não tivesse atualizado os mocks, já tinha alinhado essa assertion com a `DashboardPage` placeholder). Nenhuma mudança necessária aqui, como já suspeitado na nota deixada no plano ao final da sub-issue #1.
2. **`mockAppShellBackground` de `support/` não mocka `GET /api/properties`**, diferente da versão local antiga (que mockava com o comentário "a DashboardPage chama GET /api/properties... por propriedade, um report"). Confirmado lendo `DashboardPage.tsx` atual: é um placeholder que só usa `useAuth()` — não faz nenhuma chamada de API. O mock antigo era vestígio do dashboard pré-Fase-5 (fan-out de relatórios por propriedade). Nenhum teste depende dele; a suíte passa sem esse mock.

### Testes escritos

Nenhum teste novo — sub-issue de migração/correção. Os 5 testes existentes de `auth.spec.ts` foram preservados como estavam (mesmos cenários, mesmas assertions), só trocando a origem dos helpers.

### Verificação executada

- `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint tests/e2e/auth.spec.ts`: limpos.
- `grep` confirma **zero helper duplicado** no arquivo (nenhum `const FAKE_USER|hideDevTools|mockAppShellBackground|...` local).
- **`auth.spec.ts` isolado (`CI=true npx playwright test auth.spec.ts`)**: **10/10 passando** (5 testes × 2 browsers), incluindo o de logout — o que mais historicamente falhava por "element was detached from the DOM".
- **Confirmado que o backend real não estava rodando** (`lsof -i :3333` vazio) durante a execução — o verde vem dos mocks corretos, não de um backend real respondendo por acidente. Os únicos `[WebServer] ... ECONNREFUSED` nos logs são de `/api/auth/me` nos dois testes que testam o caminho **não autenticado** por desenho (sem mock nenhum, idêntico ao comportamento do arquivo original) — não é regressão.
- Suíte completa (`CI=true npx playwright test`, todos os 5 specs sobreviventes): ver resultado abaixo.

### Próximo passo

Sub-issue #4 — consertar `properties.spec.ts`, `area.spec.ts`, `device.spec.ts`: envelope `Paginated<T>`, trocar mocks de consumo/alerta por `meters/by-target` e `consumption`, `area.spec.ts` trocar `/api/alerts/stream` por `/api/iot/stream`. Depois #5 (`distributors`), fechando a Fase 1.

---

## Sub-issue 4 — Consertar `properties.spec.ts`, `area.spec.ts`, `device.spec.ts`

**Data:** 16/07/2026

### O que foi implementado

Os três specs migrados para `support/` (mesmo padrão da #3) e realinhados ao contrato atual, explorando a fundo o código-fonte real de cada página antes de escrever qualquer assertion (não só os `.test.tsx` citados no plano — as próprias páginas, forms, menus e schemas):

- **Envelope `Paginated<T>`** em `/api/properties`, `/api/properties/*/areas`, `.../devices`, `/api/distributors` via `fulfillPaginated`.
- **Mocks de consumo/alerta por entidade removidos por completo** — não existem mais. No lugar, uma única rota `GET /api/meters/by-target` (regex, qualquer `targetType`) mockada com 404 (`fulfillError(..., 404)`), que o `meterService.byTarget` trata como "sem medidor". Como `ConsumptionSection` só chama `/api/consumption` **depois** de confirmar que o alvo tem medidor, isso automaticamente elimina a necessidade de mockar `/api/consumption` nestas três specs — nenhum dos três testa medidor/consumo (isso é escopo das sub-issues #7/#9 da Fase 2).
- **`area.spec.ts`**: `**/api/alerts/stream` removido — o SSE real é `/api/iot/stream`, já coberto por `mockAppShellBackground`.
- **`properties.spec.ts`**: teste "bloqueia criação sem distribuidora" reescrito por completo — a mensagem mudou de "Cadastre uma distribuidora primeiro" para "Catálogo de distribuidoras indisponível", e o link deixou de ser "Cadastrar distribuidora" → `/distribuidoras/nova` (rota que não existe mais) para "Ver catálogo de distribuidoras" → `/distribuidoras`. Teste de criação passou a assertar os chips de "Faturamento" (`electricalSystem`/`billingClass`, migrados da distribuidora na Fase 1).
- **`device.spec.ts`**: as 3 seções placeholder da `DeviceDetailsPage` antiga ("Consumo"/"Alertas"/"Integração IoT") viraram 2 seções reais — `MeterSection` (h2 "Medidor") e `ConsumptionSection` (h2 "Consumo"). Sem placeholder de "Alertas"/"Integração IoT" — a gestão de alertas é global em `/alertas` e a integração IoT é a própria seção de medidor.
- **`PROP_1`/`AREA_1`/`DIST_CEMIG`/`DEVICE_1` de `support/fixtures.ts`** usados como identidade fixa nos três specs (em vez de constantes locais redigitadas), incluindo nos textos das assertions.

### Desvios do plano

1. **Bug de roteamento descoberto e corrigido durante a verificação, não previsto no plano**: os hooks paginados (`useAreas`/`useDevices`) sempre enviam `?page=&pageSize=` mesmo com os defaults — `axios` não omite params só porque batem com o default. Os padrões `glob` copiados literalmente dos specs antigos (`"**/api/properties/prop-1/areas"`, sem tratar querystring) **não casam mais** com a URL real (`.../areas?page=1&pageSize=10`) — a requisição vaza pro proxy do Vite, que devolve 502 (`ECONNREFUSED` do backend inexistente, convertido em Bad Gateway), e a seção correspondente mostra um erro genérico em vez do EmptyState esperado. `properties.spec.ts` já usava regex com `(\?.*)?$` desde a primeira versão desta sessão (evitando o bug por acidente); `area.spec.ts`/`device.spec.ts` foram corrigidos para o mesmo padrão em todas as rotas de **listagem** (`.../areas`, `.../devices`). Rotas de **detalhe** (`getById`/`update`/`delete`) não enviam query params, então globs simples continuam corretos ali. Fica registrado como um cuidado geral para as próximas sub-issues: qualquer endpoint de listagem precisa de regex tolerante a querystring, nunca glob puro.
2. **`device.spec.ts` inicialmente assertava "Sala" como nome da área**, herdado do texto do spec antigo — mas a fixture compartilhada `AREA_1` (Sub-issue #1) já representa uma área chamada "Cozinha" (`description: "Área de preparo"`). Corrigido trocando as 3 assertions afetadas para "Cozinha" em vez de criar uma sobrescrita local da fixture — reforça o valor de reusar `support/fixtures.ts` como identidade única, mesmo quando o texto do spec antigo sugeria outro nome.
3. **`properties.spec.ts`: assertion de faturamento pós-criação usa os defaults do form** ("Monofásico"/"B1 — Residencial"), não valores escolhidos explicitamente — o teste não seleciona `electricalSystem`/`billingClass` no formulário de criação (só preenche nome/distribuidora/endereço, como o spec antigo já fazia), então os defaults do `PropertyForm` (`MONOPHASIC`/`B1`) são o que realmente aparece na `PropertyDetailsPage` depois.
4. **`properties.spec.ts`: teste de "sem distribuidora" ganhou uma assertion nova** (`expect(...).not.toBeVisible()` no campo "Nome da propriedade") — confirma que o form não é renderizado quando o catálogo está vazio, espelhando `NewPropertyPage.test.tsx`.

### Testes escritos

Nenhum teste novo — sub-issue de migração/correção. Os 8 testes existentes (2 properties + 3 area + 3 device) foram preservados nos mesmos cenários, com os mocks/assertions realinhados ao contrato atual.

### Verificação executada

- `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint tests/e2e/{properties,area,device}.spec.ts`: limpos (um erro de lint pego no caminho — `@typescript-eslint/no-empty-object-type` em `interface AreaSeed extends Area {}`/`interface DeviceSeed extends Device {}`; corrigido para `type AreaSeed = Area`/`type DeviceSeed = Device`).
- **Os três specs isolados, nos dois browsers (`CI=true npx playwright test properties.spec.ts area.spec.ts device.spec.ts`)**: **16/16 passando** (8 testes × 2 browsers) — incluindo os fluxos completos de CRUD com criação/edição/exclusão em cascata que historicamente eram os mais frágeis da suíte.
- **Suíte completa (`CI=true npx playwright test`)**: **30 testes, 26 passando / 4 falhando** — as 4 falhas são exatamente `distributors.spec.ts` (2 testes × 2 browsers), o escopo intocado da sub-issue #5. Confirma zero regressão: os 14 que já passavam antes (`auth` 10 + `area`/`device` 2+2, estes últimos por acidente do ambiente sem backend) continuam passando, agora `area`/`device` passam pelos motivos certos (mocks corretos), e `properties` (que não passava nenhum teste antes) foi de 0/4 para 4/4.
- 1500 → 1127 linhas nos três arquivos somados (support/ absorveu a duplicação).

### Próximo passo

Sub-issue #5 — reduzir `distributors.spec.ts` ao catálogo somente leitura (remover criar/editar/excluir e a mensagem de vínculo — `DistributorForm`/`DistributorMenu` foram deletados). É a última sub-issue da Fase 1: ao concluí-la, a suíte inteira deve ficar verde (30/30) e o marco "fim da Fase 1" é atingido.

---

## Sub-issue 5 — Reduzir `distributors.spec.ts` ao catálogo read-only

**Data:** 16/07/2026

### O que foi implementado

`distributors.spec.ts` reescrito do zero (não uma migração incremental como #3/#4 — o fluxo CRUD antigo não tem equivalente no catálogo atual). Migrado para `support/` desde o início. Três testes cobrindo exatamente o que `DistribuidorsPage`/`DistributorCard` fazem hoje:

- **"mostra o catálogo com distribuidoras cadastradas"** — `distributors-grid`, `distributor-card-${id}` com nome/CNPJ/UF/TUSD/TE/ICMS/PIS/COFINS visíveis (os campos reais de `DistributorCard.tsx`), usando `DIST_CEMIG` de `support/fixtures.ts` + uma segunda distribuidora local (`DIST_ENEL`, clonada por spread). Assertions negativas confirmando a ausência de "Nova distribuidora" e de qualquer botão "Opções de" — o catálogo é 100% somente leitura, sem `DistributorForm`/`DistributorMenu`.
- **"mostra EmptyState quando o catálogo está vazio"** — título "Catálogo indisponível" + descrição "Não há distribuidoras cadastradas no momento." (texto real de `DistribuidorsPage.tsx`, diferente do "Cadastre uma distribuidora primeiro" do modelo antigo).
- **"mostra erro ao falhar em carregar o catálogo, com retry"** — teste novo, sem equivalente no spec antigo (que nunca cobriu o `ErrorState`). Mocka 500 na primeira chamada, clica em "Tentar novamente", troca o mock pra sucesso e confirma que o grid aparece — cobre o botão de retry de verdade, não só a mensagem de erro.

### Desvios do plano

1. **Reescrita completa, não edição incremental** — o plano listava "Manter: listagem, EmptyState, erro. Remover: criar, editar, excluir e a mensagem de vínculo", o que daria a entender uma edição do arquivo existente. Na prática, como o fluxo antigo era 100% CRUD (criar → editar → trocar campo → excluir, tudo num único teste gigante) e o novo é 100% leitura, não havia estrutura aproveitável — reescrever do zero foi mais direto que tentar podar um teste de CRUD até sobrar uma leitura.
2. **Teste de erro/retry é novo**, não estava no spec antigo (que só cobria o cenário de exclusão bloqueada por vínculo, cenário que não existe mais). Adicionado porque o próprio texto da sub-issue no plano listava "erro" entre o que deveria ser mantido/coberto.
3. **Segunda distribuidora (`DIST_ENEL`) definida localmente** (spread de `DIST_CEMIG` com overrides), mesmo padrão já usado em `properties.spec.ts` — só para confirmar que o grid renderiza múltiplos cards corretamente, não fixture nova em `support/`.

### Testes escritos

3 testes novos/reescritos (o spec antigo tinha 2, nenhum reaproveitável como estava).

### Verificação executada

- `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint tests/e2e/distributors.spec.ts`: limpos. (Dois erros de digitação pegos nessa checagem antes mesmo de rodar o Playwright: uma referência solta a `mockAppShellBackground` sem chamar dentro do `beforeEach`, e uma expressão ternária sem sentido no meio de uma regex — ambos corrigidos antes da primeira execução.)
- **`distributors.spec.ts` isolado, nos dois browsers**: **6/6 passando** de primeira (nenhuma iteração de correção precisou rodar contra o Playwright — os dois bugs acima foram pegos só por `tsc`/`eslint`).
- **Suíte completa sem backend (`CI=true npx playwright test`)**: **32/32 passando** — 30 (auth 10 + area 6 + device 6 + properties 4 + distributors antigo 4) vira 32 porque `distributors.spec.ts` ganhou um 3º teste. **Marco "fim da Fase 1" atingido**: zero falhas.
- **Verificação definitiva — suíte completa com o backend real de pé** (`cd backend && npm run dev`, Postgres de dev já seedado desta mesma sessão): **32/32 passando**, idêntico ao resultado sem backend. Fecha a ressalva registrada desde a sub-issue #1 ("CI=true sozinho não reproduz o CI real sem backend rodando") — com todas as rotas de fundo corretamente mockadas (firing/notifications/SSE) e nenhum endpoint vazando pro backend real, os dois ambientes convergem de verdade, não por coincidência. Backend encerrado ao final da verificação.

### Próximo passo

**Fase 1 completa.** `CI=true npx playwright test` verde nos dois browsers (32/32), verificado também com backend real — o CI deixa de ser ruído e volta a ser gate. Próximo: Fase 2 (sub-issues #6–#10) — `alerts.spec.ts`, `consumption.spec.ts`, `reports.spec.ts`, `meter.spec.ts`, `realtime.spec.ts`, cobrindo o que ficou descoberto pela poda da sub-issue #2.

---

## Sub-issue 6 — `alerts.spec.ts` (modelo firing/enabled)

**Data:** 17/07/2026

### O que foi implementado

Spec novo (não migração — `alerts.spec.ts` não existia desde a poda da sub-issue #2), cobrindo `/alertas` no modelo de faixa de potência. Exploração de código completa antes de escrever qualquer assertion: `AlertsPage.tsx`, `AlertForm.tsx`, `AlertFormDialog.tsx`, `AlertTable.tsx`, `AlertRowMenu.tsx`, `AlertStatusBadge.tsx`, `AlertEventTable.tsx`, `alert.service.ts`, `alert-event.service.ts`, `alert.schema.ts`, hooks de query/mutation, `lib/formatters/alert.ts` e `Pagination.tsx` — todos lidos por completo, não só os `.test.tsx` citados no plano.

4 testes:

- **"cria, edita, alterna habilitado e exclui um alerta"** — ciclo completo: EmptyState "Nenhum alerta configurado" → criar via `alert-form-dialog` (nome/medidor/potência/tolerância, testids `alert-form-*`) → editar (confirma que em modo edição `alert-form-meterId` **não existe** — vira `<input type="hidden">`, medidor é imutável) → alternar habilitado via `alert-menu-toggle-enabled-${id}` sem passar pelo form → excluir via `ConfirmDialog` "Excluir alerta?".
- **"mostra status firing/normal e o histórico de disparos do alerta selecionado"** — dois alertas, um `firing` outro `normal` (`alert-status-badge-${id}` com `data-status` + texto "Em disparo"/"Normal"), histórico pré-seleciona o primeiro alerta da lista, troca de seleção via `alert-events-select` troca a query (`GET /alert-events?alertId=`) e alterna entre `AlertEventTable` populada e o EmptyState "Nenhum episódio registrado".
- **"pagina a listagem de alertas"** — 12 alertas sintéticos, `Pagination` (`pagination`/`pagination-next`) navegando de `page=1` pra `page=2` de verdade (a URL da segunda chamada é inspecionada via `URLSearchParams`, não só a UI).
- **"validação client-side bloqueia submit com campos inválidos"** — submit vazio (nome/medidor/potência obrigatórios; tolerância já vem com default 10, não erra aqui) e depois valores fora de faixa (`referencePowerKw=0` → "Deve ser maior que zero"; `tolerancePercent=150` → "Não pode ultrapassar 100").

`ALERT_EVENT_1` (fixture de `AlertTriggerEvent`) adicionado a `support/fixtures.ts` — a sub-issue #1 tinha deferido essa fixture exatamente para quando existisse um consumidor real; agora existe.

### Desvios do plano

1. **Bug real no próprio spec, achado pela primeira execução (não do produto)**: o teste do ciclo completo travava em 30s tentando clicar em "Excluir" no menu — a causa era um `page.keyboard.press("Escape")` que eu tinha escrito partindo do pressuposto errado de que Escape fecha o menu de ações (`AlertRowMenu`). Lendo o componente: ele só fecha por um listener de `mousedown` no documento (clique fora), sem handler de teclado nenhum. Resultado: o menu ficava aberto, o próximo clique no trigger o fechava (toggle), e o clique seguinte em "excluir" nunca encontrava o item. Corrigido trocando `Escape` por um clique real fora do menu (no `<h1>` da página) + uma assertion nova confirmando que o item do menu realmente sumiu antes de prosseguir. Passou de primeira depois da correção — 3 dos 4 testes já tinham passado de primeira antes disso, evidência de que a exploração de código prévia estava correta na maior parte.
2. **Teste de paginação inspeciona a query real da segunda página**, não só o texto renderizado — computa `items` a partir de `page=1`/`page=2` recebidos via `URLSearchParams` na própria mock, replicando o comportamento do backend real em vez de devolver sempre a mesma resposta. Não estava explícito no texto do plano, mas é o que dá confiança de que a paginação dispara a query certa, não só que o componente `Pagination` renderiza.
3. **Segundo alerta (`alert-2`) e alertas sintéticos de paginação definidos localmente**, não em `support/fixtures.ts` — mesmo padrão já estabelecido em `properties.spec.ts` (`DIST_ENEL`) e `distributors.spec.ts`: só o fixture reaproveitável entre specs (`ALERT_1`) vive em `support/`, variações só usadas dentro de um teste ficam locais.
4. **`ALERT_EVENT_1` ganhou `durationSeconds: 300`** (não um valor arbitrário) — escolhido de propósito para produzir `formatDurationSeconds` → `"5min"` exato (sem segundos residuais), evitando uma assertion frágil que dependesse de replicar o algoritmo de formatação (`Xh Ymin Zs`, omitindo unidades zeradas) na mão.

### Testes escritos

4 testes novos (8 execuções × 2 browsers).

### Verificação executada

- `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint tests/e2e/alerts.spec.ts tests/e2e/support/fixtures.ts`: limpos.
- **`alerts.spec.ts` isolado, nos dois browsers**: **8/8 passando** — 3 de 4 testes passaram de primeira; o 4º (ciclo completo) precisou da correção do desvio #1.
- **Suíte completa (`CI=true npx playwright test`)**: **40/40 passando** (32 anteriores + 8 novos), zero regressão.

### Próximo passo

Sub-issue #7 — `consumption.spec.ts`: read-only por granularidade (`granularity-tab-hour|day|month|year`), `consumption-table` com linhas `consumption-row-${bucketStart}` (chave é o ISO do bucket, não um id), `consumption-chart`, EmptyStates "Sem consumo para exibir" (sem medidor) e "Sem leituras neste período".
