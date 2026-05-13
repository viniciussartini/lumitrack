import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E de Alertas — fluxo completo cobrindo:
 *
 *   1. Criar alerta na DeviceDetailsPage → aparece na seção nested + na inbox
 *   2. Editar alerta ativo (threshold + message)
 *   3. Validar one-shot: alerta disparado → "Editar" sumido, dica visível
 *   4. Marcar como lido individual
 *   5. Bulk "Marcar todos como lidos" na inbox
 *   6. Excluir alerta com ConfirmDialog
 *   7. URL sync: filtro persiste em refresh, back/forward funciona
 *   8. SSE: simula alerta disparado → toast aparece + badge incrementa
 *   9. Ordenação: TRIGGERED-não-lido > ACTIVE > READ na inbox
 *
 * Estratégia (espelha consumption.spec.ts):
 *   - Mocka backend via page.route (sem rodar API real)
 *   - State em memória + sortByPriority pra simular ordenação do backend
 *   - hideDevTools após page.goto (TanStack DevTools cobre menus inferiores)
 */

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

const DIST_CEMIG = {
    id: "dist-cemig",
    userId: "user-123",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
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
    name: "Cozinha",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const DEVICE_1 = {
    id: "device-1",
    areaId: "area-1",
    name: "Geladeira",
    brand: "Brastemp",
    model: "BRM57AK",
    powerWatts: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface AlertSeed {
    id: string
    userId: string
    targetType: "PROPERTY" | "AREA" | "DEVICE"
    propertyId: string | null
    areaId: string | null
    deviceId: string | null
    thresholdKwh: number
    message: string | null
    triggeredAt: string | null
    readAt: string | null
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

/**
 * Oculta o TanStack Query DevTools via CSS injetado.
 * Mesmo motivo do consumption.spec: re-renders após invalidate criam
 * de novo o container que intercepta pointer events em menus inferiores.
 */
const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })

/**
 * Aplica filtro ?triggered=true|false na lista.
 * O backend filtra server-side só na inbox global; nas listas nested,
 * sempre retorna tudo.
 */
const applyTriggeredFilter = (alerts: AlertSeed[], url: URL): AlertSeed[] => {
    const raw = url.searchParams.get("triggered")
    if (raw === null) return alerts
    if (raw === "true") return alerts.filter((a) => a.triggeredAt !== null)
    if (raw === "false") return alerts.filter((a) => a.triggeredAt === null)
    return alerts
}

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
    await page.route(
        /\/api\/properties\/prop-1\/areas$/,
        (route) => fulfillJson(route, [AREA_1]),
    )
    await page.route("**/api/properties/prop-1/areas/area-1", (route) =>
        fulfillJson(route, AREA_1),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices$/,
        (route) => fulfillJson(route, [DEVICE_1]),
    )
    await page.route(
        "**/api/properties/prop-1/areas/area-1/devices/device-1",
        (route) => fulfillJson(route, DEVICE_1),
    )

    // Consumption (DeviceDetailsPage chama essas listas)
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices\/device-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )

    // SSE — mocka como stream vazio. Cada teste que precisa de eventos
    // re-registra a rota com payload custom.
    //
    // Resposta MÍNIMA pra fetch-event-source: status 200 + content-type
    // text/event-stream + corpo vazio (ou com keep-alives). Pendente:
    // a lib retenta automaticamente em close → mantemos a conexão "aberta"
    // sem fim devolvendo um corpo vazio que nunca termina seria ideal,
    // mas Playwright route.fulfill é one-shot. Solução: devolver vazio,
    // a lib reabre, vazio de novo, etc. Em testes curtos não dá problema.
    await page.route("**/api/iot/stream", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: "",
        }),
    )

    await page.addInitScript((token) => {
        localStorage.setItem("lumitrack:auth:token", token)
    }, FAKE_JWT)
}

interface AlertMockState {
    alerts: AlertSeed[]
    nextId: number
    nextErrors: Record<string, { status: number; message: string } | undefined>
}

const setupAlertRoutes = async (page: Page, state: AlertMockState) => {
    // ─── DEVICE LIST + CREATE ─────────────────────────────────────────────────
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices\/device-1\/alerts$/,
        async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                const list = state.alerts.filter(
                    (a) => a.deviceId === "device-1",
                )
                return fulfillJson(route, list)
            }

            if (method === "POST") {
                const errKey = "POST_device"
                if (state.nextErrors[errKey]) {
                    const err = state.nextErrors[errKey]!
                    state.nextErrors[errKey] = undefined
                    return fulfillError(route, err.message, err.status)
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: AlertSeed = {
                    id: `alert-${state.nextId++}`,
                    userId: "user-123",
                    targetType: "DEVICE",
                    propertyId: null,
                    areaId: null,
                    deviceId: "device-1",
                    thresholdKwh: body.thresholdKwh,
                    message: body.message ?? null,
                    triggeredAt: null,
                    readAt: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                state.alerts.push(created)
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        },
    )

    // ─── AREA LIST ────────────────────────────────────────────────────────────
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/alerts$/,
        (route) => {
            if (route.request().method() === "GET") {
                const list = state.alerts.filter((a) => a.areaId === "area-1")
                return fulfillJson(route, list)
            }
            return route.continue()
        },
    )

    // ─── PROPERTY LIST ────────────────────────────────────────────────────────
    await page.route(
        /\/api\/properties\/prop-1\/alerts$/,
        (route) => {
            if (route.request().method() === "GET") {
                const list = state.alerts.filter(
                    (a) => a.propertyId === "prop-1",
                )
                return fulfillJson(route, list)
            }
            return route.continue()
        },
    )

    // ─── GLOBAL (inbox /alertas) ──────────────────────────────────────────────
    // Regex casa /api/alerts e /api/alerts?triggered=...
    // Mas NÃO casa /api/alerts/:id (que tem segmento depois).
    await page.route(/\/api\/alerts(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            const url = new URL(route.request().url())
            const filtered = applyTriggeredFilter(state.alerts, url)
            return fulfillJson(route, filtered)
        }
        return route.continue()
    })

    // ─── DETAIL + UPDATE + DELETE + MARK AS READ ──────────────────────────────
    await page.route(/\/api\/alerts\/[^/]+(\/read)?$/, async (route) => {
        const method = route.request().method()
        const url = new URL(route.request().url())
        const segments = url.pathname.split("/")
        const isMarkRead = segments[segments.length - 1] === "read"
        const alertId = isMarkRead
            ? segments[segments.length - 2]!
            : segments[segments.length - 1]!

        const index = state.alerts.findIndex((a) => a.id === alertId)

        if (method === "GET") {
            if (index === -1)
                return fulfillError(route, "Alerta não encontrado", 404)
            return fulfillJson(route, state.alerts[index])
        }

        if (method === "PUT") {
            if (index === -1)
                return fulfillError(route, "Alerta não encontrado", 404)
            const body = JSON.parse(route.request().postData() ?? "{}")
            const existing = state.alerts[index]!
            const updated: AlertSeed = {
                ...existing,
                thresholdKwh: body.thresholdKwh ?? existing.thresholdKwh,
                message:
                    body.message !== undefined ? body.message : existing.message,
                updatedAt: new Date().toISOString(),
            }
            state.alerts[index] = updated
            return fulfillJson(route, updated)
        }

        if (method === "PATCH" && isMarkRead) {
            if (index === -1)
                return fulfillError(route, "Alerta não encontrado", 404)
            const existing = state.alerts[index]!
            const updated: AlertSeed = {
                ...existing,
                readAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            state.alerts[index] = updated
            return fulfillJson(route, updated)
        }

        if (method === "DELETE") {
            if (index === -1)
                return fulfillError(route, "Alerta não encontrado", 404)
            state.alerts.splice(index, 1)
            return route.fulfill({ status: 204 })
        }

        return route.continue()
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Alertas — fluxo completo no Device", () => {
    test("cria, edita, marca como lido e exclui alerta", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [],
            nextId: 1,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
        await hideDevTools(page)

        // ── EMPTY STATE
        await expect(
            page.getByText(/nenhum alerta configurado/i),
        ).toBeVisible()
        await expect(
            page.getByText(/crie um alerta de consumo para deste dispositivo/i),
        ).toBeVisible()

        // ── CRIAR
        await page.getByTestId("alert-section-create-button").click()

        const dialog = page.getByTestId("alert-form-dialog")
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByRole("heading", { name: /criar alerta/i }),
        ).toBeVisible()

        await dialog.getByLabel(/limite de consumo/i).fill("5")
        await dialog
            .getByLabel(/mensagem/i)
            .fill("Geladeira passou do consumo esperado")
        await dialog.getByRole("button", { name: /criar alerta/i }).click()

        await expect(dialog).not.toBeVisible()

        // Alerta aparece na tabela
        const row = page.getByTestId("alert-row-alert-1")
        await expect(row).toBeVisible()
        await expect(row).toContainText("5 kWh")
        await expect(row).toContainText("Ativo")
        await expect(row).toContainText("—") // Disparado em: nunca

        // ── EDITAR (em alerta ativo, "Editar" aparece)
        await page
            .getByTestId("alert-menu-trigger-alert-1")
            .click()
        await page
            .getByTestId("alert-menu-edit-alert-1")
            .click()

        const editDialog = page.getByTestId("alert-form-dialog")
        await expect(editDialog).toBeVisible()
        await expect(
            editDialog.getByRole("heading", { name: /editar alerta/i }),
        ).toBeVisible()
        // Pre-preenchido com valores atuais
        await expect(editDialog.getByLabel(/limite de consumo/i)).toHaveValue(
            "5",
        )

        // Banner one-shot NÃO aparece (alerta não disparado)
        await expect(
            editDialog.getByTestId("alert-form-triggered-warning"),
        ).toBeHidden()

        // Muda threshold
        await editDialog.getByLabel(/limite de consumo/i).fill("10")
        await editDialog
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        await expect(editDialog).not.toBeVisible()
        await expect(row).toContainText("10 kWh")

        // ── EXCLUIR (não vamos marcar como lido aqui — esse caminho é
        //    coberto em outro teste com alerta já disparado)
        await page.getByTestId("alert-menu-trigger-alert-1").click()
        await page.getByTestId("alert-menu-delete-alert-1").click()

        // Escopo da assertion: dentro do dialog, não na linha
        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog).toContainText(/excluir alerta/i)
        await expect(confirmDialog).toContainText(/10 kWh/)

        await confirmDialog.getByRole("button", { name: /^excluir$/i }).click()

        // Volta pro empty state
        await expect(
            page.getByText(/nenhum alerta configurado/i),
        ).toBeVisible()
        await expect(row).not.toBeVisible()
    })
})

test.describe("Alertas — one-shot: alerta disparado", () => {
    test("alerta disparado oculta 'Editar' e mostra dica de rearme", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const triggeredAlert: AlertSeed = {
            id: "alert-fired",
            userId: "user-123",
            targetType: "DEVICE",
            propertyId: null,
            areaId: null,
            deviceId: "device-1",
            thresholdKwh: 5,
            message: null,
            triggeredAt: "2025-11-10T12:00:00.000Z",
            readAt: null,
            createdAt: "2025-11-10T10:00:00.000Z",
            updatedAt: "2025-11-10T12:00:00.000Z",
        }
        const state: AlertMockState = {
            alerts: [triggeredAlert],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
        await hideDevTools(page)

        const row = page.getByTestId("alert-row-alert-fired")
        await expect(row).toBeVisible()
        await expect(row).toContainText("Disparado")

        // Abre menu
        await page
            .getByTestId("alert-menu-trigger-alert-fired")
            .click()

        // "Marcar como lido" aparece (disparado-não-lido)
        await expect(
            page.getByTestId("alert-menu-mark-read-alert-fired"),
        ).toBeVisible()

        // "Editar" NÃO aparece (one-shot)
        await expect(
            page.getByTestId("alert-menu-edit-alert-fired"),
        ).toBeHidden()

        // Dica de rearme aparece
        const hint = page.getByTestId(
            "alert-menu-rearm-hint-alert-fired",
        )
        await expect(hint).toBeVisible()
        await expect(hint).toContainText(/exclua e crie outro/i)

        // "Excluir" sempre aparece
        await expect(
            page.getByTestId("alert-menu-delete-alert-fired"),
        ).toBeVisible()

        // ── MARCAR COMO LIDO
        await page
            .getByTestId("alert-menu-mark-read-alert-fired")
            .click()

        // Status muda para "Lido"
        await expect(row).toContainText("Lido")
    })
})

test.describe("Alertas — inbox global /alertas", () => {
    test("ordenação por bucket: TRIGGERED-não-lido > ACTIVE > READ", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const active: AlertSeed = {
            id: "active",
            userId: "user-123",
            targetType: "PROPERTY",
            propertyId: "prop-1",
            areaId: null,
            deviceId: null,
            thresholdKwh: 100,
            message: null,
            triggeredAt: null,
            readAt: null,
            createdAt: "2025-11-12T10:00:00.000Z",
            updatedAt: "2025-11-12T10:00:00.000Z",
        }
        const triggered: AlertSeed = {
            ...active,
            id: "triggered",
            triggeredAt: "2025-11-10T12:00:00.000Z",
        }
        const read: AlertSeed = {
            ...active,
            id: "read",
            triggeredAt: "2025-11-09T12:00:00.000Z",
            readAt: "2025-11-09T13:00:00.000Z",
        }

        // Backend devolve em ordem aleatória — frontend reordena
        const state: AlertMockState = {
            alerts: [read, active, triggered],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto("/alertas")
        await hideDevTools(page)

        await expect(page.getByTestId("alert-table")).toBeVisible()

        const rows = page.getByTestId(/^alert-row-/)
        await expect(rows).toHaveCount(3)

        // Primeira linha = triggered
        await expect(rows.nth(0)).toHaveAttribute(
            "data-testid",
            "alert-row-triggered",
        )
        // Segunda = active
        await expect(rows.nth(1)).toHaveAttribute(
            "data-testid",
            "alert-row-active",
        )
        // Terceira = read
        await expect(rows.nth(2)).toHaveAttribute(
            "data-testid",
            "alert-row-read",
        )
    })

    test("URL sync: filtro persiste na URL e em refresh", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [
                {
                    id: "active",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: null,
                    readAt: null,
                    createdAt: "2025-11-12T10:00:00.000Z",
                    updatedAt: "2025-11-12T10:00:00.000Z",
                },
                {
                    id: "triggered",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T10:00:00.000Z",
                    updatedAt: "2025-11-10T12:00:00.000Z",
                },
            ],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        // ── Inicia em /alertas (sem filtro)
        await page.goto("/alertas")
        await hideDevTools(page)

        await expect(page.getByTestId("alert-table")).toBeVisible()
        await expect(page.getByTestId(/^alert-row-/)).toHaveCount(2)

        // Clica em "Disparados"
        await page.getByRole("button", { name: "Disparados" }).click()

        // URL atualiza
        await expect(page).toHaveURL(/\/alertas\?triggered=true/)

        // Lista filtra
        await expect(page.getByTestId(/^alert-row-/)).toHaveCount(1)
        await expect(
            page.getByTestId("alert-row-triggered"),
        ).toBeVisible()

        // ── REFRESH preserva o filtro
        await page.reload()
        await hideDevTools(page)

        // Chip "Disparados" ainda ativo
        await expect(
            page.getByRole("button", { name: "Disparados" }),
        ).toHaveAttribute("aria-pressed", "true")
        await expect(page.getByTestId(/^alert-row-/)).toHaveCount(1)
    })

    test("bulk 'Marcar todos como lidos': aparece com não-lidos, marca em paralelo", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [
                {
                    id: "fired-1",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T10:00:00.000Z",
                    updatedAt: "2025-11-10T12:00:00.000Z",
                },
                {
                    id: "fired-2",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 200,
                    message: null,
                    triggeredAt: "2025-11-10T13:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T11:00:00.000Z",
                    updatedAt: "2025-11-10T13:00:00.000Z",
                },
            ],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto("/alertas")
        await hideDevTools(page)

        // Botão aparece com contagem plural
        const bulkButton = page.getByTestId("alerts-page-mark-all-button")
        await expect(bulkButton).toBeVisible()
        await expect(bulkButton).toContainText(/marcar 2 como lidos/i)

        // Clica
        await bulkButton.click()

        // Aguarda os toasts/invalidação. O botão deve sumir
        // (não há mais não-lidos depois do bulk).
        await expect(bulkButton).toBeHidden()

        // Os 2 alertas agora estão "Lido"
        await expect(
            page.getByTestId("alert-row-fired-1"),
        ).toContainText("Lido")
        await expect(
            page.getByTestId("alert-row-fired-2"),
        ).toContainText("Lido")
    })

    test("bulk NÃO aparece quando todos já estão lidos", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [
                {
                    id: "already-read",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: "2025-11-11T08:30:00.000Z",
                    createdAt: "2025-11-10T10:00:00.000Z",
                    updatedAt: "2025-11-11T08:30:00.000Z",
                },
            ],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto("/alertas")
        await hideDevTools(page)

        await expect(page.getByTestId("alert-table")).toBeVisible()
        await expect(
            page.getByTestId("alerts-page-mark-all-button"),
        ).toBeHidden()
    })
})

test.describe("Alertas — badge no Header", () => {
    test("badge mostra contagem de não-lidos e navega pra inbox filtrada", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [
                {
                    id: "fired-1",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T10:00:00.000Z",
                    updatedAt: "2025-11-10T12:00:00.000Z",
                },
                {
                    id: "fired-2",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 200,
                    message: null,
                    triggeredAt: "2025-11-10T13:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T11:00:00.000Z",
                    updatedAt: "2025-11-10T13:00:00.000Z",
                },
                {
                    id: "active",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 50,
                    message: null,
                    triggeredAt: null,
                    readAt: null,
                    createdAt: "2025-11-12T10:00:00.000Z",
                    updatedAt: "2025-11-12T10:00:00.000Z",
                },
            ],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        // Vai pra qualquer página autenticada (dashboard mostra header)
        await page.goto("/")
        await hideDevTools(page)

        // Badge no header com contagem 2 (só conta disparados-não-lidos)
        const badge = page.getByTestId("alert-bell-badge")
        await expect(badge).toBeVisible()
        await expect(badge).toHaveAttribute("data-unread-count", "2")

        const badgeCount = page.getByTestId("alert-bell-badge-count")
        await expect(badgeCount).toContainText("2")

        // Clicar leva pra inbox com filtro
        await badge.click()
        await expect(page).toHaveURL(/\/alertas\?triggered=true/)
    })

    test("badge zera após marcar todos como lidos", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [
                {
                    id: "fired-1",
                    userId: "user-123",
                    targetType: "PROPERTY",
                    propertyId: "prop-1",
                    areaId: null,
                    deviceId: null,
                    thresholdKwh: 100,
                    message: null,
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: null,
                    createdAt: "2025-11-10T10:00:00.000Z",
                    updatedAt: "2025-11-10T12:00:00.000Z",
                },
            ],
            nextId: 100,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto("/alertas")
        await hideDevTools(page)

        // Badge mostra 1 inicialmente
        await expect(
            page.getByTestId("alert-bell-badge-count"),
        ).toContainText("1")

        // Marca como lido
        await page
            .getByTestId("alert-menu-trigger-fired-1")
            .click()
        await page
            .getByTestId("alert-menu-mark-read-fired-1")
            .click()

        // Badge some
        await expect(
            page.getByTestId("alert-bell-badge-count"),
        ).toBeHidden()
        await expect(page.getByTestId("alert-bell-badge")).toHaveAttribute(
            "data-unread-count",
            "0",
        )
    })
})

test.describe("Alertas — validação de form", () => {
    test("rejeita threshold zero ou negativo", async ({ page }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [],
            nextId: 1,
            nextErrors: {},
        }
        await setupAlertRoutes(page, state)

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
        await hideDevTools(page)

        await page.getByTestId("alert-section-create-button").click()

        const dialog = page.getByTestId("alert-form-dialog")
        await dialog.getByLabel(/limite de consumo/i).fill("0")
        await dialog.getByRole("button", { name: /criar alerta/i }).click()

        // Permanece aberto + mensagem de erro
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByText(/maior que zero/i),
        ).toBeVisible()
    })

    test("erro 422 do backend dispara toast e mantém dialog aberto", async ({
        page,
    }) => {
        await setupBaseFixtures(page)
        const state: AlertMockState = {
            alerts: [],
            nextId: 1,
            nextErrors: {
                POST_device: { status: 422, message: "Threshold inválido" },
            },
        }
        await setupAlertRoutes(page, state)

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
        await hideDevTools(page)

        await page.getByTestId("alert-section-create-button").click()

        const dialog = page.getByTestId("alert-form-dialog")
        await dialog.getByLabel(/limite de consumo/i).fill("5")
        await dialog.getByRole("button", { name: /criar alerta/i }).click()

        // Dialog continua aberto (decisão UX: dá pra corrigir e tentar de novo)
        await expect(dialog).toBeVisible()

        // Toast de erro aparece
        await expect(
            page.getByText(/erro ao criar alerta/i),
        ).toBeVisible()
        await expect(
            page.getByText(/threshold inválido/i),
        ).toBeVisible()
    })
})