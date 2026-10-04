import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { PROP_1 } from "./support/fixtures"
import { mockPropertyTree } from "./support/propertyTree"
import type { Goal, GoalProgress } from "../../src/types/goal.types"

/**
 * E2E de Configurações → Metas: criar, listar, editar e excluir metas anuais
 * de consumo. Backend mockado via `page.route()`, como nos demais specs — a
 * lista é mantida em memória. O relógio é fixado em 2026 para o ano corrente
 * (e o ano sugerido no formulário) não depender da data da execução.
 */

const CLOCK_TIME = "2026-06-15T15:00:00.000Z"

type GoalBody = Omit<Goal, "id" | "createdAt" | "updatedAt">

const monthly = (kwh: number) => Array.from({ length: 12 }, () => kwh)

/** Acompanhamento simulado: janeiro a maio com 380 kWh cada, contra 400 de meta. */
const progressFor = (goal: Goal): GoalProgress => {
    const current = goal.year === 2026
    if (goal.year < 2026) {
        return {
            goalId: goal.id,
            year: goal.year,
            months: goal.monthlyKwh.map((targetKwh, index) => ({
                month: index + 1,
                targetKwh,
                realizedKwh: 380,
            })),
            yearTargetKwh: goal.monthlyKwh.reduce((sum, kwh) => sum + kwh, 0),
            realizedKwh: 4560,
            deviationPercent: -5,
            currentMonthTargetKwh: null,
            situation: "MET",
        }
    }
    return {
        goalId: goal.id,
        year: goal.year,
        months: goal.monthlyKwh.map((targetKwh, index) => ({
            month: index + 1,
            targetKwh,
            realizedKwh: current && index < 5 ? 380 : null,
        })),
        yearTargetKwh: goal.monthlyKwh.reduce((sum, kwh) => sum + kwh, 0),
        realizedKwh: current ? 1900 : null,
        deviationPercent: current ? -5 : null,
        currentMonthTargetKwh: current ? (goal.monthlyKwh[5] ?? 0) : null,
        situation: "IN_PROGRESS",
    }
}

const setupApp = async (
    page: Page,
    onWrite?: (body: unknown) => void,
    initialGoals: Goal[] = [],
) => {
    await page.clock.install({ time: new Date(CLOCK_TIME) })
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)
    // A sub-navegação parte do Cadastro, que lista distribuidoras e propriedades;
    // a mesma lista de propriedades alimenta a página de Metas.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, [PROP_1]) : route.fallback(),
    )

    let goals: Goal[] = [...initialGoals]
    await page.route(/\/api\/goals(\?.*)?$/, (route) => {
        if (route.request().method() === "POST") {
            const body = route.request().postDataJSON() as GoalBody
            onWrite?.(body)
            const created: Goal = {
                ...body,
                id: `goal-${body.year}`,
                createdAt: "2026-06-15T15:00:00.000Z",
                updatedAt: "2026-06-15T15:00:00.000Z",
            }
            goals = [created, ...goals].sort((a, b) => b.year - a.year)
            return fulfillJson(route, created, 201)
        }
        return fulfillPaginated(route, goals)
    })
    await page.route(/\/api\/goals\/progress(\?.*)?$/, (route) =>
        fulfillJson(route, { items: goals.map(progressFor) }),
    )
    await page.route(/\/api\/goals\/goal-\d+$/, (route) => {
        const id = route.request().url().split("/").pop()!
        if (route.request().method() === "DELETE") {
            goals = goals.filter((goal) => goal.id !== id)
            return route.fulfill({ status: 204 })
        }
        const body = route.request().postDataJSON() as Partial<GoalBody>
        onWrite?.(body)
        goals = goals.map((goal) => (goal.id === id ? { ...goal, ...body } : goal))
        return fulfillJson(
            route,
            goals.find((goal) => goal.id === id),
        )
    })
}

test.describe("Configurações → Metas", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("a sub-navegação de Configurações leva a Metas", async ({ page }) => {
        await setupApp(page)
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page
            .getByRole("navigation", { name: "Configurações" })
            .getByRole("link", { name: "Metas" })
            .click()

        await expect(page).toHaveURL(/\/configuracoes\/metas$/)
        await expect(page.getByRole("heading", { name: "Metas", level: 1 })).toBeVisible()
        await expect(page.getByTestId("goal-summary")).toContainText(
            "Nenhuma meta cadastrada para 2026.",
        )
        await expect(page.getByTestId("goal-history-empty")).toBeVisible()
    })

    test("cria a meta do ano, vê no resumo e na tabela, edita e exclui", async ({ page }) => {
        const writes: unknown[] = []
        await setupApp(page, (body) => writes.push(body))
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        await page.getByRole("button", { name: "Nova meta" }).click()
        const dialog = page.getByRole("dialog", { name: "Nova meta de consumo" })
        await expect(dialog.getByLabel("Ano da meta")).toHaveValue("2026")
        await dialog.getByLabel(/Consumo específico alvo/).fill("400")
        await dialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(dialog).toHaveCount(0)
        expect(writes[0]).toEqual({
            propertyId: PROP_1.id,
            year: 2026,
            referenceYear: 2025,
            monthlyKwh: monthly(400),
            alertPercent: 85,
        })
        await expect(page.getByTestId("goal-summary")).toContainText("Teto de 4.800 kWh para 2026")
        const row = page.getByTestId("goal-row-2026")
        await expect(row).toContainText("4.800 kWh")
        await expect(row).toContainText("Em andamento")

        const progress = page.getByTestId("goal-progress")
        await expect(progress).toContainText("2026 · meta vs. realizado")
        await expect(progress).toContainText("Realizado até junho")
        await expect(progress).toContainText("1.900 kWh")
        await expect(progress).toContainText("−5,0%")
        await expect(progress.getByTestId("goal-progress-chart")).toBeVisible()
        await expect(row).toContainText("−5,0%")

        await row.getByRole("button", { name: "Editar meta de 2026" }).click()
        const editDialog = page.getByRole("dialog", { name: "Editar meta de consumo" })
        await expect(editDialog.getByLabel("Ano da meta")).toBeDisabled()
        await editDialog.getByLabel("jan").fill("500")
        await editDialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(editDialog).toHaveCount(0)
        expect(writes[1]).toMatchObject({ monthlyKwh: [500, ...monthly(400).slice(1)] })
        await expect(row).toContainText("4.900 kWh")

        await row.getByRole("button", { name: "Excluir meta de 2026" }).click()
        await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click()
        await expect(page.getByTestId("goal-history-empty")).toBeVisible()
    })

    test("meses em branco explicam o motivo e não enviam", async ({ page }) => {
        const writes: unknown[] = []
        await setupApp(page, (body) => writes.push(body))
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        await page.getByRole("button", { name: "Nova meta" }).click()
        const dialog = page.getByRole("dialog")
        await dialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(dialog.getByRole("alert")).toContainText("Informe a meta dos 12 meses")
        expect(writes).toHaveLength(0)
    })

    test("usa um ano passado como referência: a meta nova nasce com o realizado preenchido", async ({
        page,
    }) => {
        const writes: unknown[] = []
        const past: Goal = {
            id: "goal-2025",
            propertyId: PROP_1.id,
            year: 2025,
            referenceYear: 2024,
            monthlyKwh: monthly(400),
            alertPercent: 85,
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
        }
        await setupApp(page, (body) => writes.push(body), [past])
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        const row = page.getByTestId("goal-row-2025")
        await expect(row).toContainText("Cumprida")
        await expect(row.getByRole("button", { name: /Editar|Excluir/ })).toHaveCount(0)
        await row.getByRole("button", { name: "Usar a meta de 2025 como referência" }).click()

        const dialog = page.getByRole("dialog", { name: "Nova meta de consumo" })
        await expect(dialog.getByLabel("Ano da meta")).toHaveValue("2027")
        await expect(dialog.getByLabel("Ano de referência")).toHaveValue("2025")
        await expect(dialog.getByLabel("jan")).toHaveValue("380")
        await expect(dialog.getByLabel("dez")).toHaveValue("380")
        await dialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(dialog).toHaveCount(0)
        expect(writes[0]).toEqual({
            propertyId: PROP_1.id,
            year: 2027,
            referenceYear: 2025,
            monthlyKwh: monthly(380),
            alertPercent: 85,
        })
        await expect(page.getByTestId("goal-row-2027")).toContainText("4.560 kWh")
    })
})
