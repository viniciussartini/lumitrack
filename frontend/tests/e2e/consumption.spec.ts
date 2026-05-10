import { test, expect, type Page, type Route } from "@playwright/test"

// ─── Constantes ──────────────────────────────────────────────────────────────

const FAKE_JWT_PAYLOAD = btoa(
    JSON.stringify({
        id: "user-123",
        email: "test@example.com",
        userType: "INDIVIDUAL",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
    }),
)
const FAKE_JWT = `header.${FAKE_JWT_PAYLOAD}.signature`

const FAKE_USER = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const KWH_PRICE = 0.75

const DIST_CEMIG = {
    id: "dist-cemig",
    userId: "user-123",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: KWH_PRICE,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const PROP_1 = {
    id: "prop-1",
    userId: "user-123",
    distributorId: "dist-cemig",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const AREA_1 = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const DEVICE_1 = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface ConsumptionSeed {
    id: string
    propertyId: string | null
    areaId: string | null
    deviceId: string | null
    period: "HOURLY" | "DAILY" | "MONTHLY" | "ANNUAL"
    referenceDate: string
    kwhConsumed: number
    costBrl: number | null
    notes: string | null
    createdAt: string
    updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fulfillJson = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data }),
    })

const fulfillError = (route: Route, message: string, status: number) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message }),
    })

const setupBaseFixtures = async (page: Page) => {
    await page.route("**/api/users/user-123", (route) =>
        fulfillJson(route, FAKE_USER),
    )
    await page.route("**/api/distributors", (route) =>
        fulfillJson(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    await page.route("**/api/properties", (route) =>
        fulfillJson(route, [PROP_1]),
    )
    await page.route("**/api/properties/prop-1", (route) =>
        fulfillJson(route, PROP_1),
    )
    await page.route("**/api/properties/prop-1/areas", (route) =>
        fulfillJson(route, [AREA_1]),
    )
    await page.route("**/api/properties/prop-1/areas/area-1", (route) =>
        fulfillJson(route, AREA_1),
    )
    await page.route(
        "**/api/properties/prop-1/areas/area-1/devices",
        (route) => fulfillJson(route, [DEVICE_1]),
    )
    await page.route(
        "**/api/properties/prop-1/areas/area-1/devices/device-1",
        (route) => fulfillJson(route, DEVICE_1),
    )

    await page.addInitScript((token) => {
        localStorage.setItem("lumitrack:auth:token", token)
    }, FAKE_JWT)
}

/**
 * Oculta permanentemente o TanStack Query DevTools via CSS injetado.
 *
 * page.evaluate + .remove() NAO funciona: o React remonta o componente
 * apos cada invalidacao de queries (refetch pos-create/update), recriando
 * o tsqd-parent-container que intercepta os pointer events novamente.
 *
 * addStyleTag injeta uma regra CSS no <head> que sobrevive a qualquer
 * re-render. So funciona chamado APOS page.goto (precisa de documento ativo).
 */
const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })

const sortByReferenceDateDesc = (records: ConsumptionSeed[]) =>
    [...records].sort((a, b) =>
        b.referenceDate.localeCompare(a.referenceDate),
    )

const applyPeriodFilter = (records: ConsumptionSeed[], url: URL) => {
    const period = url.searchParams.get("period")
    if (!period) return records
    return records.filter((r) => r.period === period)
}

interface ConsumptionMockState {
    records: ConsumptionSeed[]
    nextId: number
    nextErrors: Record<string, { status: number; message: string } | undefined>
}

const setupConsumptionRoutes = async (
    page: Page,
    state: ConsumptionMockState,
) => {
    // ─── PROPERTY LIST + CREATE ───────────────────────────────────────────────
    //
    // Regex: casa /consumption com ou sem ?period=xxx
    // NÃO casa /consumption/rec-1 (tem segmento após /consumption)
    await page.route(
        /\/api\/properties\/prop-1\/consumption(\?.*)?$/,
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())

            if (method === "GET") {
                const filtered = applyPeriodFilter(state.records, url)
                return fulfillJson(route, sortByReferenceDateDesc(filtered))
            }

            if (method === "POST") {
                const errKey = "POST_property"
                if (state.nextErrors[errKey]) {
                    const err = state.nextErrors[errKey]!
                    state.nextErrors[errKey] = undefined
                    return fulfillError(route, err.message, err.status)
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: ConsumptionSeed = {
                    id: `rec-${state.nextId++}`,
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    period: body.period,
                    referenceDate: body.referenceDate,
                    kwhConsumed: body.kwhConsumed,
                    costBrl: body.kwhConsumed * KWH_PRICE,
                    notes: body.notes ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                state.records.push(created)
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        },
    )

    // ─── AREA LIST + CREATE ───────────────────────────────────────────────────
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/consumption(\?.*)?$/,
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())

            if (method === "GET") {
                const filtered = applyPeriodFilter(state.records, url)
                return fulfillJson(route, sortByReferenceDateDesc(filtered))
            }

            if (method === "POST") {
                const errKey = "POST_area"
                if (state.nextErrors[errKey]) {
                    const err = state.nextErrors[errKey]!
                    state.nextErrors[errKey] = undefined
                    return fulfillError(route, err.message, err.status)
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: ConsumptionSeed = {
                    id: `rec-${state.nextId++}`,
                    propertyId: null,
                    areaId: "area-1",
                    deviceId: null,
                    period: body.period,
                    referenceDate: body.referenceDate,
                    kwhConsumed: body.kwhConsumed,
                    costBrl: body.kwhConsumed * KWH_PRICE,
                    notes: body.notes ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                state.records.push(created)
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        },
    )

    // ─── DEVICE LIST + CREATE ─────────────────────────────────────────────────
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices\/device-1\/consumption(\?.*)?$/,
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())

            if (method === "GET") {
                const filtered = applyPeriodFilter(state.records, url)
                return fulfillJson(route, sortByReferenceDateDesc(filtered))
            }

            if (method === "POST") {
                const errKey = "POST_device"
                if (state.nextErrors[errKey]) {
                    const err = state.nextErrors[errKey]!
                    state.nextErrors[errKey] = undefined
                    return fulfillError(route, err.message, err.status)
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: ConsumptionSeed = {
                    id: `rec-${state.nextId++}`,
                    propertyId: null,
                    areaId: null,
                    deviceId: "device-1",
                    period: body.period,
                    referenceDate: body.referenceDate,
                    kwhConsumed: body.kwhConsumed,
                    costBrl: body.kwhConsumed * KWH_PRICE,
                    notes: body.notes ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                state.records.push(created)
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        },
    )

    // ─── DETALHE / UPDATE / DELETE (sempre via property root) ────────────────
    //
    // Regex: casa /consumption/:id (segmento adicional após /consumption)
    // NÃO casa /consumption?period=... (sem segmento adicional)
    await page.route(
        /\/api\/properties\/prop-1\/consumption\/[^/?]+(\?.*)?$/,
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())
            const segments = url.pathname.split("/")
            const recordId = segments[segments.length - 1]!

            const index = state.records.findIndex((r) => r.id === recordId)

            if (method === "GET") {
                if (index === -1) {
                    return fulfillError(route, "Registro não encontrado", 404)
                }
                return fulfillJson(route, state.records[index])
            }

            if (method === "PUT") {
                if (index === -1) {
                    return fulfillError(route, "Registro não encontrado", 404)
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                const existing = state.records[index]!
                const updated: ConsumptionSeed = {
                    ...existing,
                    kwhConsumed:
                        body.kwhConsumed ?? existing.kwhConsumed,
                    notes:
                        body.notes !== undefined ? body.notes : existing.notes,
                    costBrl:
                        body.kwhConsumed !== undefined
                            ? body.kwhConsumed * KWH_PRICE
                            : existing.costBrl,
                    updatedAt: new Date().toISOString(),
                }
                state.records[index] = updated
                return fulfillJson(route, updated)
            }

            if (method === "DELETE") {
                if (index === -1) {
                    return fulfillError(route, "Registro não encontrado", 404)
                }
                state.records.splice(index, 1)
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Consumo — fluxo completo em PROPERTY", () => {
    test("cria, edita e exclui registro de consumo da propriedade", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const state: ConsumptionMockState = {
            records: [],
            nextId: 1,
            nextErrors: {},
        }
        await setupConsumptionRoutes(page, state)

        await page.goto("/propriedades/prop-1")
        // DevTools flutuante fica sobre os menus de linha — remover antes dos cliques
        await hideDevTools(page)

        // EmptyState com gramática correta
        await expect(
            page.getByText(/cadastre o consumo desta propriedade/i),
        ).toBeVisible()

        // ── CRIAR
        await page.getByTestId("consumption-section-create").click()

        const dialog = page.getByTestId("consumption-form-dialog")
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByRole("heading", { name: /registrar consumo/i }),
        ).toBeVisible()

        await dialog.getByLabel(/consumo \(kwh\)/i).fill("12.5")
        await dialog.getByLabel(/observações/i).fill("Pico de uso")
        await dialog.getByRole("button", { name: /criar registro/i }).click()

        await expect(dialog).not.toBeVisible()

        const row = page.getByTestId("consumption-row-rec-1")
        await expect(row).toBeVisible()
        await expect(row).toContainText("Dia")
        await expect(row).toContainText("12,50")
        await expect(row).toContainText(/R\$\s9,38/)

        // ── EDITAR
        await page.getByTestId("consumption-row-rec-1-menu-trigger").click()
        await page.getByTestId("consumption-row-rec-1-menu-edit").click()

        const editDialog = page.getByTestId("consumption-form-dialog")
        await expect(editDialog).toBeVisible()
        await expect(
            editDialog.getByRole("heading", { name: /editar registro/i }),
        ).toBeVisible()

        await expect(
            editDialog.getByTestId("consumption-form-edit-warning"),
        ).toBeVisible()
        await expect(editDialog.getByLabel(/período/i)).toBeDisabled()
        await expect(editDialog.getByLabel(/^data/i)).toBeDisabled()

        const kwhInput = editDialog.getByLabel(/consumo \(kwh\)/i)
        await kwhInput.fill("20")
        await editDialog
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        await expect(editDialog).not.toBeVisible()
        await expect(row).toContainText("20,00")
        await expect(row).toContainText(/R\$\s15,00/)

        // ── EXCLUIR
        await page.getByTestId("consumption-row-rec-1-menu-trigger").click()
        await page.getByTestId("consumption-row-rec-1-menu-delete").click()

        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog).toBeVisible()
        await expect(confirmDialog).toContainText(/excluir registro/i)
        await confirmDialog
            .getByRole("button", { name: /excluir/i })
            .click()

        await expect(row).not.toBeVisible()
        await expect(
            page.getByText(/cadastre o consumo desta propriedade/i),
        ).toBeVisible()
    })
})

test.describe("Consumo — criação em AREA", () => {
    test("cria registro através da AreaDetailsPage", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: ConsumptionMockState = {
            records: [],
            nextId: 1,
            nextErrors: {},
        }
        await setupConsumptionRoutes(page, state)

        await page.goto("/propriedades/prop-1/areas/area-1")
        await hideDevTools(page)

        await expect(
            page.getByText(/cadastre o consumo desta área/i),
        ).toBeVisible()

        await page.getByTestId("consumption-section-create").click()

        const dialog = page.getByTestId("consumption-form-dialog")
        await expect(dialog).toBeVisible()

        await dialog.getByLabel(/período/i).selectOption("MONTHLY")
        await dialog.getByLabel(/^mês/i).fill("2025-01")
        await dialog.getByLabel(/consumo \(kwh\)/i).fill("450")
        await dialog.getByRole("button", { name: /criar registro/i }).click()

        await expect(dialog).not.toBeVisible()

        const row = page.getByTestId("consumption-row-rec-1")
        await expect(row).toBeVisible()
        await expect(row).toContainText("Mês")
        await expect(row).toContainText("Janeiro de 2025")
        await expect(row).toContainText("450,00")

        expect(state.records[0]!.areaId).toBe("area-1")
        expect(state.records[0]!.propertyId).toBe(null)
    })
})

test.describe("Consumo — criação em DEVICE", () => {
    test("cria registro HOURLY através da DeviceDetailsPage", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const state: ConsumptionMockState = {
            records: [],
            nextId: 1,
            nextErrors: {},
        }
        await setupConsumptionRoutes(page, state)

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
        // DevTools flutuante pode cobrir elementos no fundo da página
        await hideDevTools(page)

        await expect(
            page.getByText(/cadastre o consumo deste dispositivo/i),
        ).toBeVisible()

        await page.getByTestId("consumption-section-create").click()

        const dialog = page.getByTestId("consumption-form-dialog")
        await expect(dialog).toBeVisible()

        await dialog.getByLabel(/período/i).selectOption("HOURLY")
        await dialog.getByLabel(/data e hora/i).fill("2025-01-15T14:00")
        await dialog.getByLabel(/consumo \(kwh\)/i).fill("0.8")
        await dialog.getByLabel(/observações/i).fill("TV ligada")
        await dialog.getByRole("button", { name: /criar registro/i }).click()

        await expect(dialog).not.toBeVisible()

        const row = page.getByTestId("consumption-row-rec-1")
        await expect(row).toBeVisible()
        await expect(row).toContainText("Hora")
        // formatKwh(0.8) → "0,80" (minimumFractionDigits:2, não 3)
        // Intl preenche até o MÍNIMO, não força o MÁXIMO
        await expect(row).toContainText("0,80")

        await expect(
            page.getByTestId("consumption-row-rec-1-notes-icon"),
        ).toBeVisible()

        expect(state.records[0]!.deviceId).toBe("device-1")
        expect(state.records[0]!.areaId).toBe(null)
        expect(state.records[0]!.propertyId).toBe(null)
    })
})

test.describe("Consumo — filtro de período", () => {
    test("chips filtram a lista e o toggle desativa", async ({ page }) => {
        await setupBaseFixtures(page)

        const baseTimestamp = new Date().toISOString()
        const state: ConsumptionMockState = {
            records: [
                {
                    id: "rec-monthly-1",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    period: "MONTHLY",
                    referenceDate: "2025-01-01T12:00:00.000Z",
                    kwhConsumed: 450,
                    costBrl: 337.5,
                    notes: null,
                    createdAt: baseTimestamp,
                    updatedAt: baseTimestamp,
                },
                {
                    id: "rec-daily-1",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    period: "DAILY",
                    referenceDate: "2025-01-15T12:00:00.000Z",
                    kwhConsumed: 12.5,
                    costBrl: 9.375,
                    notes: null,
                    createdAt: baseTimestamp,
                    updatedAt: baseTimestamp,
                },
                {
                    id: "rec-annual-1",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    period: "ANNUAL",
                    referenceDate: "2024-01-01T12:00:00.000Z",
                    kwhConsumed: 5000,
                    costBrl: 3750,
                    notes: null,
                    createdAt: baseTimestamp,
                    updatedAt: baseTimestamp,
                },
            ],
            nextId: 2,
            nextErrors: {},
        }
        await setupConsumptionRoutes(page, state)

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // Sem filtro: 3 linhas
        await expect(
            page.getByTestId("consumption-row-rec-monthly-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-daily-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-annual-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-period-total"),
        ).toContainText("3 registros")

        // Filtra por MÊS — agora com regex, ?period=MONTHLY é tratado ✓
        await page.getByRole("button", { name: "Mês" }).click()

        await expect(
            page.getByTestId("consumption-row-rec-monthly-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-daily-1"),
        ).not.toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-annual-1"),
        ).not.toBeVisible()
        await expect(
            page.getByTestId("consumption-period-total"),
        ).toContainText("1 registro")

        // Toggle off
        await page.getByRole("button", { name: "Mês" }).click()

        await expect(
            page.getByTestId("consumption-row-rec-monthly-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-daily-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("consumption-row-rec-annual-1"),
        ).toBeVisible()

        // Filtro sem registros → EmptyState com mensagem específica
        await page.getByRole("button", { name: "Hora" }).click()

        await expect(
            page.getByText(
                /não há registros desta propriedade para o período selecionado/i,
            ),
        ).toBeVisible()
    })
})

test.describe("Consumo — erro 409 (duplicata)", () => {
    test("backend retorna 409 → toast de erro e dialog NÃO fecha", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        const state: ConsumptionMockState = {
            records: [],
            nextId: 1,
            nextErrors: {
                POST_property: {
                    status: 409,
                    message:
                        "Já existe um registro DAILY para esta propriedade na data informada.",
                },
            },
        }
        await setupConsumptionRoutes(page, state)

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await page.getByTestId("consumption-section-create").click()

        const dialog = page.getByTestId("consumption-form-dialog")
        await expect(dialog).toBeVisible()

        await dialog.getByLabel(/consumo \(kwh\)/i).fill("12.5")
        await dialog.getByRole("button", { name: /criar registro/i }).click()

        // Toast com mensagem do backend
        await expect(
            page.getByText(/já existe um registro daily/i),
        ).toBeVisible()

        // Dialog continua aberto
        await expect(dialog).toBeVisible()

        // Nenhum registro criado
        expect(state.records).toHaveLength(0)
    })
})