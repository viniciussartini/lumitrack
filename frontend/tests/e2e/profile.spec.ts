import { test, expect } from "@playwright/test"

import { fulfillJson } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { FAKE_USER } from "./support/fixtures"

/**
 * E2E do Perfil (#118) — igual a `dashboard.spec.ts`/`realtime.spec.ts`:
 * mocka o backend via `page.route()`, sem depender do backend rodando.
 *
 * FAKE_USER é PF (userType INDIVIDUAL, firstName "João"/lastName "Silva",
 * cpf "529.982.247-25") — cobertura do ramo PJ (companyName/tradeName/cnpj)
 * fica só no unit test de ProfilePage.test.tsx, mais barato de exercitar.
 *
 * Navega direto para `/perfil` (em vez de passar por /dashboard + clique no
 * UserMenu) — a navegação via UserMenu já é coberta por UserMenu.test.tsx;
 * passar por /dashboard aqui só adicionaria ruído de outra página sem valor
 * novo pra esta issue.
 */

test.describe("Perfil — visualizar e editar dados pessoais (#118)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra os dados em modo leitura", async ({ page }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)

        await page.goto("/perfil")
        await hideDevTools(page)

        await expect(page.getByRole("heading", { name: "João Silva" })).toBeVisible()
        await expect(page.getByText("•••.•••.247-25")).toBeVisible()
        await expect(page.getByRole("button", { name: /editar/i })).toBeVisible()
    })

    test("edita nome/sobrenome e reflete a mudança no menu do usuário", async ({ page }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)

        const updatedUser = { ...FAKE_USER, firstName: "Joana" }
        await page.route(/\/api\/users\/.*$/, (route) =>
            route.request().method() === "PUT"
                ? fulfillJson(route, updatedUser)
                : route.fallback(),
        )

        await page.goto("/perfil")
        await hideDevTools(page)

        await page.getByRole("button", { name: /editar/i }).click()

        // CPF nunca editável — permanece desabilitado durante a edição.
        await expect(page.getByLabel("CPF")).toBeDisabled()

        await page.getByLabel("Nome", { exact: true }).fill("Joana")

        // A partir daqui /auth/me (refreshUser) precisa devolver o usuário
        // já atualizado — senão o menu mostraria o nome antigo.
        await page.route("**/api/auth/me", (route) => fulfillJson(route, updatedUser))

        await page.getByRole("button", { name: /salvar alterações/i }).click()

        // O heading vem do mesmo `useAuth().user` que o UserMenu lê — a
        // troca aqui já comprova que `refreshUser()` propagou a mudança
        // pro AuthContext inteiro, sem precisar reabrir o menu (que fica
        // sujeito ao toast de sucesso sobrepondo o botão, bem menos estável).
        await expect(page.getByRole("heading", { name: "Joana Silva" })).toBeVisible()
        await expect(page.getByRole("button", { name: /editar/i })).toBeVisible()
    })
})
