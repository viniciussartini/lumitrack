import { test, expect } from "@playwright/test"

import { fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { FAKE_USER } from "./support/fixtures"

// E2E focado em UI: mocka as respostas do backend via page.route(). Vantagem:
// não depende do backend rodando de verdade — roda no CI sem coordenação.
//
// Desde a #06 (sessão WEB via cookie httpOnly + CSRF), o login não retorna
// mais o token no body nem existe leitura de token via localStorage — o
// frontend sempre busca o usuário autenticado via GET /auth/me (tanto no
// bootstrap quanto logo após o login), e é essa a única rota que precisa
// ser mockada para simular "usuário autenticado" nestes testes.

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
            page.getByRole("heading", { name: /entrar no lumitrack/i }),
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
        await page.getByLabel(/^senha$/i).fill("errada")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page.getByText(/credenciais inválidas/i)).toBeVisible()
        await expect(page).toHaveURL(/\/login/)
    })

    test("autentica com sucesso e redireciona para /dashboard", async ({ page }) => {
        // /auth/me precisa responder NÃO autenticado durante o bootstrap:
        // se devolvesse o usuário já no goto("/login"), o PublicRoute
        // redirecionaria pra /dashboard antes do formulário renderizar (o
        // campo de e-mail nunca apareceria). Só depois do POST de login é que
        // /auth/me passa a devolver o usuário — que é o fluxo real. Esse
        // comportamento condicional é específico deste teste, então não usa
        // setupAuth (que mocka /auth/me com um usuário fixo desde o início).
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
        await mockAppShellBackground(page)
        // Mesmo motivo do teste de logout logo abaixo: DashboardPage sempre
        // chama useProperties ao montar (#115).
        await page.route(/\/api\/properties(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/login")
        await page.getByLabel(/e-mail/i).fill("test@example.com")
        await page.getByLabel(/^senha$/i).fill("Senha@123")
        await page.getByRole("button", { name: /entrar/i }).click()

        await expect(page).toHaveURL(/\/dashboard/)
        await hideDevTools(page)
        await expect(page.getByText(/olá, joão/i)).toBeVisible()
    })

    test("logout limpa sessão e volta para /login", async ({ page }) => {
        // "Já logado" é simulado mockando /auth/me como autenticado desde o
        // bootstrap — não há mais token em localStorage para pré-semear
        // (sessão vive num cookie httpOnly, invisível a JS).
        await setupAuth(page)

        await page.route("**/api/auth/logout", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success" }),
            }),
        )
        await mockAppShellBackground(page)
        // DashboardPage sempre chama useProperties ao montar (#115) — sem
        // mock, cai no backend real sem sessão válida e redireciona pro
        // /login no meio do teste (ver appShell.ts). Lista vazia de propósito:
        // este teste só quer o cabeçalho (saudação) e o menu do usuário, uma
        // propriedade real montaria RealtimeSection/etc, que por sua vez
        // fariam suas próprias chamadas não mockadas (medidor, consumo,
        // bandeira) e cairiam no mesmo problema.
        await page.route(/\/api\/properties(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/dashboard")
        await hideDevTools(page)
        await expect(page.getByText(/olá, joão/i)).toBeVisible()

        await page.getByRole("button", { name: /menu do usuário/i }).click()
        await page.getByRole("menuitem", { name: /sair/i }).click()
        await expect(page).toHaveURL(/\/login/)
    })
})
