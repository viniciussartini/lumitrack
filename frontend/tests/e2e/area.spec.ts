import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Area:
 *   1. Listar (vazio inicial — EmptyState dentro de PropertyDetailsPage)
 *   2. Criar (via botão "Adicionar área" no header da seção)
 *   3. Ver detalhes (click no card)
 *   4. Editar (via botão "Editar área" no header da AreaDetailsPage)
 *   5. Excluir (via menu ⋯ na AreaDetailsPage)
 *
 * Um teste paralelo cobre o fluxo via menu ⋯ no card da lista (editar e
 * excluir) — caminhos que não passam pela AreaDetailsPage.
 *
 * O spec parte com 1 propriedade já cadastrada e 0 áreas. Não testamos
 * o fluxo de criar a propriedade aqui (já coberto em properties.spec.ts).
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

interface AreaSeed {
    id: string
    propertyId: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
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
 * Configura mocks compartilhados (auth + perfil + distribuidoras + 1 propriedade).
 * As ÁREAS são geridas dentro de cada teste via closure mutável, porque o
 * estado da DB simulada evolui ao longo do fluxo (criar, editar, deletar).
 */
const setupAuthAndProperty = async (page: Page) => {
    await page.route("**/api/users/user-123", (route) =>
        fulfillJson(route, FAKE_USER),
    )
    // Distribuidoras — usadas apenas no chip da PropertyDetailsPage. Lista
    // não é estritamente necessária aqui (não vamos abrir form de propriedade),
    // mas o mock é barato e protege contra evoluções da página.
    await page.route("**/api/distributors", (route) =>
        fulfillJson(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    // Lista de propriedades + detalhe da única propriedade que usamos.
    await page.route("**/api/properties", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, PROP_1)
        }
        return route.continue()
    })
    // Pre-loga o usuário pra pular tela de login
    await page.addInitScript((token) => {
        localStorage.setItem("lumitrack:auth:token", token)
    }, FAKE_JWT)
}

/**
 * Registra os mocks dos endpoints de Area apontando pro estado mutável
 * passado como argumento. Encapsula o "DB simulada" pra cada teste.
 *
 * Cobertura de rotas:
 *   - GET    /api/properties/prop-1/areas         → lista
 *   - POST   /api/properties/prop-1/areas         → cria (gera id sequencial)
 *   - GET    /api/properties/prop-1/areas/:id     → detalhe
 *   - PUT    /api/properties/prop-1/areas/:id     → atualiza
 *   - DELETE /api/properties/prop-1/areas/:id     → remove (204 sem body)
 *
 * Nota sobre o glob: `**\/api/properties/prop-1/areas/*` casa
 * `/areas/area-1` mas NÃO `/areas` (o `*` exige ao menos um segmento).
 * Por isso registramos os dois separadamente.
 */
const setupAreasRoutes = async (
    page: Page,
    state: { areas: AreaSeed[]; nextId: number },
) => {
    // Lista e criação
    await page.route("**/api/properties/prop-1/areas", async (route) => {
        const method = route.request().method()

        if (method === "GET") {
            return fulfillJson(route, state.areas)
        }

        if (method === "POST") {
            const body = JSON.parse(route.request().postData() ?? "{}")
            const created: AreaSeed = {
                id: `area-${state.nextId++}`,
                propertyId: "prop-1",
                name: body.name,
                description: body.description ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            state.areas.push(created)
            return fulfillJson(route, created, 201)
        }

        return route.continue()
    })

    // Detalhe, atualização e remoção (qualquer :areaId)
    await page.route(
        "**/api/properties/prop-1/areas/*",
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())
            const areaId = url.pathname.split("/").pop()!

            const index = state.areas.findIndex((a) => a.id === areaId)

            if (method === "GET") {
                if (index === -1) {
                    return route.fulfill({
                        status: 404,
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: "error",
                            message: "Área não encontrada",
                        }),
                    })
                }
                return fulfillJson(route, state.areas[index])
            }

            if (method === "PUT") {
                if (index === -1) {
                    return route.fulfill({ status: 404 })
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                state.areas[index] = {
                    ...state.areas[index]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, state.areas[index])
            }

            if (method === "DELETE") {
                if (index !== -1) {
                    state.areas.splice(index, 1)
                }
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        },
    )

    await page.route(
        "**/api/properties/*/areas/*/devices",
        (route) => {
            if (route.request().method() === "GET") {
                return fulfillJson(route, [])
            }
            return route.continue()
        },
    )
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe("Fluxo CRUD de áreas", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, vê detalhes, edita e exclui uma área (fluxo via header da details)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [],
            nextId: 1,
        }
        await setupAreasRoutes(page, state)

        // ─── 1. Propriedade carrega com EmptyState de áreas ──────────────────
        await page.goto("/propriedades/prop-1")

        await expect(
            page.getByRole("heading", { level: 1, name: /casa principal/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()

        // ─── 2. Criar nova área ──────────────────────────────────────────────
        // Botão "Adicionar área" agora é um Link (PR 2 — Button asChild)
        await page.getByRole("link", { name: /adicionar área/i }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/nova$/)

        await expect(
            page.getByRole("heading", { level: 1, name: /nova área/i }),
        ).toBeVisible()
        // Subtítulo menciona o nome da propriedade pai
        await expect(page.getByText(/casa principal/i)).toBeVisible()

        await page.getByLabel(/nome da área/i).fill("Sala")
        await page
            .getByLabel(/descrição/i)
            .fill("Área principal de convivência")

        await page
            .getByRole("button", { name: /cadastrar área/i })
            .click()

        // Volta pra propriedade, agora com 1 card de área
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(page.getByTestId("area-card-area-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /sala/i }),
        ).toBeVisible()
        // EmptyState não aparece mais
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).not.toBeVisible()

        // ─── 3. Click no card → AreaDetailsPage ──────────────────────────────
        await page.getByTestId("area-card-area-1").click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )

        // Header tem nome + descrição + chip da propriedade pai
        await expect(
            page.getByRole("heading", { level: 1, name: /sala/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/área principal de convivência/i),
        ).toBeVisible()
        await expect(page.getByText(/casa principal/i)).toBeVisible()
        // Seção de devices ainda é placeholder
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).toBeVisible()

        // ─── 4. Editar via botão do header ───────────────────────────────────
        await page.getByRole("link", { name: /editar área/i }).click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/editar$/,
        )

        // Form pré-preenchido
        await expect(page.getByLabel(/nome da área/i)).toHaveValue("Sala")

        const nameInput = page.getByLabel(/nome da área/i)
        await nameInput.fill("Sala renovada")

        await page
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        // Volta pra detalhes da área com o nome novo
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(
            page.getByRole("heading", { level: 1, name: /sala renovada/i }),
        ).toBeVisible()

        // ─── 5. Excluir via menu ⋯ no header da details ──────────────────────
        // O aria-label é dinâmico — espelha PropertyMenu
        await page
            .getByRole("button", { name: /opções de Sala renovada/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre com aviso de cascade explícito
        await expect(
            page.getByRole("heading", { name: /excluir área/i }),
        ).toBeVisible()
        // Os 3 elementos do cascade aparecem no aviso — escopo ao dialog
        // para evitar strict mode violation (a página tem "Dispositivos"
        // em outros elementos fora do dialog)
        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog.getByText(/dispositivos/i)).toBeVisible()
        await expect(
            confirmDialog.getByText(/registros de consumo/i),
        ).toBeVisible()
        await expect(confirmDialog.getByText(/alertas/i)).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pra PropertyDetailsPage com EmptyState restaurado
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("area-card-area-1"),
        ).not.toBeVisible()
    })

    test("edita e exclui uma área via menu ⋯ do card (sem passar pela details)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        // Pré-popula com 1 área
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [
                {
                    id: "area-1",
                    propertyId: "prop-1",
                    name: "Cozinha",
                    description: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ],
            nextId: 2,
        }
        await setupAreasRoutes(page, state)

        await page.goto("/propriedades/prop-1")

        // Confirma o card visível
        await expect(page.getByTestId("area-card-area-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /cozinha/i }),
        ).toBeVisible()

        // ─── 1. Editar via menu ⋯ do card ────────────────────────────────────
        await page
            .getByRole("button", { name: /opções de Cozinha/i })
            .click()
        await page.getByRole("menuitem", { name: /editar/i }).click()

        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/editar$/,
        )
        await page.getByLabel(/nome da área/i).fill("Cozinha gourmet")
        await page
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        // Volta pra detalhes da área (não pra lista — comportamento da EditAreaPage)
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(
            page.getByRole("heading", { level: 1, name: /cozinha gourmet/i }),
        ).toBeVisible()

        // Volta pra lista
        await page
            .getByRole("link", { name: /voltar para propriedade/i })
            .click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)

        // ─── 2. Excluir via menu ⋯ do card ───────────────────────────────────
        await page
            .getByRole("button", { name: /opções de Cozinha gourmet/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre na própria PropertyDetailsPage (não navegamos)
        await expect(
            page.getByRole("heading", { name: /excluir área/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Permanece na PropertyDetailsPage, EmptyState restaurado
        // (sem navegação — diferente do delete via AreaDetailsPage)
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("area-card-area-1"),
        ).not.toBeVisible()
    })

    test("validação client-side bloqueia submit com nome vazio", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [],
            nextId: 1,
        }
        await setupAreasRoutes(page, state)

        await page.goto("/propriedades/prop-1/areas/nova")

        // Click direto no submit sem preencher
        await page.getByRole("button", { name: /cadastrar área/i }).click()

        // Mensagem de erro do schema aparece
        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()

        // Permanece na mesma URL — não navegou
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/nova$/,
        )
    })
})