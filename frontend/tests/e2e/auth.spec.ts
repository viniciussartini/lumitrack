import { test, expect } from "@playwright/test"

// E2E focado em UI: mocka as respostas do backend via page.route().
// Vantagem: não depende do backend rodando — roda no CI sem coordenação.
// Quando você quiser um teste de integração real (front + back),
// crie um spec separado em tests/e2e/integration/ com seed de DB.

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

test.describe("Fluxo de autenticação", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("redireciona para /login quando deslogado e tenta acessar /dashboard", async ({
        page,
    }) => {
        await page.goto("/dashboard")
        await expect(page).toHaveURL(/\/login/)
        await expect(
            page.getByRole("heading", { name: /entrar na conta/i }),
        ).toBeVisible()
    })

    test("mostra erro de validação ao submeter form vazio", async ({ page }) => {
        await page.goto("/login")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page.getByText(/e-mail é obrigatório/i)).toBeVisible()
        await expect(page.getByText(/senha é obrigatória/i)).toBeVisible()
    })

    test("mostra erro ao submeter credenciais inválidas", async ({ page }) => {
        await page.route("**/api/auth/login", (route) =>
            route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "error",
                    message: "Credenciais inválidas",
                }),
            }),
        )

        await page.goto("/login")
        await page.getByLabel(/e-mail/i).fill("test@example.com")
        await page.getByLabel(/senha/i).fill("errada")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page.getByText(/credenciais inválidas/i)).toBeVisible()
        await expect(page).toHaveURL(/\/login/)
    })

    test("autentica com sucesso e redireciona para /dashboard", async ({ page }) => {
        await page.route("**/api/auth/login", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "success",
                    data: { token: FAKE_JWT },
                }),
            }),
        )

        await page.route("**/api/users/user-123", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "success",
                    data: FAKE_USER,
                }),
            }),
        )

        await page.goto("/login")
        await page.getByLabel(/e-mail/i).fill("test@example.com")
        await page.getByLabel(/senha/i).fill("Senha@123")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page).toHaveURL(/\/dashboard/)
        await expect(page.getByText(/olá, joão/i)).toBeVisible()
    })

    test("logout limpa sessão e volta para /login", async ({ page }) => {
        await page.addInitScript((token) => {
            localStorage.setItem("lumitrack:auth:token", token)
        }, FAKE_JWT)

        await page.route("**/api/users/user-123", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: FAKE_USER }),
            }),
        )

        await page.route("**/api/auth/logout", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success" }),
            }),
        )

        await page.goto("/dashboard")
        await expect(page.getByText(/olá, joão/i)).toBeVisible()

        await page.getByRole("button", { name: /sair/i }).click()
        await expect(page).toHaveURL(/\/login/)
    })
})
