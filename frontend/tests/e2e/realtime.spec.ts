import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockSseStream, sseEvent } from "./support/sse"
import { ALERT_1, DIST_CEMIG, METER_1, PROP_1 } from "./support/fixtures"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * SSE (`/api/iot/stream`, `RealtimeContext` → `createAppStream`) — os três
 * eventos que o backend emite além de `connected`:
 *   - `reading`      → `MeterSection` (via `readingsByMeterId` de
 *     `useRealtime()`) — a leitura entra inline no card do medidor
 *     (`meter-connection-card`/`meter-status-stale`), não mais no
 *     antigo `RealTimeCard` (removido)
 *   - `alert-firing` → invalida `alerts.firing`/`alerts.all` (o REST
 *     re-resolve status/target; SSE só avisa "algo mudou")
 *   - `notification` → escreve direto no cache de `notifications.list` +
 *     toast (sonner)
 *
 * `page.route().fulfill()` entrega o corpo inteiro de uma vez (não há como
 * simular "chegam mais bytes na mesma conexão, depois de um tempo" com a
 * API pública de mock do Playwright) — por isso o evento fica todo no corpo
 * inicial da resposta, e a passagem de tempo (para o caso "stale") é
 * simulada com `page.clock`, nunca com espera real.
 *
 * `sseEvent`/`mockSseStream` vêm de `./support/sse` — ver ali o porquê da
 * janela de graça contra o duplo-mount do `React.StrictMode`.
 */

const CLOCK_TIME = "2026-07-17T12:00:00.000Z"

/** Medidor de nível PROPERTY (METER_1 é DEVICE por fixture — o mock não
 * precisa manter a consistência do alvo, só o `id` bater com o `meterId`
 * do evento `reading`). */
const PROPERTY_METER = {
    ...METER_1,
    targetType: "PROPERTY" as const,
    propertyId: PROP_1.id,
    deviceId: null,
}

const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, PROP_1)
        }
        return route.continue()
    })
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillJson(route, PROPERTY_METER),
    )
    // Card "Consumo em tempo real" — monta na mesma página
    // sempre que há medidor, como PROPERTY_METER acima sempre garante.
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )
}

test.describe("SSE — RealtimeContext (reading, alert-firing, notification)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("reading atualiza o card do medidor e fica stale após 10s sem nova leitura, com relógio controlado", async ({
        page,
    }) => {
        await page.clock.install({ time: new Date(CLOCK_TIME) })
        await setupAuthAndProperty(page)

        const streamBody =
            sseEvent("connected", { meterCount: 1 }) +
            sseEvent("reading", {
                meterId: PROPERTY_METER.id,
                voltage: 220,
                current: 5,
                powerW: 950,
                powerFactor: 0.95,
                receivedAt: CLOCK_TIME,
            })
        await mockSseStream(page, streamBody)

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // `meter-connection-card` é só a linha de nome+status — o footer de
        // 3 colunas (Potência/Tensão/Corrente) é irmão dela, não filho.
        // `meter-section` (a `<section>` inteira) cobre os dois.
        const section = page.getByTestId("meter-section")
        const card = page.getByTestId("meter-connection-card")
        await expect(card).toBeVisible()
        await expect(card.getByText(/^conectado$/i)).toBeVisible()
        await expect(section.getByText("220,00V")).toBeVisible()
        await expect(section.getByText("5,00A")).toBeVisible()
        // Potência do footer de MeterSection é em kW (formatPowerKw), não em
        // W como o antigo RealTimeCard — 950W → 0,95kW. Escopado à section:
        // o KPI "Potência agora" do topo da página mostra o mesmo valor, e
        // `getByText` sem escopo bate nos dois (strict mode violation).
        await expect(section.getByText("0,95kW")).toBeVisible()
        await expect(page.getByTestId("meter-status-stale")).toHaveCount(0)

        // Avança o relógio da página (não espera de verdade) além do limiar
        // de 10s sem leitura nova — o `setInterval` de 2s de MeterSection
        // dispara dentro do próprio fast-forward e recalcula "now".
        await page.clock.fastForward(11_000)

        await expect(page.getByTestId("meter-status-stale")).toBeVisible()
        await expect(page.getByText(/sem leitura recente/i)).toBeVisible()
    })

    test("sem alertas em disparo, o WarningBadge fica visível sem contador", async ({ page }) => {
        await setupAuthAndProperty(page)
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))
        await page.route(/\/api\/alerts\/firing(\?.*)?$/, (route) => fulfillJson(route, []))

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // Sanity de que a página terminou de montar antes de checar o
        // estado do badge (o card do medidor é o sinal mais confiável).
        await expect(page.getByTestId("meter-connection-card")).toBeVisible()
        // O ícone é chrome persistente do Header (LumiTrack Home.dc.html,
        // linhas 90-93) — sempre visível; só o contador some quando não há
        // disparo.
        await expect(page.getByTestId("warning-badge")).toBeVisible()
        await expect(page.getByTestId("warning-badge")).toHaveAttribute("data-count", "0")
        await expect(page.getByTestId("warning-badge-count")).toHaveCount(0)
    })

    test("alert-firing dispara o WarningBadge com a contagem certa", async ({ page }) => {
        await setupAuthAndProperty(page)

        const streamBody =
            sseEvent("connected", { meterCount: 1 }) +
            sseEvent("alert-firing", {
                type: "start",
                alertId: ALERT_1.id,
                alertName: ALERT_1.name,
                meterId: PROPERTY_METER.id,
                startedAt: CLOCK_TIME,
            })

        // O SSE não carrega o payload novo — só invalida a query, que
        // refaz o GET. 1ª chamada (mount) vazia; da 2ª em diante, com o
        // alerta em disparo.
        //
        // Ordem garantida explicitamente, sem depender de timing: a conexão
        // SSE só é respondida DEPOIS que a 1ª chamada de /alerts/firing (a
        // de montagem) já foi respondida. Sem isso, sob carga pesada, a
        // conexão SSE pode "vencer a corrida" contra o fetch de montagem —
        // `invalidateQueries` numa query que ainda está em andamento não
        // garante uma segunda ida à rede, e o teste passa a depender de
        // timing: rodando a suíte inteira em paralelo, esse problema não
        // reproduzia isolado.
        let resolveFirstFiringCall: () => void
        const firstFiringCallDone = new Promise<void>((resolve) => {
            resolveFirstFiringCall = resolve
        })

        let firingCalls = 0
        await page.route(/\/api\/alerts\/firing(\?.*)?$/, async (route) => {
            firingCalls += 1
            const alerts = firingCalls === 1 ? [] : [{ ...ALERT_1, status: "firing" }]
            await fulfillJson(route, alerts)
            if (firingCalls === 1) resolveFirstFiringCall()
        })

        await page.route("**/api/iot/stream", async (route) => {
            await firstFiringCallDone
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: streamBody,
            })
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        const badge = page.getByTestId("warning-badge")
        await expect(badge).toBeVisible()
        await expect(badge).toHaveAttribute("data-count", "1")
        await expect(badge).toHaveAttribute("aria-label", /1 alerta em disparo/i)
    })

    test("notification dispara toast, atualiza o contador do sino e pode ser descartada", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)

        const notification = {
            id: "notif-1",
            alertId: ALERT_1.id,
            alertName: ALERT_1.name,
            meterId: PROPERTY_METER.id,
            targetType: "PROPERTY" as const,
            targetPath: "/propriedades/prop-1",
            message: "Alerta Geladeira fora da faixa foi disparado. Clique aqui para ver.",
            createdAt: CLOCK_TIME,
        }

        const streamBody =
            sseEvent("connected", { meterCount: 1 }) + sseEvent("notification", notification)

        // Estado mutável usado por QUALQUER GET a partir de agora — não só a
        // hidratação inicial. `refetchOnWindowFocus: true` (queryClient)
        // refaz a query em qualquer foco de janela, inclusive o clique no
        // botão "Close toast" logo abaixo. Começa vazio (hidratação inicial,
        // antes do SSE ter entregue o evento) e só passa a incluir a
        // notificação depois que a assertion do toast já confirmou que o
        // `RealtimeContext` escreveu no cache via SSE — daí em diante, um
        // refetch por foco de janela encontra a MESMA notificação já
        // presente (substitui o cache por um valor igual, sem duplicar).
        let notifications: (typeof notification)[] = []

        // Ordem garantida explicitamente, sem depender de timing: a conexão
        // SSE só é respondida DEPOIS que a 1ª chamada de `GET /api/notifications`
        // (a de montagem) já foi respondida. Sem isso, sob carga pesada, o
        // evento `notification` pode chegar (e escrever `[notification]` no
        // cache via `setQueryData`) ANTES da busca de montagem resolver — e
        // quando essa busca finalmente resolve com `[]` (o estado antigo do
        // mock), ela sobrescreve o que o SSE acabou de escrever. Mesma causa
        // raiz do desvio já corrigido no teste de `alert-firing`.
        let resolveFirstNotificationsCall: () => void
        const firstNotificationsCallDone = new Promise<void>((resolve) => {
            resolveFirstNotificationsCall = resolve
        })
        let notificationsCalls = 0
        await page.route(/\/api\/notifications(\?.*)?$/, async (route) => {
            if (route.request().method() === "GET") {
                notificationsCalls += 1
                await fulfillJson(route, notifications)
                if (notificationsCalls === 1) resolveFirstNotificationsCall()
                return
            }
            return route.continue()
        })
        await page.route(`**/api/notifications/${notification.id}`, (route) => {
            if (route.request().method() === "DELETE") {
                notifications = notifications.filter((n) => n.id !== notification.id)
                return route.fulfill({ status: 204 })
            }
            return route.continue()
        })
        await page.route("**/api/iot/stream", async (route) => {
            await firstNotificationsCallDone
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: streamBody,
            })
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // Toast (sonner) com a mensagem da notificação — confirma que o
        // evento SSE já foi processado e o cache já tem a notificação.
        await expect(page.getByText(notification.message)).toBeVisible()
        notifications = [notification]

        // Fecha o toast explicitamente (botão "Close toast", sonner com
        // closeButton habilitado em App.tsx) — sem isso, ele fica sobreposto
        // ao sino por até `duration: 10_000` (RealtimeContext), e o clique
        // no sino ficaria retentando até o auto-dismiss em vez de agir.
        await page.getByRole("button", { name: "Close toast" }).click()

        // Sino com contador
        const bell = page.getByTestId("notification-bell")
        await expect(bell).toHaveAttribute("data-count", "1")
        await expect(page.getByTestId("notification-bell-count")).toHaveText("1")

        // Abre o dropdown e vê o item
        await bell.click()
        await expect(page.getByTestId("notification-dropdown")).toBeVisible()
        await expect(page.getByTestId(`notification-item-${notification.id}`)).toContainText(
            notification.message,
        )

        // Descarta ("marcar como lida" = excluir) — o mesmo handler de GET
        // já reflete `notifications` atualizado na invalidação que segue.
        await page.getByTestId(`notification-dismiss-${notification.id}`).click()

        await expect(bell).toHaveAttribute("data-count", "0")
        await expect(page.getByTestId("notification-bell-count")).toHaveCount(0)
    })
})
