import { test, expect } from "@playwright/test"

import { fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route(). Landing
 * pública é puramente apresentacional (sem chamada de API própria) — este
 * spec cobre só navegação: visitante vê a landing, os CTAs levam a /login e
 * /registro, e quem já está autenticado é redirecionado para /dashboard.
 */

test.describe("Landing pública", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("visitante não autenticado vê a landing em /", async ({ page }) => {
        await page.goto("/")
        await expect(page).toHaveURL("/")
        await expect(page.getByRole("heading", { name: /enxergue cada/i })).toBeVisible()
    })

    test("CTA 'Criar conta' do hero leva a /registro", async ({ page }) => {
        await page.goto("/")
        // "Criar conta" aparece em 3 lugares (nav, hero, seção de fechamento)
        // — .first() pega o do hero (ordem do DOM), qualquer um navega igual.
        await page
            .getByRole("main")
            .getByRole("link", { name: /criar conta/i })
            .first()
            .click()
        await expect(page).toHaveURL(/\/registro/)
    })

    test("link 'Entrar' da nav leva a /login", async ({ page }) => {
        await page.goto("/")
        // "Entrar" também aparece no rodapé — escopar à nav (role navigation).
        await page
            .getByRole("navigation")
            .getByRole("link", { name: /^entrar$/i })
            .click()
        await expect(page).toHaveURL(/\/login/)
    })

    test("usuário autenticado que acessa / é redirecionado para /dashboard", async ({ page }) => {
        await setupAuth(page)
        await mockAppShellBackground(page)
        // DashboardPage sempre chama useProperties ao montar — lista
        // vazia evita que RealtimeSection/etc. montem e disparem chamadas
        // próprias não mockadas (mesmo padrão de auth.spec.ts).
        await page.route(/\/api\/properties(\?.*)?$/, (route) => fulfillPaginated(route, []))

        await page.goto("/")
        await expect(page).toHaveURL(/\/dashboard/)
        await hideDevTools(page)
    })
})
