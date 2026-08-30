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
 *   2. Ciclo vincular → editar → remover (via `MeterFormDialog`, dialog
 *      identificado por role, não testid — mesmo padrão que
 *      properties/area/device.spec.ts já usam)
 *   3. Leitura em tempo real (Potência/Tensão/Corrente) aparece junto com o
 *      card de conexão, em estado "sem leitura recente" (nenhuma amostra
 *      chega pelo SSE mockado) — essa leitura entra inline no próprio card
 *      de `MeterSection` (`meter-connection-card` + `meter-status-stale`),
 *      não mais no antigo `RealTimeCard` (removido)
 *   4. Campos condicionais do form por protocolo (rede/tópico/serial)
 *
 * Reescrito nesta correção — ficou pra trás quando a leitura em tempo real
 * migrou do antigo `RealTimeCard.tsx` (removido) pra dentro de
 * `MeterSection.tsx`, e quando os modais de CRUD foram unificados sem
 * testid próprio no `FormDialog`: os testids `real-time-card`,
 * `real-time-card-stale` e `meter-form-dialog` deixaram de existir no
 * código-fonte havia bastante tempo, sem que este spec fosse notado — a
 * reescrita anterior cobriu só properties/area/device.spec.ts.
 */

const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
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
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
    // Mesma lógica pro card "Consumo em tempo real" —
    // /api/meter-readings assim que houver medidor.
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
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

        await expect(page.getByRole("heading", { level: 2, name: /^medidor$/i })).toBeVisible()
        await expect(page.getByTestId("meter-section-create")).toBeVisible()
        await expect(page.getByText(/nenhum medidor vinculado/i)).toBeVisible()
        // Sem medidor, o card inteiro (conexão + leitura em tempo real) nem
        // renderiza — é o mesmo bloco condicional em MeterSection.
        await expect(page.getByTestId("meter-connection-card")).toHaveCount(0)
    })

    test("vincula, edita e remove um medidor MQTT (ciclo completo)", async ({ page }) => {
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
        const createDialog = page.getByRole("dialog", {
            name: /configurar medidor/i,
        })
        await expect(createDialog).toBeVisible()

        await page.getByLabel(/nome do medidor/i).fill("Medidor Geral")
        // Protocolo default já é MQTT — host/porta/tópico aparecem.
        await page.getByLabel(/^host$/i).fill("192.168.0.10")
        await page.getByLabel(/porta/i).fill("1883")
        await page.getByLabel(/tópico mqtt/i).fill("lumitrack/geral")

        await page.getByRole("button", { name: /vincular medidor/i }).click()

        await expect(createDialog).not.toBeVisible()
        const card = page.getByTestId("meter-connection-card")
        await expect(card).toBeVisible()
        await expect(card).toContainText(/medidor geral/i)
        await expect(card).toContainText(/mqtt/i)
        await expect(card).toContainText(/192\.168\.0\.10:1883/)
        await expect(card).toContainText(/lumitrack\/geral/)
        // Botão "Configurar medidor" some — já há medidor vinculado.
        await expect(page.getByTestId("meter-section-create")).toHaveCount(0)

        // Leitura em tempo real aparece junto — sem leitura via SSE, fica
        // "stale" desde o primeiro render (mesmo card, footer de 3 colunas
        // Potência/Tensão/Corrente com "—" enquanto isStale).
        await expect(page.getByTestId("meter-status-stale")).toBeVisible()
        await expect(page.getByText(/sem leitura recente/i)).toBeVisible()

        // ─── 2. Editar ──────────────────────────────────────────────────────
        await page.getByRole("button", { name: /editar medidor/i }).click()
        const editDialog = page.getByRole("dialog", { name: /editar medidor/i })
        await expect(editDialog).toBeVisible()
        await expect(page.getByLabel(/^host$/i)).toHaveValue("192.168.0.10")

        await page.getByLabel(/^host$/i).fill("192.168.0.20")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(card).toContainText(/192\.168\.0\.20:1883/)

        // ─── 3. Remover ─────────────────────────────────────────────────────
        await page.getByRole("button", { name: /remover medidor/i }).click()
        await expect(page.getByRole("heading", { name: /^remover medidor$/i })).toBeVisible()
        await page.getByRole("button", { name: /^remover$/i }).click()

        await expect(page.getByText(/nenhum medidor vinculado/i)).toBeVisible()
        await expect(page.getByTestId("meter-connection-card")).toHaveCount(0)
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
        const dialog = page.getByRole("dialog", { name: /configurar medidor/i })
        await expect(dialog).toBeVisible()

        // Default: MQTT — host/porta/tópico, sem endereço.
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/porta/i)).toBeVisible()
        await expect(page.getByLabel(/tópico mqtt/i)).toBeVisible()
        await expect(page.getByLabel(/^endereço$/i)).toHaveCount(0)

        // Modbus TCP — host/porta + endereço de voltagem (registrador) e os
        // 3 endereços de grandeza em extra (issue #316: antes desta
        // correção, MODBUS_TCP não mostrava NENHUM campo de endereço,
        // tornando o protocolo impossível de configurar pela UI).
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_TCP")
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/porta/i)).toBeVisible()
        await expect(page.getByLabel(/tópico mqtt/i)).toHaveCount(0)
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de voltagem/i)).toHaveCount(0)
        await expect(page.getByLabel(/endereço de corrente/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de potência/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de fator de potência/i)).toBeVisible()

        // Modbus RTU (serial) — endereço serial (porta) + endereço de
        // voltagem próprio em extra (só ele tem os DOIS: o `address` de
        // topo é o caminho serial, não uma grandeza) + as 3 de extra.
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_RTU")
        await expect(page.getByLabel(/^host$/i)).toHaveCount(0)
        await expect(page.getByLabel(/porta/i)).toHaveCount(0)
        await expect(page.getByLabel(/tópico mqtt/i)).toHaveCount(0)
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de voltagem/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de corrente/i)).toBeVisible()

        // EtherNet/IP — host/porta + endereço de voltagem (tag), sem
        // endereço de voltagem separado em extra (o `address` de topo já é
        // a tag de voltagem).
        await page.getByLabel(/protocolo/i).selectOption("ETHERNET_IP")
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de voltagem/i)).toHaveCount(0)
        await expect(page.getByLabel(/endereço de potência/i)).toBeVisible()

        // Profinet — host/porta + endereço de voltagem (DB).
        await page.getByLabel(/protocolo/i).selectOption("PROFINET")
        await expect(page.getByLabel(/^host$/i)).toBeVisible()
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de fator de potência/i)).toBeVisible()

        // Profibus (serial, stub) — só o endereço original, sem grandezas.
        await page.getByLabel(/protocolo/i).selectOption("PROFIBUS")
        await expect(page.getByLabel(/^endereço$/i)).toBeVisible()
        await expect(page.getByLabel(/endereço de corrente/i)).toHaveCount(0)

        // Volta pra RTU e faz o submit sem preencher os campos exigidos —
        // dispara a validação condicional do schema (endereço + grandezas).
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_RTU")
        await page.getByLabel(/nome do medidor/i).fill("Medidor Serial")
        await page.getByRole("button", { name: /vincular medidor/i }).click()
        await expect(page.getByText(/endereço é obrigatório para este protocolo/i)).toBeVisible()
        await expect(dialog).toBeVisible()
    })

    test("cria um medidor MODBUS_TCP com os endereços de grandeza (issue #316)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)

        let meter: Meter | null = null
        let createdBody: Record<string, unknown> = {}

        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) => {
            if (meter) return fulfillJson(route, meter)
            return fulfillError(route, "Alvo sem medidor vinculado", 404)
        })

        await page.route(/\/api\/meters(\?.*)?$/, async (route) => {
            if (route.request().method() !== "POST") return route.continue()
            createdBody = JSON.parse(route.request().postData() ?? "{}")
            meter = {
                id: "meter-modbus-tcp",
                name: createdBody.name as string,
                targetType: "PROPERTY",
                propertyId: "prop-1",
                areaId: null,
                deviceId: null,
                protocol: createdBody.protocol as Meter["protocol"],
                host: (createdBody.host as string) ?? null,
                port: (createdBody.port as number) ?? null,
                topic: null,
                address: (createdBody.address as string) ?? null,
                extra: (createdBody.extra as Meter["extra"]) ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            return fulfillJson(route, meter, 201)
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await page.getByTestId("meter-section-create").click()
        const dialog = page.getByRole("dialog", { name: /configurar medidor/i })
        await expect(dialog).toBeVisible()

        await page.getByLabel(/nome do medidor/i).fill("Medidor Modbus TCP")
        await page.getByLabel(/protocolo/i).selectOption("MODBUS_TCP")
        await page.getByLabel(/^host$/i).fill("192.168.0.30")
        await page.getByLabel(/porta/i).fill("502")
        await page.getByLabel(/^endereço$/i).fill("0")
        await page.getByLabel(/endereço de corrente/i).fill("1")
        await page.getByLabel(/endereço de potência/i).fill("2")
        await page.getByLabel(/endereço de fator de potência/i).fill("3")

        await page.getByRole("button", { name: /vincular medidor/i }).click()

        await expect(dialog).not.toBeVisible()
        expect(createdBody.protocol).toBe("MODBUS_TCP")
        expect(createdBody.address).toBe("0")
        expect(createdBody.extra).toEqual({
            currentAddress: "1",
            powerAddress: "2",
            powerFactorAddress: "3",
        })

        const card = page.getByTestId("meter-connection-card")
        await expect(card).toContainText(/medidor modbus tcp/i)
        await expect(card).toContainText(/192\.168\.0\.30:502/)
    })
})
