import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockPropertyTree } from "./support/propertyTree"

/**
 * E2E de Configurações → Relatórios: criar, listar, editar e excluir
 * configurações de envio automático. Backend mockado via `page.route()`,
 * como nos demais specs — a lista é mantida em memória.
 */

type Schedule = {
    id: string
    targetType: string
    targetId: string
    type: string
    format: string
    frequency: string
    sendDay: number | null
    recipients: string[]
    active: boolean
    nextRunAt: string | null
    createdAt: string
    updatedAt: string
}

const setupApp = async (page: Page, onWrite?: (body: unknown) => void) => {
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)
    // A sub-navegação parte do Cadastro, que lista distribuidoras e propriedades;
    // sem estes mocks as chamadas vazam para o backend real e o 401 leva ao login.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, []) : route.fallback(),
    )

    let schedules: Schedule[] = []
    await page.route(/\/api\/report-schedules(\?.*)?$/, (route) => {
        if (route.request().method() === "POST") {
            const body = route.request().postDataJSON() as Omit<Schedule, "id">
            onWrite?.(body)
            const created: Schedule = {
                ...body,
                id: "sch-1",
                nextRunAt: "2026-08-05T09:00:00.000Z",
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
            }
            schedules = [created]
            return fulfillJson(route, created, 201)
        }
        return fulfillPaginated(route, schedules)
    })
    await page.route(/\/api\/report-schedules\/sch-1$/, (route) => {
        if (route.request().method() === "DELETE") {
            schedules = []
            return route.fulfill({ status: 204 })
        }
        const body = route.request().postDataJSON() as Omit<Schedule, "id">
        onWrite?.(body)
        schedules = [{ ...schedules[0]!, ...body }]
        return fulfillJson(route, schedules[0])
    })
}

test.describe("Configurações → Relatórios", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("a sub-navegação de Configurações leva a Relatórios", async ({ page }) => {
        await setupApp(page)
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page
            .getByRole("navigation", { name: "Configurações" })
            .getByRole("link", { name: "Relatórios" })
            .click()

        await expect(page).toHaveURL(/\/configuracoes\/relatorios$/)
        await expect(page.getByRole("heading", { name: "Relatórios", level: 1 })).toBeVisible()
        await expect(page.getByTestId("report-schedule-empty")).toBeVisible()
    })

    test("cria uma configuração, vê na lista com o próximo envio, edita e exclui", async ({
        page,
    }) => {
        const writes: unknown[] = []
        await setupApp(page, (body) => writes.push(body))
        await page.goto("/configuracoes/relatorios")
        await hideDevTools(page)

        await expect(page.getByLabel("Frequência")).toBeDisabled()
        await page.getByLabel("Destinatários").fill("financeiro@example.com")
        await page.getByLabel("Dia do envio").fill("5")
        await page.getByRole("button", { name: "Salvar configuração" }).click()

        const list = page.getByTestId("report-schedule-list")
        await expect(list.getByText("Mensal · Casa Principal")).toBeVisible()
        await expect(list.getByText("Próximo envio: 05/08/2026 às 06:00")).toBeVisible()
        expect(writes[0]).toMatchObject({
            type: "MONTHLY",
            frequency: "MONTHLY",
            sendDay: 5,
            recipients: ["financeiro@example.com"],
            active: true,
        })

        await list.getByRole("button", { name: /^Editar/ }).click()
        const dialog = page.getByRole("dialog")
        await dialog.getByRole("button", { name: "PDF" }).click()
        await dialog.getByRole("button", { name: "CSV" }).click()
        await dialog.getByRole("button", { name: "Salvar" }).click()
        await expect(dialog).toHaveCount(0)
        expect(writes[1]).toMatchObject({ format: "CSV" })
        await expect(list.getByText(/· CSV ·/)).toBeVisible()

        await list.getByRole("button", { name: /^Excluir/ }).click()
        await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click()
        await expect(page.getByTestId("report-schedule-empty")).toBeVisible()
    })

    test("destinatário inválido explica o motivo e bloqueia o envio", async ({ page }) => {
        await setupApp(page)
        await page.goto("/configuracoes/relatorios")
        await hideDevTools(page)

        await page.getByLabel("Destinatários").fill("sem-arroba")

        await expect(page.getByRole("alert")).toContainText("E-mail inválido: sem-arroba")
        await expect(page.getByRole("button", { name: "Salvar configuração" })).toBeDisabled()
    })
})
