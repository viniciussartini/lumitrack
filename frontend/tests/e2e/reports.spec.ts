import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockPropertyTree } from "./support/propertyTree"

/**
 * E2E de `/relatorios`: emissão sob demanda de um relatório em PDF ou CSV.
 * Backend mockado via `page.route()`, como nos demais specs — o download
 * usa um corpo fixo, o conteúdo real do arquivo é coberto pelos testes do
 * backend.
 */

const REPORT = {
    id: "rep-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "MONTHLY",
    format: "PDF",
    origin: "MANUAL",
    periodStart: "2026-07-01T03:00:00.000Z",
    periodEnd: "2026-08-01T03:00:00.000Z",
    fileName: "lumitrack-relatorio-monthly-2026-07.pdf",
    sizeBytes: 4,
    createdAt: "2026-08-01T09:00:00.000Z",
}

const setupApp = async (page: Page, onCreate?: (body: unknown) => void) => {
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)

    // O histórico é a lista servida em memória: emitir acrescenta, excluir remove.
    let history: (typeof REPORT)[] = []
    await page.route(/\/api\/reports(\?.*)?$/, (route) => {
        if (route.request().method() === "POST") {
            onCreate?.(route.request().postDataJSON())
            history = [REPORT, ...history]
            return fulfillJson(route, REPORT, 201)
        }
        return fulfillPaginated(route, history)
    })
    await page.route(/\/api\/reports\/rep-1$/, (route) => {
        history = []
        return route.fulfill({ status: 204 })
    })
    await page.route(/\/api\/reports\/rep-1\/download$/, (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/pdf",
            headers: { "Content-Disposition": `attachment; filename="${REPORT.fileName}"` },
            body: "%PDF",
        }),
    )
}

test.describe("Relatórios (/relatorios)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("abre com o formulário de emissão: escopo, tipo mensal, mês e formato PDF", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/relatorios")
        await hideDevTools(page)

        await expect(page.getByRole("heading", { name: /^relatórios$/i, level: 1 })).toBeVisible()
        await expect(page.getByLabel("Escopo")).toBeVisible()
        await expect(page.getByLabel("Tipo de relatório")).toHaveValue("MONTHLY")
        await expect(page.getByLabel("Mês")).toBeVisible()
        await expect(page.getByRole("button", { name: "PDF" })).toHaveAttribute(
            "aria-pressed",
            "true",
        )
        await expect(page.getByTestId("report-generated")).toHaveCount(0)
    })

    test("gera o relatório e baixa o arquivo", async ({ page }) => {
        let created: unknown
        await setupApp(page, (body) => {
            created = body
        })
        await page.goto("/relatorios")
        await hideDevTools(page)

        await page.getByRole("button", { name: "CSV" }).click()
        await page.getByRole("button", { name: /Gerar relatório/i }).click()

        await expect(page.getByTestId("report-generated")).toContainText(REPORT.fileName)
        expect(created).toMatchObject({
            type: "MONTHLY",
            targetType: "PROPERTY",
            targetId: "prop-1",
            format: "CSV",
        })

        const downloadPromise = page.waitForEvent("download")
        await page.getByTestId("report-generated").getByRole("button", { name: "Baixar" }).click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe(REPORT.fileName)
    })

    test("relatório de consumo: período inválido explica o motivo e bloqueia o envio", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/relatorios")
        await hideDevTools(page)

        await page.getByLabel("Tipo de relatório").selectOption("CONSUMPTION")
        const submit = page.getByRole("button", { name: /Gerar relatório/i })
        await expect(submit).toBeDisabled()

        await page.getByLabel("Início").fill("2026-07-07")
        await page.getByLabel("Fim").fill("2026-07-01")
        await expect(page.getByRole("alert")).toContainText("anterior ao início")
        await expect(submit).toBeDisabled()

        await page.getByLabel("Fim").fill("2026-07-09")
        await expect(page.getByRole("alert")).toHaveCount(0)
        await expect(submit).toBeEnabled()
    })

    test("o histórico lista o relatório gerado, baixa e exclui com confirmação", async ({
        page,
    }) => {
        await setupApp(page)
        await page.goto("/relatorios")
        await hideDevTools(page)

        const history = page.getByTestId("report-history")
        await expect(history.getByText("Nenhum relatório gerado até agora.")).toBeVisible()

        await page.getByRole("button", { name: /Gerar relatório/i }).click()
        await expect(history.getByText(/^Mensal · Casa Principal · /)).toBeVisible()

        const downloadPromise = page.waitForEvent("download")
        await history.getByRole("button", { name: /^Baixar/ }).click()
        expect((await downloadPromise).suggestedFilename()).toBe(REPORT.fileName)

        await history.getByRole("button", { name: /^Excluir/ }).click()
        await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click()
        await expect(history.getByText("Nenhum relatório gerado até agora.")).toBeVisible()
    })
})
