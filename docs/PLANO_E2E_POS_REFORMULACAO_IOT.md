# Plano — Atualização da suíte e2e (Playwright) para o modelo de medidores IoT

> **Status:** planejado, não iniciado. Resolve a pendência conhecida registrada em [PLANO_REFORMULACAO_IOT.md](./PLANO_REFORMULACAO_IOT.md) ("suíte Playwright (`frontend/tests/e2e/`) ainda não foi atualizada para o novo modelo").
>
> **Data do planejamento:** 15/07/2026.
>
> **Branch:** `test/e2e-rework-iot`.

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

### 1.1 Fixtures compartilhados — `frontend/tests/e2e/support/`

- `support/api.ts` — `fulfillJson(route, data, status?)`, `fulfillError(route, message, status)` e `fulfillPaginated(route, items, {page,pageSize,total}?)` montando `{status:"success",data:{items,total,page,pageSize}}` conforme `src/types/pagination.types.ts`.
- `support/appShell.ts` — `mockAppShellBackground(page)` cobrindo **as quatro** chamadas de fundo: `GET /api/alerts` (regex `/\/api\/alerts(\?.*)?$/`, para não capturar `/api/alerts/:id`), `GET /api/alerts/firing` (array cru, **não** paginado), `GET /api/notifications` (array cru), `GET /api/iot/stream` (`text/event-stream`, body vazio). Mais `setupAuth(page, user?)` mockando `GET /api/auth/me`.
- `support/fixtures.ts` — `FAKE_USER`, `DIST_CEMIG`, `PROP_1`, `AREA_1`, `DEVICE_1`, `METER_1`, `BUCKET_*`. Espelhar os shapes já validados nos testes de service (`src/services/alert.service.test.ts` para `AlertWithStatus`, `src/services/consumption.service.test.ts` para `ConsumptionBucket`) — são a fonte de verdade do contrato.
- `support/devtools.ts` — `hideDevTools(page)` (injeta CSS ocultando `.tsqd-parent-container`). Manter: o DevTools é gated por `import.meta.env.DEV`, some no `preview` do CI mas existe no `dev` local.

### 1.2 Deletar specs obsoletos

Não há o que salvar — testam features removidas:

- `tests/e2e/dashboard.spec.ts` (419 linhas) — dashboard é `PlaceholderPage`; sem KPIs, ranking ou URL sync.
- `tests/e2e/report.spec.ts` (462) — navega para `/propriedades/:id/relatorio`, que hoje cai no fallback `*` → `/login`. Sem CSV/presets/filtros.
- `tests/e2e/consumption.spec.ts` (698) — consumo não tem mais create/edit/delete.
- `tests/e2e/alerts.spec.ts` (943) — modelo de alerta invertido por completo.

### 1.3 Consertar os specs que sobrevivem

O CRUD de propriedade/área/dispositivo continua existindo; o que quebrou foi o entorno.

- `auth.spec.ts` — trocar os mocks locais pelos fixtures; `mockAppShellBackground` passa a cobrir firing/notifications (é o que conserta o teste de logout). Ajustar a assertion pós-login: `/dashboard` hoje renderiza `PlaceholderPage` com `<h1>Olá, {firstName}!`.
- `properties.spec.ts`, `area.spec.ts`, `device.spec.ts` — mesmo padrão em cada um:
  - `/api/properties`, `/api/properties/*/areas`, `/…/devices`, `/api/distributors` → envelope `Paginated<T>`.
  - Remover mocks de `**/api/properties/*/consumption` e `/api/properties/.../alerts` (não existem) e mockar no lugar `GET /api/meters/by-target?targetType&targetId` (404 → `null` é tratado pelo service) e `GET /api/consumption?targetType&targetId&granularity`.
  - `area.spec.ts` ainda mocka `**/api/alerts/stream` → é `/api/iot/stream`.
  - `PropertyDetailsPage` não tem mais AlertSection; a ordem é `PropertyHeaderCard → AreasSection → MeterSection → PropertyConsumptionSection`.
- `distributors.spec.ts` — reduzir ao que existe: listagem read-only (`distributors-grid`, `distributor-card-${id}`, EmptyState "Catálogo indisponível"). Remover criar/editar/excluir e a mensagem de vínculo — `DistributorForm`/`DistributorMenu` foram deletados; o service só expõe `GET /distributors` e `GET /distributors/:id`.

Referências de mock e envelope: `src/pages/property/PropertyDetailsPage.test.tsx`, `AreaDetailsPage.test.tsx`, `DeviceDetailsPage.test.tsx`, `src/components/layout/AppShell.test.tsx` e `Header.test.tsx` (estes dois atualizados no próprio `2c9e9b1`).

---

## Fase 2 — Cobrir o novo modelo

Specs novos, um commit por spec:

- `alerts.spec.ts` — `/alertas`: criar/editar via `alert-form-dialog` (campos `alert-form-name`/`-meterId`/`-referencePowerKw`/`-tolerancePercent`/`-enabled`), toggle `PATCH /alerts/:id/enabled`, excluir, `alert-status-badge-${id}` firing/normal, histórico `AlertEventTable` via `GET /alert-events?alertId=`, paginação. Atenção: o select do form carrega `GET /meters?page=1&pageSize=31` (o backend limita `pageSize` a 31).
- `consumption.spec.ts` — read-only: `granularity-tab-hour|day|month|year`, `consumption-table` com linhas `consumption-row-${bucketStart}` (a chave é o ISO do bucket, não um id), `consumption-chart`, EmptyStates "Sem consumo para exibir" (sem medidor) e "Sem leituras neste período".
- `reports.spec.ts` — `/relatorios`: cascata `reports-property-select` → `reports-area-select` → `reports-device-select` e o `targetType` resultante (DEVICE > AREA > PROPERTY) na query de `/api/consumption`.
- `meter.spec.ts` — `MeterSection`: EmptyState "Nenhum medidor vinculado", criar via `meter-form-dialog`, `meter-connection-card`, remover (ConfirmDialog "Remover medidor").
- `realtime.spec.ts` — SSE por `page.route` com body `text/event-stream` scriptado: evento `reading` → `real-time-card` (e `real-time-card-stale` após 10s sem leitura); `alert-firing` → `warning-badge` aparece com `data-count` (o componente retorna `null` quando não há disparo); `notification` → toast + `notification-bell-count`.

Cobertura vitest inexistente hoje para `AlertsPage`, `ReportsPage`, `MeterSection`, `RealTimeCard`, `ConsumptionSection`, `NotificationDropdown`, `WarningBadge`, `AlertEventTable`, `appStream` e `RealtimeContext` — ou seja, a confiança nessas telas depende inteiramente destes e2e.

---

## Verificação

Os browsers do Playwright não estão instalados no ambiente de dev (`~/.cache/ms-playwright` vazio):

```bash
cd frontend
npx playwright install --with-deps chromium firefox   # ~400MB, uma vez
npx playwright test --project=chromium                 # ciclo rápido durante o trabalho
CI=true npx playwright test                            # fiel ao CI: build+preview, 2 browsers, retries
```

`CI=true` é o que importa antes de abrir PR: muda o `webServer` de `vite dev` para `npm run build && npm run preview` (sem StrictMode, sem DevTools) e liga `retries: 2` — é a configuração que roda no GitHub Actions.

Ao fim da Fase 1 o esperado é a suíte inteira verde nos dois browsers, com os 4 specs obsoletos removidos.
