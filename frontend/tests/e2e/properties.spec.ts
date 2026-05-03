import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Property:
 *   1. Listar (vazio inicial)
 *   2. Criar
 *   3. Editar (mudar nome)
 *   4. Trocar distribuidora vinculada
 *   5. Excluir
 */

// ─── Constantes de teste ─────────────────────────────────────────────────────

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

const DIST_ENEL = {
    ...DIST_CEMIG,
    id: "dist-enel",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Helper pra responder JSON com envelope { status: "success", data } —
 * formato padrão do backend.
 */
const fulfillJson = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data }),
    })

/**
 * Configura mocks compartilhados (auth + perfil + distribuidoras).
 *
 * Não mocka /api/properties aqui — cada teste configura suas próprias
 * respostas pra controlar o estado da lista.
 */
const setupAuthAndDistributors = async (page: Page) => {
    await page.route("**/api/users/user-123", (route) =>
        fulfillJson(route, FAKE_USER),
    )
    // Lista de distribuidoras (usada na PropertiesPage e forms)
    await page.route("**/api/distributors", (route) =>
        fulfillJson(route, [DIST_CEMIG, DIST_ENEL]),
    )
    // Detalhe de distribuidora por ID (usada na PropertyDetailsPage via
    // useDistributor — chama GET /api/distributors/:id, não a lista).
    // Sem esse mock, o Vite proxy tenta encaminhar pro backend real (3333)
    // e falha com ECONNREFUSED quando o backend não está rodando.
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    await page.route("**/api/distributors/dist-enel", (route) =>
        fulfillJson(route, DIST_ENEL),
    )
    // pre-loga o usuário pra pular tela de login
    await page.addInitScript((token) => {
        localStorage.setItem("lumitrack:auth:token", token)
    }, FAKE_JWT)
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe("Fluxo CRUD de propriedades", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, edita, troca distribuidora e exclui uma propriedade", async ({
        page,
    }) => {
        await setupAuthAndDistributors(page)

        // Estado da "DB" simulada — começa vazio, evolui ao longo do teste
        let properties: Array<typeof DIST_CEMIG & { distributorId: string }> = []

        await page.route("**/api/properties", async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, properties)
            }

            if (method === "POST") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created = {
                    id: "prop-1",
                    userId: "user-123",
                    distributorId: body.distributorId,
                    name: body.name,
                    address: body.address ?? null,
                    city: body.city ?? null,
                    state: body.state ?? null,
                    zipCode: body.zipCode ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                properties = [created as never]
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        })

        await page.route("**/api/properties/prop-1", async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, properties[0])
            }

            if (method === "PUT") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                properties[0] = {
                    ...properties[0]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                } as never
                return fulfillJson(route, properties[0])
            }

            if (method === "DELETE") {
                properties = []
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        })

        // ─── 1. Lista vazia inicialmente ─────────────────────────────────────
        await page.goto("/propriedades")

        await expect(
            page.getByRole("heading", { name: /propriedades/i, level: 1 }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhuma propriedade cadastrada/i),
        ).toBeVisible()

        // ─── 2. Criar nova propriedade ───────────────────────────────────────
        await page.getByRole("link", { name: /cadastrar primeira propriedade/i }).click()
        await expect(page).toHaveURL(/\/propriedades\/nova/)

        await page.getByLabel(/nome da propriedade/i).fill("Casa Principal")
        await page
            .getByLabel(/distribuidora vinculada/i)
            .selectOption("dist-cemig")
        await page.getByLabel(/logradouro/i).fill("Rua das Flores, 100")
        await page.getByLabel(/cidade/i).fill("Belo Horizonte")
        await page.getByLabel(/uf/i).selectOption("MG")
        await page.getByLabel(/cep/i).fill("30000000")

        await page
            .getByRole("button", { name: /cadastrar propriedade/i })
            .click()

        // Volta pra lista, agora com 1 card
        await expect(page).toHaveURL(/\/propriedades$/)
        await expect(page.getByTestId("property-card-prop-1")).toBeVisible()
        await expect(page.getByText(/cemig/i).first()).toBeVisible()

        // ─── 3. Detalhes → Editar (via botão "Editar propriedade" no header) ─
        // Click no card agora vai pra detalhes (não mais direto pra edição).
        await page.getByTestId("property-card-prop-1").click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)

        // Header da details mostra o nome e a distribuidora
        await expect(
            page.getByRole("heading", { level: 1, name: /casa principal/i }),
        ).toBeVisible()
        await expect(page.getByText(/cemig/i).first()).toBeVisible()
        // Seção de áreas — placeholder por enquanto
        await expect(page.getByText(/nenhuma área cadastrada/i)).toBeVisible()

        // Botão Editar leva pro form de edição
        await page
            .getByRole("link", { name: /editar propriedade/i })
            .click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/editar/)

        const nameInput = page.getByLabel(/nome da propriedade/i)
        await nameInput.fill("Casa Renovada")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(page).toHaveURL(/\/propriedades$/)
        await expect(page.getByText(/casa renovada/i).first()).toBeVisible()

        // ─── 4. Trocar distribuidora (via details → editar) ──────────────────
        await page.getByTestId("property-card-prop-1").click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)

        await page
            .getByRole("link", { name: /editar propriedade/i })
            .click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/editar/)

        await page
            .getByLabel(/distribuidora vinculada/i)
            .selectOption("dist-enel")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(page).toHaveURL(/\/propriedades$/)
        // Badge da distribuidora agora mostra ENEL no card
        await expect(page.getByText(/enel são paulo/i)).toBeVisible()

        // ─── 5. Excluir (via menu ⋯ no card da lista) ────────────────────────
        await page
            .getByRole("button", { name: /opções de Casa Renovada/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre
        await expect(
            page.getByRole("heading", { name: /excluir propriedade/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pro empty state
        await expect(
            page.getByText(/nenhuma propriedade cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("property-card-prop-1"),
        ).not.toBeVisible()
    })

    test("bloqueia criação de propriedade quando não há distribuidora cadastrada", async ({
        page,
    }) => {
        await page.route("**/api/users/user-123", (route) =>
            fulfillJson(route, FAKE_USER),
        )
        // Distribuidoras vazia
        await page.route("**/api/distributors", (route) =>
            fulfillJson(route, []),
        )
        await page.route("**/api/properties", (route) =>
            fulfillJson(route, []),
        )

        await page.addInitScript((token) => {
            localStorage.setItem("lumitrack:auth:token", token)
        }, FAKE_JWT)

        await page.goto("/propriedades/nova")

        await expect(
            page.getByText(/cadastre uma distribuidora primeiro/i),
        ).toBeVisible()
        await expect(
            page.getByRole("link", { name: /cadastrar distribuidora/i }),
        ).toHaveAttribute("href", "/distribuidoras/nova")
    })
})