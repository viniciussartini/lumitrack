# Plano — Atualização da suíte e2e (Playwright) para o modelo de medidores IoT

> **Status:** Fase 1 **completa** (16/07/2026) — `CI=true npx playwright test` verde nos dois browsers (32/32), verificado inclusive com backend real de pé (Postgres seedado). Ver log de implementação em [LOG_E2E_POS_REFORMULACAO_IOT.md](./LOG_E2E_POS_REFORMULACAO_IOT.md). Resolve a pendência conhecida registrada em [PLANO_REFORMULACAO_IOT.md](./PLANO_REFORMULACAO_IOT.md) ("suíte Playwright (`frontend/tests/e2e/`) ainda não foi atualizada para o novo modelo"). Próximo: Fase 2 (sub-issues #6–#10, cobertura do novo modelo).
>
> **Data do planejamento:** 15/07/2026.
>
> **Branch:** `test/e2e-rework-iot`.
>
> **Issues:** ver [ISSUES_E2E_POS_REFORMULACAO_IOT.md](./ISSUES_E2E_POS_REFORMULACAO_IOT.md) (épico + sub-issues para o GitHub).

## Contexto

O job `e2e` do CI falha em `main` com **80 de 88 testes quebrados** em chromium e firefox ([run 29459167184](https://github.com/viniciussartini/lumitrack/actions/runs/29459167184)). Não é um teste isolado: é a suíte inteira.

**Causa raiz:** o commit `2c9e9b1` (11/07/2026) — "feat(iot): reescreve frontend para o modelo de medidores IoT" — reescreveu o frontend em 207 arquivos (~24.900 linhas removidas) e **não tocou em nenhum spec de e2e**. Os specs foram escritos entre 06 e 09/07/2026 e testam uma UI que deixou de existir. O commit #64 (simulador/seed demo) apenas foi o primeiro a rodar o job `e2e` depois disso.

Os 8 testes que passam são os da tela de login — a única página que o rework não mexeu.

**Três classes de quebra:**

1. **Modelo de domínio invertido.** Alerta era limite de kWh one-shot (`TRIGGERED`/`ACTIVE`/`READ`, "marcar como lido", aninhado sob property/area/device); hoje é faixa de potência contínua (`referencePowerKw` ± `tolerancePercent`, `status: "firing"|"normal"`, toggle `enabled`, ligado a `meterId`, top-level em `/api/alerts`). Consumo era CRUD manual; hoje é read-only agregado em buckets por `granularity` (hour/day/month/year). Distribuidora era CRUD por usuário; hoje é catálogo global read-only. O módulo de relatórios (CSV, presets, filtros de data, summary cards) foi deletado e virou `/relatorios` com selects em cascata. `/dashboard` e `/simulacao` são placeholders.
2. **Envelope de resposta.** Toda listagem agora devolve `Paginated<T>` (`{items,total,page,pageSize}`) dentro de `{status:"success",data:…}`. Os mocks devolvem arrays crus.
3. **Rotas novas não mockadas.** O Header passou a chamar `GET /api/alerts/firing` (`WarningBadge`) e `GET /api/notifications` (`NotificationDropdown`). Sem mock, caem no backend real do CI → 401 → evento `lumitrack:unauthorized` → redirect para `/login` no meio do teste. É a origem dos erros "element was detached from the DOM".

**Resultado pretendido:** CI verde e uma suíte que testa o produto que existe hoje.

**Decisões tomadas:**

- Abordagem **faseada**: Fase 1 desbloqueia o CI (poda o obsoleto + conserta o que sobrevive); Fase 2 cobre o que ficou descoberto. Alternativa descartada: reescrita completa antes de qualquer commit, que manteria o CI vermelho por mais tempo sem ganho.
- **Extrair fixtures compartilhados** em `tests/e2e/support/`. Hoje os 9 specs duplicam os mesmos helpers; como os mocks obrigatórios do AppShell cresceram (SSE + firing + notifications), duplicar isso é o que mais causaria re-quebra.
- Commit por sub-issue; `docs/PLANO_REFORMULACAO_IOT.md` e este plano atualizados a cada entrega.

---

## Fase 1 — CI verde

### 1.1 Fixtures compartilhados — `frontend/tests/e2e/support/` ✅ Concluída (15/07/2026)

- `support/api.ts` — `fulfillJson(route, data, status?)`, `fulfillError(route, message, status)` e `fulfillPaginated(route, items, {page,pageSize,total}?)` montando `{status:"success",data:{items,total,page,pageSize}}` conforme `src/types/pagination.types.ts`.
- `support/appShell.ts` — `mockAppShellBackground(page)` cobrindo **as quatro** chamadas de fundo: `GET /api/alerts` (regex `/\/api\/alerts(\?.*)?$/`, para não capturar `/api/alerts/:id`), `GET /api/alerts/firing` (array cru, **não** paginado), `GET /api/notifications` (array cru), `GET /api/iot/stream` (`text/event-stream`, body vazio). Mais `setupAuth(page, user?)` mockando `GET /api/auth/me`.
- `support/fixtures.ts` — `FAKE_USER`, `DIST_CEMIG`, `PROP_1`, `AREA_1`, `DEVICE_1`, `METER_1`, `BUCKET_*`. Espelhar os shapes já validados nos testes de service (`src/services/alert.service.test.ts` para `AlertWithStatus`, `src/services/consumption.service.test.ts` para `ConsumptionBucket`) — são a fonte de verdade do contrato.
- `support/devtools.ts` — `hideDevTools(page)` (injeta CSS ocultando `.tsqd-parent-container`). Manter: o DevTools é gated por `import.meta.env.DEV`, some no `preview` do CI mas existe no `dev` local.

**Nota de implementação:** executado como planejado, com os desvios abaixo (documentados também no log de implementação):

- **`FAKE_USER` sem o campo `role`**, embora o `FAKE_USER` de `auth.spec.ts` o tenha hoje — o backend devolve `role` (RBAC, #16), mas o type `User` do frontend não o modela e nenhuma tela o lê. Mantê-lo exigiria um `as` para escapar do excess property check, enfraquecendo justamente a proteção que motiva tipar as fixtures.
- **Imports por caminho relativo (`../../../src/types/...`), não pelo alias `@/`** — o alias existe em `tsconfig.app.json`, mas o `tsconfig.json` da raiz (que é o que o Playwright lê para resolver imports em runtime) só tem `references`, sem `compilerOptions.paths`. Os `import type` seriam apagados na compilação e funcionariam por acidente; `DEFAULT_PAGE_SIZE` é import de valor e quebraria.
- **Fixtures com timestamps literais fixos**, não `new Date().toISOString()` — determinismo, sem custo (nenhuma assertion depende da data de "agora").
- **`fulfillJson`/`fulfillError` adotaram a assinatura majoritária** (7 dos 9 specs). A divergência de `dashboard.spec.ts`/`report.spec.ts` morre com a sub-issue 1.2, que os deleta.
- **Verificação por smoke test descartável** — `support/` não é coletado como spec (é justamente o critério de aceite), então sem isso a entrega ficaria verificada só por type-check. Criado, rodado nos dois browsers e removido antes do commit (detalhes no log).
- **Sem fixtures de `AlertTriggerEvent`/`Notification`** — só teriam consumidor nas sub-issues da Fase 2; criá-las agora seria adivinhar o shape de uso.

### 1.2 Deletar specs obsoletos ✅ Concluída (16/07/2026)

Não há o que salvar — testam features removidas:

- `tests/e2e/dashboard.spec.ts` (419 linhas) — dashboard é `PlaceholderPage`; sem KPIs, ranking ou URL sync.
- `tests/e2e/report.spec.ts` (462) — navega para `/propriedades/:id/relatorio`, que hoje cai no fallback `*` → `/login`. Sem CSV/presets/filtros.
- `tests/e2e/consumption.spec.ts` (698) — consumo não tem mais create/edit/delete.
- `tests/e2e/alerts.spec.ts` (943) — modelo de alerta invertido por completo.

**Nota de implementação:** executado exatamente como planejado, sem desvios — 2.522 linhas / 29 testes removidos via `git rm`. Baseline pós-poda: 30 testes, 14 passando / 16 falhando (queda de 58 execuções, todas dentro dos 4 arquivos removidos; os 14 que já passavam antes seguem intactos). Detalhes da investigação de uma execução espúria intermediária no log.

### 1.3 Consertar os specs que sobrevivem

O CRUD de propriedade/área/dispositivo continua existindo; o que quebrou foi o entorno.

- `auth.spec.ts` ✅ **Concluído (16/07/2026)** — trocar os mocks locais pelos fixtures; `mockAppShellBackground` passa a cobrir firing/notifications (é o que conserta o teste de logout). ~~Ajustar a assertion pós-login: `/dashboard` hoje renderiza `PlaceholderPage` com `<h1>Olá, {firstName}!`.~~ **Não foi necessário** — o arquivo já asserta isso desde antes desta sub-issue. **Desvio adicional:** `mockAppShellBackground` de `support/` não mocka `GET /api/properties` (a versão local antiga mockava por causa do dashboard pré-Fase-5); confirmado que a `DashboardPage` atual (placeholder) não chama essa rota. 183→121 linhas, 10/10 testes verdes nos dois browsers, zero helper duplicado. Detalhes no log.
- `properties.spec.ts`, `area.spec.ts`, `device.spec.ts` ✅ **Concluído (16/07/2026)** — mesmo padrão em cada um:
  - `/api/properties`, `/api/properties/*/areas`, `/…/devices`, `/api/distributors` → envelope `Paginated<T>`.
  - Remover mocks de `**/api/properties/*/consumption` e `/api/properties/.../alerts` (não existem) e mockar no lugar `GET /api/meters/by-target?targetType&targetId` (404 → `null` é tratado pelo service) e `GET /api/consumption?targetType&targetId&granularity`.
  - `area.spec.ts` ainda mocka `**/api/alerts/stream` → é `/api/iot/stream`.
  - `PropertyDetailsPage` não tem mais AlertSection; a ordem é `PropertyHeaderCard → AreasSection → MeterSection → PropertyConsumptionSection`.

  **Nota de implementação:** executado como planejado, com os desvios abaixo (documentados também no log):
  - **`GET /api/consumption` não precisou ser mockado** — como `ConsumptionSection` só chama esse endpoint depois de confirmar (via `meters/by-target`) que o alvo tem medidor, mockar `by-target` como 404 já é suficiente; nenhum dos três specs testa medidor/consumo (fica para as sub-issues #7/#9).
  - **Bug de roteamento descoberto na verificação, não previsto no plano**: hooks paginados sempre enviam `?page=&pageSize=` (mesmo nos defaults), e globs sem tratar querystring (copiados literalmente dos specs antigos) deixaram de casar a URL real — a requisição vazava pro proxy do Vite (502). Corrigido trocando rotas de **listagem** para regex `(\?.*)?$` (rotas de detalhe, sem query params, continuam glob puro).
  - **`DeviceDetailsPage` perdeu os 2 placeholders "Alertas"/"Integração IoT"** — viraram `MeterSection` (h2 "Medidor") real; `device.spec.ts` ajustado.
  - **`properties.spec.ts`**: teste "sem distribuidora" reescrito — mensagem/link mudaram ("Catálogo de distribuidoras indisponível" → `/distribuidoras`, não mais `/distribuidoras/nova`).
- `distributors.spec.ts` ✅ **Concluído (16/07/2026)** — reduzir ao que existe: listagem read-only (`distributors-grid`, `distributor-card-${id}`, EmptyState "Catálogo indisponível"). Remover criar/editar/excluir e a mensagem de vínculo — `DistributorForm`/`DistributorMenu` foram deletados; o service só expõe `GET /distributors` e `GET /distributors/:id`.

  **Nota de implementação:** reescrito do zero (não editado incrementalmente) — o fluxo CRUD antigo não tinha estrutura aproveitável para um spec 100% leitura. 3 testes (listagem com dados, EmptyState, erro+retry — este último novo, sem equivalente no spec antigo). 6/6 verdes nos dois browsers de primeira (só `tsc`/`eslint` pegaram os dois erros de digitação cometidos). Detalhes no log.

Referências de mock e envelope: `src/pages/property/PropertyDetailsPage.test.tsx`, `AreaDetailsPage.test.tsx`, `DeviceDetailsPage.test.tsx`, `src/components/layout/AppShell.test.tsx` e `Header.test.tsx` (estes dois atualizados no próprio `2c9e9b1`).

---

## Fase 2 — Cobrir o novo modelo

Specs novos, um commit por spec:

- `alerts.spec.ts` ✅ **Concluído (17/07/2026)** — `/alertas`: criar/editar via `alert-form-dialog` (campos `alert-form-name`/`-meterId`/`-referencePowerKw`/`-tolerancePercent`/`-enabled`), toggle `PATCH /alerts/:id/enabled`, excluir, `alert-status-badge-${id}` firing/normal, histórico `AlertEventTable` via `GET /alert-events?alertId=`, paginação. Atenção: o select do form carrega `GET /meters?page=1&pageSize=31` (o backend limita `pageSize` a 31).

  **Nota de implementação:** 4 testes, 8/8 verdes nos dois browsers, 40/40 na suíte completa (32 anteriores + 8 novos). Único desvio: um bug no próprio spec (não no produto) — `page.keyboard.press("Escape")` não fecha `AlertRowMenu` (o componente só escuta clique fora via `mousedown`, sem handler de teclado); corrigido pra clicar fora de verdade. `ALERT_EVENT_1` adicionado a `support/fixtures.ts` (deferido desde a sub-issue #1, agora com consumidor). Detalhes no log.
- `consumption.spec.ts` ✅ **Concluído (17/07/2026)** — read-only: `granularity-tab-hour|day|month|year`, `consumption-table` com linhas `consumption-row-${bucketStart}` (a chave é o ISO do bucket, não um id), `consumption-chart`, EmptyStates "Sem consumo para exibir" (sem medidor) e "Sem leituras neste período".

  **Nota de implementação:** testado via `PropertyDetailsPage` (`DETAILS_GRANULARITIES` = hora|dia; os 4 níveis ficam para `/relatorios`, sub-issue #8). 4 testes, 8/8 verdes nos dois browsers de primeira (nenhuma correção precisou rodar contra o Playwright), 48/48 na suíte completa. Achado sem impacto em produção: `consumption-chart-empty` não é alcançável via `ConsumptionSection` — a seção nunca monta `ConsumptionChart` com array vazio (renderiza o EmptyState "Sem leituras" no lugar). Fixtures `BUCKET_HOUR_1/2`/`BUCKET_DAY_1/2` (existiam desde a sub-issue #1, sem consumidor) finalmente usados. Detalhes no log.
- `reports.spec.ts` — `/relatorios`: cascata `reports-property-select` → `reports-area-select` → `reports-device-select` e o `targetType` resultante (DEVICE > AREA > PROPERTY) na query de `/api/consumption`.
- `meter.spec.ts` — `MeterSection`: EmptyState "Nenhum medidor vinculado", criar via `meter-form-dialog`, `meter-connection-card`, remover (ConfirmDialog "Remover medidor").
- `realtime.spec.ts` — SSE por `page.route` com body `text/event-stream` scriptado: evento `reading` → `real-time-card` (e `real-time-card-stale` após 10s sem leitura); `alert-firing` → `warning-badge` aparece com `data-count` (o componente retorna `null` quando não há disparo); `notification` → toast + `notification-bell-count`.

Cobertura vitest inexistente hoje para `AlertsPage`, `ReportsPage`, `MeterSection`, `RealTimeCard`, `ConsumptionSection`, `NotificationDropdown`, `WarningBadge`, `AlertEventTable`, `appStream` e `RealtimeContext` — ou seja, a confiança nessas telas depende inteiramente destes e2e.

---

## Verificação

Os browsers do Playwright foram instalados em 15/07/2026 (~938MB em `~/.cache/ms-playwright`) — a rede restrita que impediu isso durante toda a reformulação IoT e o simulador (três logs registram a limitação) não está mais bloqueando. A suíte roda de verdade nos dois browsers neste ambiente:

```bash
cd frontend
npx playwright install chromium firefox                # ~938MB, uma vez (já feito)
npx playwright test --project=chromium                 # ciclo rápido durante o trabalho
CI=true npx playwright test                            # fiel ao CI: build+preview, 2 browsers, retries
```

`--with-deps` **falha** neste ambiente (troca para root via `sudo`, sem terminal para a senha); sem a flag funciona, porque as libs de sistema já estão presentes.

`CI=true` é o que importa antes de abrir PR: muda o `webServer` de `vite dev` para `npm run build && npm run preview` (sem StrictMode, sem DevTools) e liga `retries: 2` — é a configuração que roda no GitHub Actions.

**`CI=true` sozinho não reproduz o CI** (descoberto na sub-issue 1.1, ver log): o job `e2e` sobe um **backend real** (Postgres + `npm run dev`) antes do Playwright, e a variável só controla `webServer`/`retries`. Sem backend local, uma rota não mockada dá `ECONNREFUSED` em vez de `401` — e é o 401 que dispara `lumitrack:unauthorized` → redirect para `/login`. Por isso o baseline local era 74 quebrados/14 passando contra 80/8 no CI no início da Fase 1: 3 testes (×2 browsers) passavam localmente por acidente.

**Ressalva fechada ao final da sub-issue #5**: com todas as rotas de fundo corretamente mockadas (o próprio objetivo da Fase 1), rodar a suíte com o backend local de pé (`cd backend && npm run dev`, Postgres de dev já seedado) deu **32/32**, idêntico ao resultado sem backend. Os dois ambientes convergem de verdade agora — não por coincidência, porque nenhuma requisição vaza mais para a rede real.

**Fase 1 completa**: suíte inteira verde nos dois browsers (32/32), com os 4 specs obsoletos removidos e verificação dupla (com e sem backend real).
