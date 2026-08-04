import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { DIST_CEMIG, METER_1, PROP_1 } from "./support/fixtures"

/**
 * E2E do Painel (#116/#117) — igual a `realtime.spec.ts`: mocka o backend
 * via `page.route()`, sem depender do backend rodando.
 *
 * `#115` (seletor de propriedade) já é exercitado aqui de passagem — é o
 * primeiro E2E da rota `/dashboard`, então cobre também o caminho até
 * chegar na propriedade com o KPI.
 */

const sseEvent = (event: string, data: unknown) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** Medidor de nível PROPERTY vinculado diretamente a PROP_1 (ver nota de
 * design de #116: KPIs usam só o medidor direto da propriedade, sem somar
 * Área/Dispositivo). */
const PROPERTY_METER = { ...METER_1, targetType: "PROPERTY" as const, propertyId: PROP_1.id, deviceId: null }

const TARIFF_FLAG = {
    currentFlag: "YELLOW" as const,
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.88,
    redP1Per100Kwh: 4.46,
    redP2Per100Kwh: 7.87,
    updatedAt: new Date().toISOString(),
}

/**
 * `route.fulfill()` entrega o corpo inteiro e fecha a conexão — reconexões
 * automáticas da lib `fetch-event-source` reentregariam o mesmo corpo se não
 * tratado. Só a primeira conexão recebe o script.
 */
const mockSseStream = async (page: Page, initialBody: string) => {
    let alreadyConnected = false
    await page.route("**/api/iot/stream", (route) => {
        const body = alreadyConnected
            ? sseEvent("connected", { meterCount: 1 })
            : initialBody
        alreadyConnected = true
        return route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body,
        })
    })
}

const setupDashboard = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route(/\/api\/consumption(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
    await page.route(/\/api\/tariff-flag(\?.*)?$/, (route) =>
        fulfillJson(route, TARIFF_FLAG),
    )
}

test.describe("Painel — visão em tempo real (#116)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("propriedade com medidor recebe leitura ao vivo e mostra Potência agora", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )

        const streamBody =
            sseEvent("connected", { meterCount: 1 }) +
            sseEvent("reading", {
                meterId: PROPERTY_METER.id,
                voltage: 220,
                current: 5,
                powerW: 950,
                powerFactor: 0.95,
                receivedAt: new Date().toISOString(),
            })
        await mockSseStream(page, streamBody)

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByTestId("property-selector")).toBeVisible()
        // Card único "Potência agora" + custo estimado (#117 corrige a
        // divisão em 2 cards de #116 — handoff é 1 card com 2 linhas).
        await expect(page.getByText("0,95kW")).toBeVisible()
        await expect(page.getByTestId("realtime-power-chart")).toBeVisible()
    })

    test("mostra Consumo hoje/Custo projetado do mês e a bandeira vigente destacada (#117)", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const granularity = url.searchParams.get("granularity")
            if (granularity === "day") {
                return fulfillPaginated(route, [
                    { bucketStart: new Date().toISOString(), kwhConsumed: 12, costBrl: 9.6, avgPowerW: 500 },
                ])
            }
            return fulfillPaginated(route, [])
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByText("12,00kWh")).toBeVisible()

        const flagCard = page.getByTestId("tariff-flag-list-card")
        await expect(flagCard).toBeVisible()
        await expect(flagCard.getByText("Bandeiras tarifárias")).toBeVisible()

        const currentRow = page.getByTestId("tariff-flag-row-YELLOW")
        await expect(currentRow).toContainText("Vigente")
        await expect(currentRow).toContainText("Amarela")
    })

    test("propriedade sem medidor vinculado mostra estado vazio com link pra propriedade", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({ status: "error", message: "Alvo sem medidor vinculado" }),
            }),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(
            page.getByText(/não tem medidor vinculado/i),
        ).toBeVisible()
        await expect(
            page.getByRole("link", { name: /ver propriedade/i }),
        ).toHaveAttribute("href", `/propriedades/${PROP_1.id}`)
    })

    test("troca a janela do gráfico entre 'Última hora' e '24 horas'", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const btn1h = page.getByTestId("realtime-window-1h")
        const btn24h = page.getByTestId("realtime-window-24h")
        await expect(btn1h).toHaveAttribute("aria-selected", "true")

        await btn24h.click()
        await expect(btn24h).toHaveAttribute("aria-selected", "true")
        await expect(btn1h).toHaveAttribute("aria-selected", "false")
    })
})
