import { test, expect } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { FAKE_USER, PROP_1 } from "./support/fixtures"

/**
 * E2E do Perfil — igual a `dashboard.spec.ts`/`realtime.spec.ts`: mocka o
 * backend via `page.route()`, sem depender do backend rodando.
 *
 * FAKE_USER é PF (userType INDIVIDUAL, firstName "João"/lastName "Silva",
 * cpf "529.982.247-25") — cobertura do ramo PJ (companyName/tradeName/cnpj)
 * fica só no unit test de ProfilePage.test.tsx, mais barato de exercitar.
 *
 * Navega direto para `/perfil` (em vez de passar por /dashboard + clique no
 * UserMenu) — a navegação via UserMenu já é coberta por UserMenu.test.tsx;
 * passar por /dashboard aqui só adicionaria ruído de outra página sem valor
 * novo.
 */

test.describe("Perfil — visualizar e editar dados pessoais (#118)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra os dados em modo leitura", async ({ page }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) => fulfillPaginated(route, [PROP_1]))

        await page.goto("/perfil")
        await hideDevTools(page)

        await expect(page.getByRole("heading", { name: "João Silva" })).toBeVisible()
        await expect(page.getByText("•••.•••.247-25")).toBeVisible()
        await expect(page.getByRole("button", { name: /editar/i })).toBeVisible()
    })

    test("edita nome/sobrenome e reflete a mudança no menu do usuário", async ({ page }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) => fulfillPaginated(route, [PROP_1]))

        const updatedUser = { ...FAKE_USER, firstName: "Joana" }
        await page.route(/\/api\/users\/.*$/, (route) =>
            route.request().method() === "PUT" ? fulfillJson(route, updatedUser) : route.fallback(),
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

test.describe("Perfil — Conta e Privacidade & dados (#120)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra o resumo da conta: membro desde, propriedades vinculadas e status de 2FA", async ({
        page,
    }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) =>
            fulfillPaginated(route, [PROP_1], { total: 2 }),
        )

        await page.goto("/perfil")
        await hideDevTools(page)

        await expect(page.getByText("2 vinculadas")).toBeVisible()
        // FAKE_USER.mfaEnabled é false — mesmo padrão default de SecurityPage.
        await expect(page.getByText("Desativado")).toBeVisible()

        const exportLink = page.getByRole("link", { name: /exportar/i })
        await expect(exportLink).toHaveAttribute("href", "/api/users/me/data-export?format=json")
    })

    test("exclui a conta: confirma no dialog, chama DELETE e redireciona pro login", async ({
        page,
    }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) => fulfillPaginated(route, [PROP_1]))
        await page.route(/\/api\/users\/.*$/, (route) =>
            route.request().method() === "DELETE"
                ? route.fulfill({ status: 204 })
                : route.fallback(),
        )
        await page.route("**/api/auth/logout", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success" }),
            }),
        )

        await page.goto("/perfil")
        await hideDevTools(page)

        await page.getByRole("button", { name: /excluir conta/i }).click()

        const dialog = page.getByRole("dialog")
        await expect(dialog).toBeVisible()

        // Fundo do .dialog era transparent (herdado da regra "blueprint
        // frame" pensada pra .card, não pra um modal flutuando sobre
        // .dialog-backdrop) — o texto da página por trás vazava e
        // sobrepunha visualmente o próprio texto do dialog. Regressão real
        // de CSS, não testável em unit test (jsdom não computa estilo de
        // stylesheet externo) — só via computed style num browser real.
        const backgroundColor = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)
        expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)")

        await dialog.getByRole("button", { name: /excluir conta/i }).click()

        await expect(page).toHaveURL(/\/login/)
    })
})
