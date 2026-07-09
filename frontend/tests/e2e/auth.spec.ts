import { test, expect, type Page } from "@playwright/test"

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

/**
 * Mocka as chamadas de fundo que o AppShell (rotas autenticadas) dispara,
 * para que caiam num 200 mockado em vez do backend real:
 *
 *   - GET /api/alerts — o AlertBellBadge no Header consulta essa rota. Sem
 *     o mock, cai no backend real → 401 → o interceptor dispara
 *     "lumitrack:unauthorized" e o app redireciona pra /login no meio do
 *     teste (elementos "detached from DOM").
 *   - GET /api/iot/stream — useAlertStream abre SSE aqui; mockado só para
 *     não tocar o backend real (não é a causa das falhas, mas mantém o
 *     teste isolado).
 */
const mockAppShellBackground = async (page: Page) => {
    await page.route(/\/api\/alerts(\?.*)?$/, (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "success", data: [] }),
        }),
    )
    // A DashboardPage chama GET /api/properties (e, por propriedade, um
    // report). Lista vazia → nenhuma query de report dispara e nada cai no
    // backend real → 401 → redirect pra /login (o que detachava o menu do
    // usuário no meio do teste de logout).
    await page.route("**/api/properties", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "success", data: [] }),
        }),
    )
    await page.route("**/api/iot/stream", (route) =>
        route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
    )
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
        // /auth/me precisa responder NÃO autenticado durante o bootstrap:
        // se devolvesse o usuário já no goto("/login"), o PublicRoute
        // redirecionaria pra /dashboard antes do formulário renderizar (o
        // campo de e-mail nunca apareceria). Só depois do POST de login é que
        // /auth/me passa a devolver o usuário — que é o fluxo real.
        let loggedIn = false
        await page.route("**/api/auth/login", (route) => {
            loggedIn = true
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: {} }),
            })
        })
        await page.route("**/api/auth/me", (route) =>
            route.fulfill({
                status: loggedIn ? 200 : 401,
                contentType: "application/json",
                body: loggedIn
                    ? JSON.stringify({ status: "success", data: FAKE_USER })
                    : JSON.stringify({ status: "error", message: "Não autenticado" }),
            }),
        )
        // mockAppShellBackground já cobre /api/properties → [] (dashboard sem
        // propriedades, sem queries de report caindo no backend real).
        await mockAppShellBackground(page)

        await page.goto("/login")
        await page.getByLabel(/e-mail/i).fill("test@example.com")
        await page.getByLabel(/senha/i).fill("Senha@123")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page).toHaveURL(/\/dashboard/)
        await hideDevTools(page)
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
        await mockAppShellBackground(page)

        await page.goto("/dashboard")
        await hideDevTools(page)
        await expect(page.getByText(/olá, joão/i)).toBeVisible()

        await page.getByRole("button", { name: /menu do usuário/i }).click()
        await page.getByRole("menuitem", { name: /sair/i }).click()
        await expect(page).toHaveURL(/\/login/)
    })
})
