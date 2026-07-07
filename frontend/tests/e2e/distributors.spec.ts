import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Distribuidora:
 *   1. Listar (vazio inicial)
 *   2. Criar
 *   3. Editar (mudar nome e kwhPrice)
 *   4. Excluir
 *   5. Excluir bloqueado quando há propriedades vinculadas (cenário separado)
 */

// ─── Constantes de teste ─────────────────────────────────────────────────────

const FAKE_USER = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    role: "USER",
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
 * Helper pra responder erro com envelope { status: "error", message }.
 * Espelha o shape do AppError do backend.
 */
const fulfillError = (route: Route, message: string, status = 400) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message }),
    })

/**
 * Configura mocks compartilhados (auth + perfil). Desde a #06 (sessão WEB
 * via cookie httpOnly), a única rota que precisa ser mockada para simular
 * "usuário autenticado" é GET /auth/me — usada tanto no bootstrap quanto
 * logo após o login. Não há mais token em localStorage para pré-semear.
 */
const setupAuth = async (page: Page) => {
    await page.route("**/api/auth/me", (route) =>
        fulfillJson(route, FAKE_USER),
    )
}

/**
 * Oculta permanentemente o TanStack Query DevTools via CSS injetado — o
 * botão flutuante remonta após cada invalidação de query e volta a
 * interceptar pointer events sobre outros controles da página (ver mesmo
 * helper em consumption.spec.ts, onde o problema foi originalmente
 * diagnosticado).
 */
const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe("Fluxo CRUD de distribuidoras", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, edita e exclui uma distribuidora", async ({ page }) => {
        await setupAuth(page)

        // Estado da "DB" simulada — começa vazio, evolui ao longo do teste
        let distributors: Array<Record<string, unknown>> = []

        await page.route("**/api/distributors", async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, distributors)
            }

            if (method === "POST") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created = {
                    id: "dist-1",
                    userId: "user-123",
                    name: body.name,
                    cnpj: body.cnpj,
                    electricalSystem: body.electricalSystem,
                    workingVoltage: body.workingVoltage,
                    kwhPrice: body.kwhPrice,
                    taxRate: body.taxRate ?? null,
                    publicLightingFee: body.publicLightingFee ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                distributors = [created]
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        })

        await page.route("**/api/distributors/dist-1", async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, distributors[0])
            }

            if (method === "PUT") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                distributors[0] = {
                    ...distributors[0]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, distributors[0])
            }

            if (method === "DELETE") {
                distributors = []
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        })

        // ─── 1. Lista vazia inicialmente ─────────────────────────────────────
        await page.goto("/distribuidoras")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /distribuidoras/i, level: 1 }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhuma distribuidora cadastrada/i),
        ).toBeVisible()

        // ─── 2. Criar nova distribuidora ─────────────────────────────────────
        // Usa o botão do header — sempre visível, independente do EmptyState.
        await page
            .getByRole("link", { name: /nova distribuidora/i })
            .click()
        await expect(page).toHaveURL(/\/distribuidoras\/nova/)

        await page
            .getByLabel(/nome da distribuidora/i)
            .fill("CEMIG Distribuição S.A.")
        await page.getByLabel(/cnpj/i).fill("06981180000116")
        await page
            .getByLabel(/sistema elétrico/i)
            .selectOption("TRIPHASIC")
        await page.getByLabel(/tensão de trabalho/i).selectOption("220")
        await page.getByLabel(/preço do kwh/i).fill("0.75")
        await page.getByLabel(/alíquota de impostos/i).fill("12")
        await page.getByLabel(/iluminação pública/i).fill("45.90")

        await page.locator('[type="submit"]').click()

        // Volta pra lista, agora com 1 card
        await expect(page).toHaveURL(/\/distribuidoras$/)
        await expect(page.getByTestId("distributor-card-dist-1")).toBeVisible()
        // getByText poderia conflitar com o toast — verificamos via getByTestId acima
        await expect(page.getByText(/CEMIG Distribuição/i).first()).toBeVisible()

        // ─── 3. Editar (mudar nome e kwhPrice) ───────────────────────────────
        await page.getByTestId("distributor-card-dist-1").click()
        await expect(page).toHaveURL(/\/distribuidoras\/dist-1\/editar/)

        // CNPJ deve estar desabilitado em modo edição
        await expect(page.getByLabel(/cnpj/i)).toBeDisabled()

        const nameInput = page.getByLabel(/nome da distribuidora/i)
        await nameInput.fill("CEMIG Renovada S.A.")

        const kwhInput = page.getByLabel(/preço do kwh/i)
        await kwhInput.fill("0.85")

        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(page).toHaveURL(/\/distribuidoras$/)
        await expect(page.getByText(/CEMIG Renovada/i)).toBeVisible()

        // ─── 4. Excluir ──────────────────────────────────────────────────────
        await page
            .getByRole("button", { name: /opções de CEMIG Renovada/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre
        await expect(
            page.getByRole("heading", { name: /excluir distribuidora/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pro empty state
        await expect(
            page.getByText(/nenhuma distribuidora cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("distributor-card-dist-1"),
        ).not.toBeVisible()
    })

    test("mostra mensagem amigável ao tentar excluir distribuidora com propriedades vinculadas", async ({
        page,
    }) => {
        await setupAuth(page)

        const existing = {
            id: "dist-1",
            userId: "user-123",
            name: "CEMIG",
            cnpj: "06.981.180/0001-16",
            electricalSystem: "TRIPHASIC",
            workingVoltage: 220,
            kwhPrice: 0.75,
            taxRate: 0.12,
            publicLightingFee: 45.9,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        await page.route("**/api/distributors", (route) =>
            fulfillJson(route, [existing]),
        )

        // DELETE retorna 409 com mensagem do backend
        await page.route("**/api/distributors/dist-1", (route) => {
            if (route.request().method() === "DELETE") {
                return fulfillError(
                    route,
                    "Não é possível excluir uma distribuidora com propriedades vinculadas. Desvincule as propriedades primeiro.",
                    409,
                )
            }
            return route.continue()
        })

        await page.goto("/distribuidoras")
        await hideDevTools(page)

        await expect(page.getByTestId("distributor-card-dist-1")).toBeVisible()

        await page.getByRole("button", { name: /opções de CEMIG/i }).click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Toast de erro com mensagem amigável vem do DistributorMenu
        // (o hook propaga o erro, e o menu traduz a mensagem do backend)
        await expect(
            page.getByText(/não é possível excluir/i),
        ).toBeVisible()
    })
})