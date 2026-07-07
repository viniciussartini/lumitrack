import { test, expect } from "@playwright/test"

// E2E focado em UI: mocka as respostas do backend via page.route(). Vantagem:
// não depende do backend rodando de verdade — roda no CI sem coordenação.
//
// Desde a #06 (sessão WEB via cookie httpOnly + CSRF), o login não retorna
// mais o token no body nem existe leitura de token via localStorage — o
// frontend sempre busca o usuário autenticado via GET /auth/me (tanto no
// bootstrap quanto logo após o login), e é essa a única rota que precisa
// ser mockada para simular "usuário autenticado" nestes testes.
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
        // Sem MFA: o backend seta os cookies de sessão/CSRF via Set-Cookie
        // real (não simulável por page.route) e responde corpo vazio — o
        // que importa pro app é o GET /auth/me em seguida, que aqui é
        // mockado para sempre devolver o usuário autenticado.
        await page.route("**/api/auth/login", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: {} }),
            }),
        )

        await page.route("**/api/auth/me", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: FAKE_USER }),
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
        // "Já logado" é simulado mockando /auth/me como autenticado desde o
        // bootstrap — não há mais token em localStorage para pré-semear
        // (sessão vive num cookie httpOnly, invisível a JS).
        await page.route("**/api/auth/me", (route) =>
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

        await page.getByRole("button", { name: /menu do usuário/i }).click()
        await page.getByRole("menuitem", { name: /sair/i }).click()
        await expect(page).toHaveURL(/\/login/)
    })
})
