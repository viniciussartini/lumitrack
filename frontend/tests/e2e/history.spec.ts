import { test, expect, type Page } from "@playwright/test"

import { fulfillJson } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockPropertyTree } from "./support/propertyTree"

/**
 * E2E de `/historico`: formulário "Nova comparação" (alvo, grandeza e dois
 * períodos). Backend mockado via `page.route()`, como nos demais specs.
 */

const bucket = (avg: number) => ({
    bucketStart: "2026-01-01T03:00:00.000Z",
    min: avg,
    avg,
    max: avg,
})
const period = (base: number) => ({
    from: "2026-01-01T03:00:00.000Z",
    to: "2026-01-08T03:00:00.000Z",
    items: Array.from({ length: 7 }, (_, i) => bucket(base + i)),
    summary: { min: base, avg: base + 3, max: base + 6 },
})

const setupApp = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)
    await page.route(/\/api\/meter-readings\/compare-periods(\?.*)?$/, (route) =>
        fulfillJson(route, {
            metric: "fp",
            granularity: "day",
            periodA: period(0.9),
            periodB: period(0.8),
            diff: { absolute: -0.1, percent: -11.1 },
        }),
    )
}

const fillPeriod = async (
    page: Page,
    name: "Período A" | "Período B",
    start: string,
    end: string,
) => {
    const group = page.getByRole("group", { name })
    await group.getByLabel("Início").fill(start)
    await group.getByLabel("Fim").fill(end)
}

test.describe("Histórico e comparações", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("o item Histórico da sidebar abre a página com o formulário e o texto de espera", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/dashboard")
        await hideDevTools(page)

        await page.getByRole("link", { name: "Histórico", exact: true }).click()

        await expect(page).toHaveURL(/\/historico$/)
        await expect(
            page.getByRole("heading", { name: "Histórico e comparações", level: 1 }),
        ).toBeVisible()
        await expect(page.getByLabel("Alvo")).toBeVisible()
        await expect(page.getByLabel("Grandeza medida")).toBeVisible()
        await expect(page.getByTestId("history-idle")).toBeVisible()
    })

    test("durações diferentes explicam o motivo e bloqueiam o envio; corrigir libera", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/historico")
        await hideDevTools(page)

        await fillPeriod(page, "Período A", "2026-01-01", "2026-01-07")
        await fillPeriod(page, "Período B", "2026-02-01", "2026-02-10")

        await expect(page.getByRole("alert")).toContainText(
            "Os dois períodos devem ter a mesma duração (A: 7 dias, B: 10 dias).",
        )
        await expect(page.getByRole("button", { name: "Criar comparação" })).toBeDisabled()

        await page.getByRole("group", { name: "Período B" }).getByLabel("Fim").fill("2026-02-07")

        await expect(page.getByRole("alert")).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Criar comparação" })).toBeEnabled()
    })

    test("períodos válidos: criar a comparação mostra o gráfico com a legenda A/B", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/historico")
        await hideDevTools(page)

        await page.getByLabel("Grandeza medida").selectOption("fp")
        await fillPeriod(page, "Período A", "2026-01-01", "2026-01-07")
        await fillPeriod(page, "Período B", "2026-02-01", "2026-02-07")
        await page.getByRole("button", { name: "Criar comparação" }).click()

        await expect(page.getByTestId("period-comparison-chart")).toBeVisible()
        // Uma linha por período — o gráfico realmente desenha as duas séries.
        await expect(page.locator(".recharts-line-curve")).toHaveCount(2)
        await expect(page.getByText("A · 01/01/2026 – 07/01/2026")).toBeVisible()
        await expect(page.getByText("B · 01/02/2026 – 07/02/2026")).toBeVisible()
        await expect(page.getByTestId("history-idle")).toHaveCount(0)
    })
})
