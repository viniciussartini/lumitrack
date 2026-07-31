import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { DIST_CEMIG, PROP_1 } from "./support/fixtures"
import type { Meter } from "../../src/types/meter.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * `MeterSection` — testada através da `PropertyDetailsPage`. Cobre:
 *   1. EmptyState "sem medidor" (`by-target` → 404 → `null`)
 *   2. Ciclo vincular → editar → remover (via `meter-form-dialog`)
 *   3. `RealTimeCard` aparece junto com o card de conexão, em estado "sem
 *      leitura recente" (nenhuma amostra chega pelo SSE mockado)
 *   4. Campos condicionais do form por protocolo (rede/tópico/serial)
 */

const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
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
    // ConsumptionSection também monta na mesma página e usa /api/consumption
    // assim que houver medidor — precisa de mock pra não vazar.
    await page.route(/\/api\/consumption(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
}

test.describe("Medidor (MeterSection)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("sem medidor vinculado: mostra EmptyState, sem card de conexão nem tempo real", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillError(route, "Alvo sem medidor vinculado", 404),
        )

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { level: 2, name: /^medidor$/i }),
        ).toBeVisible()
        await expect(page.getByTestId("meter-section-create")).toBeVisible()
        await expect(page.getByText(/nenhum medidor vinculado/i)).toBeVisible()
        await expect(page.getByTestId("meter-connection-card")).toHaveCount(0)
        await expect(page.getByTestId("real-time-card")).toHaveCount(0)
    })

    test("vincula, edita e remove um medidor MQTT (ciclo completo)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)

        let meter: Meter | null = null

        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) => {
            if (meter) return fulfillJson(route, meter)
            return fulfillError(route, "Alvo sem medidor vinculado", 404)
        })

        await page.route(/\/api\/meters(\?.*)?$/, async (route) => {
            if (route.request().method() !== "POST") return route.continue()
            const body = JSON.parse(route.request().postData() ?? "{}")
            meter = {
                id: "meter-1",
                name: body.name,
                targetType: "PROPERTY",
                propertyId: "prop-1",
                areaId: null,
                deviceId: null,
                protocol: body.protocol,
                host: body.host ?? null,
                port: body.port ?? null,
                topic: body.topic ?? null,
                address: body.address ?? null,
                extra: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            return fulfillJson(route, meter, 201)
        })

        await page.route("**/api/meters/meter-1", async (route) => {
            const method = route.request().method()

            if (method === "PUT") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                meter = {
                    ...meter!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, meter)
            }

            if (method === "DELETE") {
                meter = null
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // ─── 1. Vincular ────────────────────────────────────────────────────
        await page.getByTestId("meter-section-create").click()
        await expect(page.getByTestId("meter-form-dialog")).toBeVisible()
        await expect(
            page.getByRole("heading", { name: /^configurar medidor$/i }),
        ).toBeVisible()

        await page.getByLabel(/nome do medidor/i).fill("Medidor Geral")
        // Protocolo default já é MQTT — host/porta/tópico aparecem.
        await page.getByLabel(/^host$/i).fill("192.168.0.10")
        await page.getByLabel(/porta/i).fill("1883")
        await page.getByLabel(/tópico mqtt/i).fill("lumitrack/geral")

        await page
            .getByRole("button", { name: /vincular medidor/i })
            .click()

        await expect(page.getByTestId("meter-form-dialog")).not.toBeVisible()
        const card = page.getByTestId("meter-connection-card")
        await expect(card).toBeVisible()
        await expect(card).toContainText(/medidor geral/i)
        await expect(card).toContainText(/mqtt/i)
        await expect(card).toContainText(/192\.168\.0\.10:1883/)
        await expect(card).toContainText(/lumitrack\/geral/)
        // Botão "Configurar medidor" some — já há medidor vinculado.
        await expect(page.getByTestId("meter-section-create")).toHaveCount(0)

        // RealTimeCard aparece junto — sem leitura via SSE, fica "stale".
        await expect(page.getByTestId("real-time-card")).toBeVisible()
        await expect(page.getByTestId("real-time-card-stale")).toBeVisible()
        await expect(page.getByText(/sem leitura recente/i)).toBeVisible()

        // ─── 2. Editar ──────────────────────────────────────────────────────
        await page.getByRole("button", { name: /editar medidor/i }).click()
        await expect(page.getByTestId("meter-form-dialog")).toBeVisible()
        await expect(
            page.getByRole("heading", { name: /^editar medidor$/i }),
        ).toBeVisible()
        await expect(page.getByLabel(/^host$/i)).toHaveValue("192.168.0.10")

        await page.getByLabel(/^host$/i).fill("192.168.0.20")
        await page
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        await expect(page.getByTestId("meter-form-dialog")).not.toBeVisible()
        await expect(card).toContainText(/192\.168\.0\.20:1883/)

        // ─── 3. Remover ─────────────────────────────────────────────────────
        await page.getByRole("button", { name: /remover medidor/i }).click()
        await expect(
            page.getByRole("heading", { name: /^remover medidor$/i }),
        ).toBeVisible()
        await page.getByRole("button", { name: /^remover$/i }).click()

        await expect(page.getByText(/nenhum medidor vinculado/i)).toBeVisible()
        await expect(page.getByTestId("meter-connection-card")).toHaveCount(0)
        await expect(page.getByTestId("real-time-card")).toHaveCount(0)
        await expect(page.getByTestId("meter-section-create")).toBeVisible()
    })

    test("troca de protocolo ajusta os campos exibidos no form (rede / tópico / serial)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillError(route, "Alvo sem medidor vinculado", 404),
        )

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await page.getByTestId("meter-section-create").click()
        await expect(page.getByTestId("meter-form-dialog")).toBeVisible()

        // Default: MQTT — host/porta/tópico, sem endereço.
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/porta/i)).toBeVisible()
        await expect(page.getByLabel(/tópico mqtt/i)).toBeVisible()
        await expect(page.getByLabel(/^endereço$/i)).toHaveCount(0)

        // Modbus TCP — host/porta, sem tópico nem endereço.
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_TCP")
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/porta/i)).toBeVisible()
        await expect(page.getByLabel(/tópico mqtt/i)).toHaveCount(0)
        await expect(page.getByLabel(/^endereço$/i)).toHaveCount(0)

        // Modbus RTU (serial) — só endereço, nada de rede.
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_RTU")
        await expect(page.getByLabel(/^host$/i)).toHaveCount(0)
        await expect(page.getByLabel(/porta/i)).toHaveCount(0)
        await expect(page.getByLabel(/tópico mqtt/i)).toHaveCount(0)
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()

        // Submit sem preencher o campo exigido pelo protocolo atual (serial)
        // dispara a validação condicional do schema.
        await page.getByLabel(/nome do medidor/i).fill("Medidor Serial")
        await page
            .getByRole("button", { name: /vincular medidor/i })
            .click()
        await expect(
            page.getByText(/endereço é obrigatório para este protocolo/i),
        ).toBeVisible()
        await expect(page.getByTestId("meter-form-dialog")).toBeVisible()
    })
})
