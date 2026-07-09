import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E do Dashboard cross-propriedades.
 *
 * Estratégia de mock:
 *   - /api/properties → lista de N propriedades (variável por cenário)
 *   - /api/properties/:id/report → uma rota por ID, via regex
 *   - /api/alerts → lista vazia (badge zerado, sem poluição visual)
 *   - Outros endpoints de suporte (auth, distribuidoras) seguem o padrão
 *     do setupBaseFixtures dos outros specs.
 *
 * Cenários cobertos:
 *   1. Carregamento com 2 propriedades — KPIs, ranking, tabela com links
 *   2. URL sync — chip ANNUAL ativo ao navegar com ?period=ANNUAL
 *   3. Troca de period via chip — URL atualiza, re-fetch dispara
 *   4. Empty state — user sem propriedades vê CTA
 *   5. Erro parcial — 1 de 2 reports falha, banner exibe "1 de 2"
 *   6. Erro fatal — lista de propriedades falha, banner de erro exibido
 */

// ─── Constantes ──────────────────────────────────────────────────────────────

const FAKE_USER = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    role: "USER",
    mfaEnabled: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
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

const PROP_2 = {
    id: "prop-2",
    userId: "user-123",
    distributorId: "dist-cemig",
    name: "Escritório Centro",
    address: "Av. Afonso Pena, 1500",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30130-005",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

type ReportTrend = "INCREASING" | "DECREASING" | "STABLE" | "INSUFFICIENT_DATA"

interface FakeReport {
    generatedAt: string
    period: "DAILY" | "MONTHLY" | "ANNUAL"
    target: { type: "PROPERTY"; propertyId: string }
    dateRange: null
    summary: {
        totalKwh: number
        totalCostBrl: number
        recordCount: number
        avgKwhPerRecord: number
        trend: ReportTrend
    }
    records: Array<{
        id: string
        propertyId: string
        areaId: null
        deviceId: null
        period: "DAILY" | "MONTHLY" | "ANNUAL"
        referenceDate: string
        kwhConsumed: number
        costBrl: number
        notes: null
        createdAt: string
        updatedAt: string
    }>
}

const makeReport = (propertyId: string, overrides: Partial<FakeReport> = {}): FakeReport => {
    const isProp1 = propertyId === "prop-1"
    return {
        generatedAt: "2025-05-13T12:00:00.000Z",
        period: "MONTHLY",
        target: { type: "PROPERTY", propertyId },
        dateRange: null,
        summary: {
            totalKwh: isProp1 ? 200 : 100,
            totalCostBrl: isProp1 ? 100 : 50,
            recordCount: isProp1 ? 2 : 1,
            avgKwhPerRecord: 100,
            trend: isProp1 ? "INCREASING" : "STABLE",
        },
        records: [
            {
                id: `rec-${propertyId}`,
                propertyId,
                areaId: null,
                deviceId: null,
                period: "MONTHLY",
                referenceDate: "2025-01-01T00:00:00.000Z",
                kwhConsumed: isProp1 ? 200 : 100,
                costBrl: isProp1 ? 100 : 50,
                notes: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                updatedAt: "2025-01-01T00:00:00.000Z",
            },
        ],
        ...overrides,
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Oculta TanStack Devtools via CSS injetado. Idêntico ao padrão dos
 * outros specs — sobrevive a re-renders, ao contrário de .remove().
 */
const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })

/**
 * Mocks compartilhados: auth, distribuidora, alertas (badge zerado),
 * SSE stream. Cada teste configura /api/properties e /api/.../report.
 */
const setupBaseFixtures = async (page: Page) => {
    // Desde a #06 (sessão WEB via cookie httpOnly), a única rota que precisa
    // ser mockada para simular "usuário autenticado" é GET /auth/me.
    await page.route("**/api/auth/me", (route) =>
        fulfillJson(route, FAKE_USER),
    )
    await page.route("**/api/distributors", (route) =>
        fulfillJson(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )

    // Alertas — lista vazia garante badge zerado e evita re-renders
    // que causariam "element detached" em clicks subsequentes.
    await page.route(/\/api\/alerts(\?.*)?$/, (route) =>
        fulfillJson(route, []),
    )

    // SSE — stream vazio (mesma estratégia dos outros specs)
    await page.route("**/api/iot/stream", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: "",
        }),
    )
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe("Dashboard — carregamento com 2 propriedades", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("exibe KPIs agregados, ranking e tabela com links corretos", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        await page.route("**/api/properties", (route) =>
            fulfillJson(route, [PROP_1, PROP_2]),
        )
        await page.route(/\/api\/properties\/prop-1\/report(\?.*)?$/, (route) =>
            fulfillJson(route, makeReport("prop-1")),
        )
        await page.route(/\/api\/properties\/prop-2\/report(\?.*)?$/, (route) =>
            fulfillJson(route, makeReport("prop-2")),
        )

        await page.goto("/dashboard")
        await hideDevTools(page)

        // Saudação com firstName
        await expect(
            page.getByRole("heading", { name: /olá, joão/i }),
        ).toBeVisible()

        // Summary cards — totalKwh = 200 + 100 = 300
        const kwhCard = page.getByTestId("dashboard-summary-totalKwh")
        await expect(kwhCard).toBeVisible()
        await expect(kwhCard).toContainText("300,00")
        await expect(kwhCard).toContainText("kWh")

        // Propriedades: 2 de 2 com dados
        const propsCard = page.getByTestId("dashboard-summary-properties")
        await expect(propsCard).toContainText("2")

        // Tabela com as 2 propriedades
        await expect(
            page.getByTestId("dashboard-properties-table"),
        ).toBeVisible()
        await expect(
            page.getByTestId("dashboard-property-row-prop-1"),
        ).toBeVisible()
        await expect(
            page.getByTestId("dashboard-property-row-prop-2"),
        ).toBeVisible()

        // Link da tabela aponta para /relatorio preservando period=MONTHLY
        const linkProp1 = page.getByRole("link", {
            name: /ver relatório de casa principal/i,
        })
        await expect(linkProp1).toHaveAttribute(
            "href",
            /\/propriedades\/prop-1\/relatorio\?period=MONTHLY/,
        )
    })
})

test.describe("Dashboard — URL sync", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("chip ANNUAL fica ativo ao navegar com ?period=ANNUAL", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        await page.route("**/api/properties", (route) =>
            fulfillJson(route, [PROP_1]),
        )
        await page.route(/\/api\/properties\/prop-1\/report(\?.*)?$/, (route) =>
            fulfillJson(route, makeReport("prop-1")),
        )

        await page.goto("/dashboard?period=ANNUAL")
        await hideDevTools(page)

        await expect(
            page.getByTestId("report-period-chip-annual"),
        ).toHaveAttribute("aria-pressed", "true")
        await expect(
            page.getByTestId("report-period-chip-monthly"),
        ).toHaveAttribute("aria-pressed", "false")
    })

    test("trocar period via chip atualiza URL e re-faz as queries", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        const queriesSeen: string[] = []

        await page.route("**/api/properties", (route) =>
            fulfillJson(route, [PROP_1]),
        )
        await page.route(/\/api\/properties\/prop-1\/report(\?.*)?$/, (route) => {
            queriesSeen.push(new URL(route.request().url()).search)
            return fulfillJson(route, makeReport("prop-1"))
        })

        await page.goto("/dashboard")
        await hideDevTools(page)

        // Espera o dashboard carregar
        await expect(
            page.getByTestId("dashboard-summary-cards"),
        ).toBeVisible()

        // Troca para DAILY
        await page.getByTestId("report-period-chip-daily").click()

        // URL atualiza
        await expect(page).toHaveURL(/period=DAILY/)

        // Nova query com DAILY foi disparada
        await expect
            .poll(() => queriesSeen.some((q) => q.includes("period=DAILY")))
            .toBe(true)

        // Chip DAILY fica ativo
        await expect(
            page.getByTestId("report-period-chip-daily"),
        ).toHaveAttribute("aria-pressed", "true")
    })
})

test.describe("Dashboard — empty state", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("user sem propriedades vê CTA para cadastrar a primeira", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        await page.route("**/api/properties", (route) =>
            fulfillJson(route, []),
        )

        await page.goto("/dashboard")
        await hideDevTools(page)

        const cta = page.getByTestId("dashboard-cta-create-property")
        await expect(cta).toBeVisible()
        await expect(cta).toHaveAttribute("href", "/propriedades/nova")

        // Sem propriedades → nenhum card de KPI
        await expect(
            page.getByTestId("dashboard-summary-cards"),
        ).toBeHidden()
    })
})

test.describe("Dashboard — erro parcial", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("banner '1 de 2' quando um report falha, outro carrega normalmente", async ({
        page,
    }) => {
        await setupBaseFixtures(page)

        await page.route("**/api/properties", (route) =>
            fulfillJson(route, [PROP_1, PROP_2]),
        )
        // prop-1 OK, prop-2 falha
        await page.route(/\/api\/properties\/prop-1\/report(\?.*)?$/, (route) =>
            fulfillJson(route, makeReport("prop-1")),
        )
        await page.route(/\/api\/properties\/prop-2\/report(\?.*)?$/, (route) =>
            fulfillError(route, "Timeout de rede", 504),
        )

        await page.goto("/dashboard")
        await hideDevTools(page)

        const banner = page.getByTestId("dashboard-partial-error")
        await expect(banner).toBeVisible()
        await expect(banner).toContainText("1 de 2")

        // A propriedade que deu erro aparece na tabela com role="alert"
        const errorRow = page.getByTestId("dashboard-property-row-prop-2")
        await expect(errorRow).toBeVisible()
        await expect(errorRow.getByRole("alert")).toBeVisible()

        // A que funcionou aparece normalmente
        const okRow = page.getByTestId("dashboard-property-row-prop-1")
        await expect(okRow).toBeVisible()
        await expect(okRow.getByRole("link").first()).toBeVisible()
    })
})

test.describe("Dashboard — erro fatal", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("banner de erro quando /api/properties falha", async ({ page }) => {
        await setupBaseFixtures(page)

        await page.route("**/api/properties", (route) =>
            fulfillError(route, "Sem permissão", 403),
        )

        await page.goto("/dashboard")
        await hideDevTools(page)

        const errorBanner = page.getByTestId("dashboard-error")
        await expect(errorBanner).toBeVisible()
        await expect(errorBanner).toContainText(/sem permissão/i)

        // Sem cards de KPI
        await expect(
            page.getByTestId("dashboard-summary-cards"),
        ).toBeHidden()
    })
})