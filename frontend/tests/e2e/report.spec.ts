import { test, expect, type Page, type Route } from "@playwright/test"
import fs from "node:fs/promises"

const FAKE_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpZCI6InVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidXNlclR5cGUiOiJJTkRJVklEVUFMIiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9." +
    "signature"

const FAKE_USER = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

const DIST_CEMIG = {
    id: "dist-cemig",
    name: "CEMIG",
    region: "MG",
    tariffPerKwh: 0.75,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
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
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

const AREA_1 = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

const DEVICE_1 = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split",
    powerWatts: 1200,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

const sampleRecords = [
    {
        id: "rec-1",
        propertyId: "prop-1",
        areaId: null,
        deviceId: null,
        period: "MONTHLY",
        referenceDate: "2025-01-15T12:00:00.000Z",
        kwhConsumed: 80,
        costBrl: 60,
        notes: null,
        createdAt: "2025-01-15T12:00:00.000Z",
        updatedAt: "2025-01-15T12:00:00.000Z",
    },
    {
        id: "rec-2",
        propertyId: "prop-1",
        areaId: null,
        deviceId: null,
        period: "MONTHLY",
        referenceDate: "2025-02-15T12:00:00.000Z",
        kwhConsumed: 95,
        costBrl: 71.25,
        notes: null,
        createdAt: "2025-02-15T12:00:00.000Z",
        updatedAt: "2025-02-15T12:00:00.000Z",
    },
]

const baseReport = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY" as const,
    target: { type: "PROPERTY" as const, propertyId: "prop-1" },
    dateRange: null,
    summary: {
        totalKwh: 175,
        totalCostBrl: 131.25,
        recordCount: 2,
        avgKwhPerRecord: 87.5,
        trend: "INCREASING" as const,
    },
    records: sampleRecords,
}

const fulfillJson = (route: Route, data: unknown) =>
    route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data }),
    })

const fulfillError = (route: Route, message: string, status = 500) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message }),
    })

const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
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
    await page.route(
        /\/api\/properties\/prop-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices\/device-1\/consumption(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(/\/api\/alerts(\?.*)?$/, (route) =>
        fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/alerts(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/alerts(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices\/device-1\/alerts(\?.*)?$/,
        (route) => fulfillJson(route, []),
    )
    await page.route("**/api/alerts/stream", (route) =>
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

test.describe("Relatório de propriedade — fluxo completo", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("página de relatório carrega, troca período e seleciona preset", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        let lastReportQuery = ""
        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => {
                lastReportQuery = new URL(route.request().url()).search
                return fulfillJson(route, baseReport)
            },
        )

        await page.goto("/propriedades/prop-1/relatorio")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /relatório de consumo/i }),
        ).toBeVisible()
        await expect(
            page.locator("header").getByText(/casa principal/i),
        ).toBeVisible()

        await expect(
            page.getByTestId("report-period-chip-monthly"),
        ).toHaveAttribute("aria-pressed", "true")

        expect(lastReportQuery).toContain("target=PROPERTY")
        expect(lastReportQuery).toContain("period=MONTHLY")

        await expect(page.getByTestId("report-summary-cards")).toBeVisible()
        await expect(page.getByTestId("report-chart")).toBeVisible()
        await expect(page.getByTestId("report-records-table")).toBeVisible()

        // Troca para DAILY
        await page.getByTestId("report-period-chip-daily").click()
        await expect(page).toHaveURL(/period=DAILY/)
        await expect.poll(() => lastReportQuery).toContain("period=DAILY")

        // Aplica preset "Este ano"
        await page.getByTestId("report-date-preset-this-year").click()
        await expect(page).toHaveURL(/dateFrom=\d{4}-01-01/)
        await expect(page).toHaveURL(/dateTo=\d{4}-\d{2}-\d{2}/)
        await expect
            .poll(() => lastReportQuery)
            .toMatch(/dateFrom=\d{4}-01-01/)
    })

    test("URL inicial com filtros já aplicados", async ({ page }) => {
        await setupBaseFixtures(page)

        let lastReportQuery = ""
        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => {
                lastReportQuery = new URL(route.request().url()).search
                return fulfillJson(route, baseReport)
            },
        )

        await page.goto(
            "/propriedades/prop-1/relatorio?period=ANNUAL&dateFrom=2024-01-01&dateTo=2024-12-31",
        )
        await hideDevTools(page)

        await expect.poll(() => lastReportQuery).toContain("period=ANNUAL")
        await expect
            .poll(() => lastReportQuery)
            .toContain("dateFrom=2024-01-01")
        await expect.poll(() => lastReportQuery).toContain("dateTo=2024-12-31")

        await expect(
            page.getByTestId("report-period-chip-annual"),
        ).toHaveAttribute("aria-pressed", "true")
    })

    test("mostra erro inline quando dateTo < dateFrom", async ({ page }) => {
        await setupBaseFixtures(page)

        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => fulfillJson(route, baseReport),
        )

        // Navegar com range inválido na URL é mais robusto que injetar
        // valores em inputs controlados pelo React via DOM events.
        await page.goto(
            "/propriedades/prop-1/relatorio?period=MONTHLY&dateFrom=2025-06-30&dateTo=2025-01-01",
        )
        await hideDevTools(page)

        await expect(
            page.getByText(/maior ou igual à inicial/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("report-filter-dateTo"),
        ).toHaveAttribute("aria-invalid", "true")
    })

    test("EmptyState quando o backend retorna records=[]", async ({ page }) => {
        await setupBaseFixtures(page)

        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) =>
                fulfillJson(route, {
                    ...baseReport,
                    summary: {
                        totalKwh: 0,
                        totalCostBrl: 0,
                        recordCount: 0,
                        avgKwhPerRecord: 0,
                        trend: "INSUFFICIENT_DATA",
                    },
                    records: [],
                }),
        )

        await page.goto("/propriedades/prop-1/relatorio")
        await hideDevTools(page)

        await expect(page.getByTestId("report-summary-cards")).toBeVisible()
        await expect(
            page.getByText(/sem registros no intervalo/i),
        ).toBeVisible()
        await expect(page.getByTestId("report-chart")).toHaveCount(0)
        await expect(page.getByTestId("report-records-table")).toHaveCount(0)
    })

    test("banner de erro quando o backend falha", async ({ page }) => {
        await setupBaseFixtures(page)

        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => fulfillError(route, "Falha de rede simulada", 500),
        )

        await page.goto("/propriedades/prop-1/relatorio")
        await hideDevTools(page)

        await expect(page.getByRole("alert")).toBeVisible()
        // extractErrorMessage lê error.response?.data?.message do body Axios
        await expect(page.getByRole("alert")).toContainText(
            /falha de rede simulada/i,
        )
        await expect(page.getByTestId("report-filters")).toBeVisible()
    })
})

test.describe("Relatório de área — smoke", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("carrega via URL direta e chama target=AREA", async ({ page }) => {
        await setupBaseFixtures(page)

        let lastQuery = ""
        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => {
                lastQuery = new URL(route.request().url()).search
                return fulfillJson(route, {
                    ...baseReport,
                    target: {
                        type: "AREA",
                        propertyId: "prop-1",
                        areaId: "area-1",
                    },
                })
            },
        )

        await page.goto("/propriedades/prop-1/areas/area-1/relatorio")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /relatório de consumo/i }),
        ).toBeVisible()
        await expect(
            page.locator("header").getByText("Sala", { exact: true }),
        ).toBeVisible()

        await expect.poll(() => lastQuery).toContain("target=AREA")
        await expect.poll(() => lastQuery).toContain("targetId=area-1")
        await expect(page.getByTestId("report-summary-cards")).toBeVisible()
    })
})

test.describe("Relatório de dispositivo — smoke", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("carrega via URL direta e chama target=DEVICE com targetAreaId", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        let lastQuery = ""
        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => {
                lastQuery = new URL(route.request().url()).search
                return fulfillJson(route, {
                    ...baseReport,
                    target: {
                        type: "DEVICE",
                        propertyId: "prop-1",
                        areaId: "area-1",
                        deviceId: "device-1",
                    },
                })
            },
        )

        await page.goto(
            "/propriedades/prop-1/areas/area-1/devices/device-1/relatorio",
        )
        await hideDevTools(page)

        await expect(page.getByText("Ar-condicionado")).toBeVisible()
        await expect.poll(() => lastQuery).toContain("target=DEVICE")
        await expect.poll(() => lastQuery).toContain("targetId=device-1")
        await expect.poll(() => lastQuery).toContain("targetAreaId=area-1")
    })
})

test.describe("Relatório — exportar CSV", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("dispara download de CSV com BOM, meta e tabela", async ({ page }) => {
        await setupBaseFixtures(page)

        await page.route(
            /\/api\/properties\/prop-1\/report(\?.*)?$/,
            (route) => fulfillJson(route, baseReport),
        )

        await page.goto("/propriedades/prop-1/relatorio")
        await hideDevTools(page)

        await expect(page.getByTestId("report-action-csv")).toBeVisible()

        const downloadPromise = page.waitForEvent("download")
        await page.getByTestId("report-action-csv").click()
        const download = await downloadPromise

        expect(download.suggestedFilename()).toMatch(
            /^relatorio_property_prop-1_\d{4}-\d{2}-\d{2}\.csv$/,
        )

        const filePath = await download.path()
        expect(filePath).not.toBeNull()

        const fileBuffer = await fs.readFile(filePath!)
        const content = fileBuffer.toString("utf-8")

        expect(content.charCodeAt(0)).toBe(0xfeff)
        expect(content).toContain("Alvo,Relatório desta propriedade")
        expect(content).toContain("Período,Mensal")
        expect(content).toContain("Tendência,Em alta")
        expect(content).toContain("Período,Data,kWh,Custo (BRL),Observações")
    })
})