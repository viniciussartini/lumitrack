import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { ALERT_1, ALERT_EVENT_1, METER_1 } from "./support/fixtures"
import type { AlertWithStatus } from "../../src/types/alert.types"
import type { AlertTriggerEvent } from "../../src/types/alert-event.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * `/alertas` — inbox global de alertas no modelo de faixa de potência
 * (Fase 4/5, substitui por completo o antigo threshold de kWh one-shot):
 *   1. CRUD flat (nome, medidor, potência de referência, tolerância, enabled)
 *   2. Toggle habilitar/desabilitar sem passar pelo form
 *   3. Status firing/normal + histórico de disparos (AlertTriggerEvent)
 *   4. Paginação da listagem
 *   5. Validação client-side
 */

/**
 * Configura mocks compartilhados (auth + AppShell + medidores).
 *
 * `GET /api/meters?page=1&pageSize=31` alimenta o Select do form de criação
 * — o backend limita `pageSize` a 31, e o form busca o catálogo inteiro do
 * usuário numa página só (poucos medidores por conta, ao contrário de
 * distribuidoras/propriedades que podem paginar de verdade).
 */
const setupAuthAndMeters = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)
    await page.route(/\/api\/meters(\?.*)?$/, (route) =>
        fulfillPaginated(route, [METER_1]),
    )
}

const makeAlert = (overrides: Partial<AlertWithStatus> = {}): AlertWithStatus => ({
    ...ALERT_1,
    ...overrides,
})

test.describe("Inbox de alertas (/alertas)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, edita, alterna habilitado e exclui um alerta", async ({
        page,
    }) => {
        await setupAuthAndMeters(page)

        // Estado da "DB" simulada — começa vazio, evolui ao longo do teste.
        let alerts: AlertWithStatus[] = []

        // Registrado DEPOIS de mockAppShellBackground: o handler mais
        // recente vence quando dois casam a mesma URL, então isto
        // sobrescreve o `GET /api/alerts` → [] genérico de fundo.
        await page.route(/\/api\/alerts(\?.*)?$/, async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillPaginated(route, alerts)
            }

            if (method === "POST") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: AlertWithStatus = {
                    id: "alert-1",
                    userId: "user-123",
                    meterId: body.meterId,
                    name: body.name,
                    referencePowerKw: body.referencePowerKw,
                    tolerancePercent: body.tolerancePercent,
                    enabled: body.enabled,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: "normal",
                    target: ALERT_1.target,
                }
                alerts = [created]
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        })

        await page.route("**/api/alerts/alert-1/enabled", async (route) => {
            if (route.request().method() === "PATCH") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                alerts[0] = {
                    ...alerts[0]!,
                    enabled: body.enabled,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, alerts[0])
            }
            return route.continue()
        })

        await page.route("**/api/alerts/alert-1", async (route) => {
            const method = route.request().method()

            if (method === "PUT") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                alerts[0] = {
                    ...alerts[0]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, alerts[0])
            }

            if (method === "DELETE") {
                alerts = []
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        })

        await page.route(/\/api\/alert-events(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        // ─── 1. Lista vazia inicialmente ─────────────────────────────────────
        await page.goto("/alertas")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /^alertas$/i, level: 1 }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhum alerta configurado/i),
        ).toBeVisible()

        // ─── 2. Criar novo alerta ─────────────────────────────────────────────
        await page.getByTestId("alerts-page-create-button").click()
        const createDialog = page.getByRole("dialog", { name: /^criar alerta$/i })
        await expect(createDialog).toBeVisible()

        await page
            .getByTestId("alert-form-name")
            .fill("Geladeira fora da faixa")
        await page
            .getByTestId("alert-form-meterId")
            .selectOption(METER_1.id)
        await page.getByTestId("alert-form-referencePowerKw").fill("10")
        await page.getByTestId("alert-form-tolerancePercent").fill("2")
        // "enabled" já vem marcado por default — não mexe.

        await page.getByTestId("alert-form-submit").click()

        // Dialog fecha, tabela aparece com a linha nova
        await expect(createDialog).not.toBeVisible()
        await expect(page.getByTestId("alert-row-alert-1")).toBeVisible()
        const row = page.getByTestId("alert-row-alert-1")
        await expect(row).toContainText(/geladeira fora da faixa/i)
        await expect(row).toContainText(/10 kW/)
        await expect(row).toContainText(/±2%/)
        await expect(row).toContainText(/sim/i)
        await expect(
            page.getByTestId("alert-status-badge-alert-1"),
        ).toContainText(/normal/i)

        // ─── 3. Editar via menu ⋯ (meterId vira campo oculto, imutável) ───────
        await page.getByTestId("alert-menu-trigger-alert-1").click()
        await page.getByTestId("alert-menu-edit-alert-1").click()

        const editDialog = page.getByRole("dialog", { name: /^editar alerta$/i })
        await expect(editDialog).toBeVisible()
        // Em edição não há select de medidor — é um <input type="hidden">
        await expect(page.getByTestId("alert-form-meterId")).toHaveCount(0)

        await page.getByTestId("alert-form-referencePowerKw").fill("12")
        await page.getByTestId("alert-form-submit").click()

        await expect(editDialog).not.toBeVisible()
        await expect(page.getByTestId("alert-row-alert-1")).toContainText(
            /12 kW/,
        )

        // ─── 4. Desabilitar via menu ⋯ (sem passar pelo form) ─────────────────
        await page.getByTestId("alert-menu-trigger-alert-1").click()
        await page.getByTestId("alert-menu-toggle-enabled-alert-1").click()

        await expect(page.getByTestId("alert-row-alert-1")).toContainText(
            /não/i,
        )

        // Menu reabre já mostrando "Habilitar" (estado invertido)
        await page.getByTestId("alert-menu-trigger-alert-1").click()
        await expect(
            page.getByTestId("alert-menu-toggle-enabled-alert-1"),
        ).toContainText(/habilitar/i)
        // Fecha clicando fora — o menu usa um listener de "mousedown" no
        // documento, não fecha com Escape (sem handler de teclado).
        await page
            .getByRole("heading", { name: /^alertas$/i, level: 1 })
            .click()
        await expect(
            page.getByTestId("alert-menu-toggle-enabled-alert-1"),
        ).not.toBeVisible()

        // ─── 5. Excluir via menu ⋯ ─────────────────────────────────────────────
        await page.getByTestId("alert-menu-trigger-alert-1").click()
        await page.getByTestId("alert-menu-delete-alert-1").click()

        await expect(
            page.getByRole("heading", { name: /excluir alerta\?/i }),
        ).toBeVisible()
        await page.getByRole("button", { name: "Excluir" }).click()

        await expect(
            page.getByText(/nenhum alerta configurado/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("alert-row-alert-1"),
        ).not.toBeVisible()
    })

    test("mostra status firing/normal e o histórico de disparos do alerta selecionado", async ({
        page,
    }) => {
        await setupAuthAndMeters(page)

        const alert1 = makeAlert({ status: "firing" })
        const alert2 = makeAlert({
            id: "alert-2",
            name: "Forno fora da faixa",
            status: "normal",
        })

        await page.route(/\/api\/alerts(\?.*)?$/, (route) => {
            if (route.request().method() === "GET") {
                return fulfillPaginated(route, [alert1, alert2])
            }
            return route.continue()
        })

        await page.route(/\/api\/alert-events(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const alertId = url.searchParams.get("alertId")
            const events: AlertTriggerEvent[] =
                alertId === "alert-1" ? [ALERT_EVENT_1] : []
            return fulfillPaginated(route, events)
        })

        await page.goto("/alertas")
        await hideDevTools(page)

        // Status resolvidos pelo backend, visíveis na tabela
        const badge1 = page.getByTestId("alert-status-badge-alert-1")
        await expect(badge1).toHaveAttribute("data-status", "firing")
        await expect(badge1).toContainText(/em disparo/i)

        const badge2 = page.getByTestId("alert-status-badge-alert-2")
        await expect(badge2).toHaveAttribute("data-status", "normal")
        await expect(badge2).toContainText(/^normal$/i)

        // Histórico pré-seleciona o primeiro alerta da lista (alert-1)
        await expect(page.getByTestId("alert-event-row-event-1")).toBeVisible()
        await expect(
            page.getByTestId("alert-event-row-event-1"),
        ).toContainText(/geladeira fora da faixa/i)
        await expect(
            page.getByTestId("alert-event-row-event-1"),
        ).toContainText(/5min/)

        // Troca a seleção — alert-2 não tem episódios, EmptyState aparece
        await page
            .getByTestId("alert-events-select")
            .selectOption("alert-2")

        await expect(
            page.getByText(/nenhum episódio registrado/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("alert-event-row-event-1"),
        ).not.toBeVisible()
    })

    test("pagina a listagem de alertas", async ({ page }) => {
        await setupAuthAndMeters(page)

        const allAlerts: AlertWithStatus[] = Array.from({ length: 12 }, (_, i) =>
            makeAlert({
                id: `alert-${i + 1}`,
                name: `Alerta ${i + 1}`,
                target: null,
            }),
        )

        await page.route(/\/api\/alerts(\?.*)?$/, (route) => {
            if (route.request().method() !== "GET") return route.continue()
            const url = new URL(route.request().url())
            const requestedPage = Number(url.searchParams.get("page") ?? "1")
            const pageSize = 10
            const items = allAlerts.slice(
                (requestedPage - 1) * pageSize,
                requestedPage * pageSize,
            )
            return fulfillPaginated(route, items, {
                page: requestedPage,
                pageSize,
                total: allAlerts.length,
            })
        })
        await page.route(/\/api\/alert-events(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/alertas")
        await hideDevTools(page)

        await expect(page.getByTestId("alert-row-alert-1")).toBeVisible()
        await expect(page.getByTestId("alert-row-alert-10")).toBeVisible()
        await expect(page.getByTestId("alert-row-alert-11")).toHaveCount(0)
        await expect(page.getByTestId("pagination")).toContainText(
            /12 itens · página 1 de 2/i,
        )

        await page.getByTestId("pagination-next").click()

        await expect(page.getByTestId("alert-row-alert-11")).toBeVisible()
        await expect(page.getByTestId("alert-row-alert-12")).toBeVisible()
        await expect(page.getByTestId("alert-row-alert-1")).toHaveCount(0)
        await expect(page.getByTestId("pagination")).toContainText(
            /12 itens · página 2 de 2/i,
        )
    })

    test("validação client-side bloqueia submit com campos inválidos", async ({
        page,
    }) => {
        await setupAuthAndMeters(page)
        await page.route(/\/api\/alerts(\?.*)?$/, (route) => {
            if (route.request().method() === "GET") {
                return fulfillPaginated(route, [])
            }
            return route.continue()
        })

        await page.goto("/alertas")
        await hideDevTools(page)

        await page.getByTestId("alerts-page-create-button").click()
        const dialog = page.getByRole("dialog", { name: /^criar alerta$/i })
        await expect(dialog).toBeVisible()

        // Submit totalmente vazio — nome, medidor e potência são obrigatórios
        // (tolerância já vem com default 10, não dispara erro aqui).
        await page.getByTestId("alert-form-submit").click()

        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()
        await expect(page.getByText(/selecione um medidor/i)).toBeVisible()
        await expect(
            page.getByText(/informe um número válido/i),
        ).toBeVisible()

        // Preenche nome/medidor, mas com valores fora da faixa aceita
        await page.getByTestId("alert-form-name").fill("Teste")
        await page.getByTestId("alert-form-meterId").selectOption(METER_1.id)
        await page.getByTestId("alert-form-referencePowerKw").fill("0")
        await page.getByTestId("alert-form-tolerancePercent").fill("150")
        await page.getByTestId("alert-form-submit").click()

        await expect(
            page.getByText(/deve ser maior que zero/i),
        ).toBeVisible()
        await expect(
            page.getByText(/não pode ultrapassar 100/i),
        ).toBeVisible()

        // Continua no dialog — não navegou nem chamou POST
        await expect(dialog).toBeVisible()
    })
})
