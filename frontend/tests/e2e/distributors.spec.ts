import { test, expect } from "@playwright/test"

import { fulfillError, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { DIST_CEMIG } from "./support/fixtures"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Distribuidora deixou de ser CRUD por usuário e virou catálogo global
 * somente leitura (populado via seed, sem dono) — `DistributorForm` e
 * `DistributorMenu` foram deletados; o service só expõe `GET /distributors`
 * e `GET /distributors/:id`. Este spec cobre só o que a página faz hoje:
 *   1. Catálogo com distribuidoras (grid de cards, campos de tarifa/tributos)
 *   2. Catálogo vazio (EmptyState)
 *   3. Erro ao carregar (ErrorState + retry)
 */

const DIST_ENEL = {
    ...DIST_CEMIG,
    id: "dist-enel",
    name: "Enel São Paulo",
    cnpj: "61.695.227/0001-93",
    state: "SP",
    tusdPerKwh: 0.42,
    tePerKwh: 0.31,
}

test.describe("Catálogo de distribuidoras", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra o catálogo com distribuidoras cadastradas", async ({
        page,
    }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
            fulfillPaginated(route, [DIST_CEMIG, DIST_ENEL]),
        )

        await page.goto("/distribuidoras")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /distribuidoras/i, level: 1 }),
        ).toBeVisible()
        await expect(page.getByTestId("distributors-grid")).toBeVisible()

        const cemigCard = page.getByTestId("distributor-card-dist-cemig")
        await expect(cemigCard).toBeVisible()
        await expect(cemigCard).toContainText(/cemig distribuição/i)
        await expect(cemigCard).toContainText(/06\.981\.180\/0001-16/)
        await expect(cemigCard).toContainText(/mg/i)
        await expect(cemigCard).toContainText(/tusd/i)
        await expect(cemigCard).toContainText(/te r\$/i)
        await expect(cemigCard).toContainText(/icms/i)
        await expect(cemigCard).toContainText(/pis/i)
        await expect(cemigCard).toContainText(/cofins/i)

        await expect(
            page.getByTestId("distributor-card-dist-enel"),
        ).toContainText(/enel são paulo/i)

        // Catálogo é somente leitura — nada de criar/editar/excluir
        await expect(
            page.getByRole("link", { name: /nova distribuidora/i }),
        ).toHaveCount(0)
        await expect(
            page.getByRole("button", { name: /opções de/i }),
        ).toHaveCount(0)
    })

    test("mostra EmptyState quando o catálogo está vazio", async ({
        page,
    }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/distribuidoras")
        await hideDevTools(page)

        await expect(page.getByText(/catálogo indisponível/i)).toBeVisible()
        await expect(
            page.getByText(/não há distribuidoras cadastradas no momento/i),
        ).toBeVisible()
        await expect(page.getByTestId("distributors-grid")).toHaveCount(0)
    })

    test("mostra erro ao falhar em carregar o catálogo, com retry", async ({
        page,
    }) => {
        await mockAppShellBackground(page)
        await setupAuth(page)

        let shouldFail = true
        await page.route(/\/api\/distributors(\?.*)?$/, (route) => {
            if (shouldFail) {
                return fulfillError(route, "Erro interno do servidor", 500)
            }
            return fulfillPaginated(route, [DIST_CEMIG])
        })

        await page.goto("/distribuidoras")
        await hideDevTools(page)

        await expect(page.getByText(/não foi possível carregar/i)).toBeVisible()

        // Recupera e clica em "Tentar novamente" — a página deve re-consultar
        // e sair do estado de erro.
        shouldFail = false
        await page.getByRole("button", { name: /tentar novamente/i }).click()

        await expect(
            page.getByTestId("distributor-card-dist-cemig"),
        ).toBeVisible()
        await expect(page.getByText(/não foi possível carregar/i)).not.toBeVisible()
    })
})
