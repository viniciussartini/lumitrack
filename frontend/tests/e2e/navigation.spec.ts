import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { DIST_CEMIG, PROP_1 } from "./support/fixtures"

/**
 * E2E da navegação do app autenticado: itens da sidebar, item ativo nas
 * rotas filhas de Análise e a rota removida de Simulações. Backend mockado
 * via `page.route()`, como nos demais specs.
 */

const TARIFF_FLAG = {
    currentFlag: "GREEN" as const,
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.88,
    redP1Per100Kwh: 4.46,
    redP2Per100Kwh: 7.87,
    updatedAt: new Date().toISOString(),
}

const setupApp = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, [PROP_1]) : route.fallback(),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    await page.route("**/api/properties/prop-1", (route) => fulfillJson(route, PROP_1))
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [] }),
    )
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )
    await page.route(/\/api\/tariff-flag(\?.*)?$/, (route) => fulfillJson(route, TARIFF_FLAG))
}

test.describe("Navegação do app autenticado", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("a sidebar mostra Painel, Análise, Relatórios, Alertas, Distribuidoras e Sobre", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/propriedades")
        await hideDevTools(page)

        const links = page
            .getByRole("complementary", { name: /navegação principal/i })
            .getByRole("navigation")
            .getByRole("link")
        await expect(links).toHaveText([
            "Painel",
            "Análise",
            "Relatórios",
            "Alertas",
            "Distribuidoras",
            "Sobre o projeto",
        ])
        await expect(page.getByRole("link", { name: /simulações/i })).toHaveCount(0)
    })

    test("Análise segue ativa ao entrar no detalhe da propriedade", async ({ page }) => {
        await setupApp(page)
        await page.goto("/propriedades")
        await hideDevTools(page)

        const analise = page.getByRole("link", { name: "Análise", exact: true })
        await expect(
            page.getByRole("heading", { name: /análise de propriedades/i, level: 1 }),
        ).toBeVisible()
        await expect(analise).toHaveAttribute("aria-current", "page")

        await page.goto("/propriedades/prop-1")
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(analise).toHaveAttribute("aria-current", "page")
    })

    test("/simulacao não existe mais e cai no Painel", async ({ page }) => {
        await setupApp(page)
        await page.goto("/simulacao")

        await expect(page).toHaveURL(/\/dashboard$/)
    })
})
