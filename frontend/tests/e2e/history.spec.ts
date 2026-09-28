import { test, expect, type Page } from "@playwright/test"

import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockPropertyTree } from "./support/propertyTree"

/**
 * E2E de `/historico`: formulário "Nova comparação" (alvo, grandeza e dois
 * períodos). Backend mockado via `page.route()`, como nos demais specs.
 */

const setupApp = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)
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

    test("períodos válidos: criar a comparação tira o texto de espera", async ({ page }) => {
        await setupApp(page)
        await page.goto("/historico")
        await hideDevTools(page)

        await page.getByLabel("Grandeza medida").selectOption("fp")
        await fillPeriod(page, "Período A", "2026-01-01", "2026-01-07")
        await fillPeriod(page, "Período B", "2026-02-01", "2026-02-07")
        await page.getByRole("button", { name: "Criar comparação" }).click()

        await expect(page.getByTestId("history-idle")).toHaveCount(0)
    })
})
