import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { PROP_1 } from "./support/fixtures"
import { mockPropertyTree } from "./support/propertyTree"
import type { Goal, GoalProgress } from "../../src/types/goal.types"
import type { Property } from "../../src/types/property.types"

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
            unit: goal.unit,
            months: goal.monthlyTargets.map((target, index) => ({
                month: index + 1,
                target,
                realized: 380,
            })),
            yearTarget: goal.monthlyTargets.reduce((sum, kwh) => sum + kwh, 0),
            realized: 4560,
            deviationPercent: -5,
            currentMonthTarget: null,
            situation: "MET",
        }
    }
    return {
        goalId: goal.id,
        year: goal.year,
        unit: goal.unit,
        months: goal.monthlyTargets.map((target, index) => ({
            month: index + 1,
            target,
            realized: current && index < 5 ? 380 : null,
        })),
        yearTarget: goal.monthlyTargets.reduce((sum, kwh) => sum + kwh, 0),
        realized: current ? 1900 : null,
        deviationPercent: current ? -5 : null,
        currentMonthTarget: current ? (goal.monthlyTargets[5] ?? 0) : null,
        situation: "IN_PROGRESS",
    }
}

const setupApp = async (
    page: Page,
    onWrite?: (body: unknown) => void,
    initialGoals: Goal[] = [],
    properties: Property[] = [PROP_1],
) => {
    await page.clock.install({ time: new Date(CLOCK_TIME) })
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page)
    // A sub-navegação parte do Cadastro, que lista distribuidoras e propriedades;
    // a mesma lista de propriedades alimenta a página de Metas.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, properties) : route.fallback(),
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
            unit: "KWH",
            referenceYear: 2025,
            monthlyTargets: monthly(400),
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
        expect(writes[1]).toMatchObject({ monthlyTargets: [500, ...monthly(400).slice(1)] })
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
            unit: "KWH",
            referenceYear: 2024,
            monthlyTargets: monthly(400),
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
            unit: "KWH",
            referenceYear: 2025,
            monthlyTargets: monthly(380),
            alertPercent: 85,
        })
        await expect(page.getByTestId("goal-row-2027")).toContainText("4.560 kWh")
    })

    test("cria a meta de custo (R$) pelo seletor de unidade, sem mexer na de consumo", async ({
        page,
    }) => {
        const writes: unknown[] = []
        await setupApp(page, (body) => writes.push(body))
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        await expect(page.getByTestId("goal-summary")).toContainText("Metas de consumo anual")
        await page.getByRole("tab", { name: "Custo (R$)" }).click()
        await expect(page.getByTestId("goal-summary")).toContainText("Metas de custo anual")

        await page.getByRole("button", { name: "Nova meta" }).click()
        const dialog = page.getByRole("dialog", { name: "Nova meta de custo" })
        await dialog.getByLabel("Custo mensal alvo · R$").fill("500")
        await dialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(dialog).toHaveCount(0)
        expect(writes[0]).toEqual({
            propertyId: PROP_1.id,
            year: 2026,
            unit: "BRL",
            referenceYear: 2025,
            monthlyTargets: monthly(500),
            alertPercent: 85,
        })
        await expect(page.getByTestId("goal-summary")).toContainText("Teto de R$ 6.000 para 2026")
        await expect(page.getByTestId("goal-row-2026")).toContainText("R$ 6.000")

        await page.getByRole("tab", { name: "Consumo (kWh)" }).click()
        await expect(page.getByTestId("goal-history-empty")).toBeVisible()
    })

    test("a meta de demanda (kW) só aparece para propriedade do Grupo A", async ({ page }) => {
        await setupApp(page)
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        await expect(page.getByRole("tab", { name: "Custo (R$)" })).toBeVisible()
        await expect(page.getByRole("tab", { name: "Demanda (kW)" })).toHaveCount(0)
    })

    test("cria a meta de demanda (kW) de uma propriedade do Grupo A", async ({ page }) => {
        const writes: unknown[] = []
        const groupA: Property = { ...PROP_1, tariffGroup: "GROUP_A" }
        await setupApp(page, (body) => writes.push(body), [], [groupA])
        await page.goto("/configuracoes/metas")
        await hideDevTools(page)

        await page.getByRole("tab", { name: "Demanda (kW)" }).click()
        await expect(page.getByTestId("goal-summary")).toContainText("Metas de demanda mensal")

        await page.getByRole("button", { name: "Nova meta" }).click()
        const dialog = page.getByRole("dialog", { name: "Nova meta de demanda" })
        await dialog.getByLabel("Demanda mensal alvo · kW").fill("180")
        await dialog.getByRole("button", { name: "Salvar meta" }).click()

        await expect(dialog).toHaveCount(0)
        expect(writes[0]).toEqual({
            propertyId: PROP_1.id,
            year: 2026,
            unit: "KW",
            referenceYear: 2025,
            monthlyTargets: monthly(180),
            alertPercent: 85,
        })
        // A demanda é um pico: a meta do ano é a maior meta mensal, não a soma.
        await expect(page.getByTestId("goal-summary")).toContainText("Teto de 180 kW para 2026")
        await expect(page.getByTestId("goal-row-2026")).toContainText("180 kW")
    })
})
