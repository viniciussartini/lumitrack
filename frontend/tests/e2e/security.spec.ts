import { test, expect } from "@playwright/test"

import { fulfillError, fulfillJson } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"

/**
 * E2E da Segurança — bloco "Sessões ativas". Mocka o backend via
 * `page.route()`, como os demais specs: sem o mock de `/api/sessions` o app
 * logado cairia em 401 e voltaria ao login.
 *
 * Navega direto para `/seguranca`; a entrada pelo menu do usuário já é
 * coberta por UserMenu.test.tsx.
 */

const HOUR = 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const SESSIONS = [
    {
        id: "s-current",
        channel: "WEB",
        deviceLabel: "Chrome · Windows",
        origin: "189.45.xx.xx",
        lastAccessAt: ago(0),
        isCurrent: true,
    },
    {
        id: "s-phone",
        channel: "MOBILE",
        deviceLabel: "Safari · iOS",
        origin: "201.17.xx.xx",
        lastAccessAt: ago(2 * HOUR),
        isCurrent: false,
    },
    {
        id: "s-legacy",
        channel: "WEB",
        deviceLabel: null,
        origin: null,
        lastAccessAt: ago(50 * HOUR),
        isCurrent: false,
    },
]

test.describe("Segurança — sessões ativas", () => {
    test.beforeEach(async ({ context, page }) => {
        await context.clearCookies()
        await mockAppShellBackground(page)
        await setupAuth(page)
    })

    test("lista as sessões da conta e marca a atual", async ({ page }) => {
        await page.route(/\/api\/sessions(\?.*)?$/, (route) =>
            fulfillJson(route, { items: SESSIONS }),
        )

        await page.goto("/seguranca")
        await hideDevTools(page)

        const list = page.getByRole("list", { name: "Sessões ativas da conta" })
        await expect(list.getByRole("listitem")).toHaveCount(3)
        await expect(list.getByText("Chrome · Windows")).toBeVisible()
        await expect(list.getByText("Esta sessão")).toHaveCount(1)
        await expect(list.getByText("Safari · iOS")).toBeVisible()
        await expect(list.getByText("há 2 h")).toBeVisible()
        await expect(list.getByText("Origem não registrada")).toBeVisible()
    })

    test("conta com uma só sessão avisa que não há outra", async ({ page }) => {
        await page.route(/\/api\/sessions(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [SESSIONS[0]] }),
        )

        await page.goto("/seguranca")
        await hideDevTools(page)

        await expect(page.getByText("Nenhuma outra sessão ativa.")).toBeVisible()
    })

    test("falha ao carregar mostra o erro e a nova tentativa recarrega", async ({ page }) => {
        let calls = 0
        await page.route(/\/api\/sessions(\?.*)?$/, (route) => {
            calls += 1
            // A query tenta de novo uma vez sozinha (retry: 1): as duas primeiras falham.
            return calls <= 2
                ? fulfillError(route, "falha", 500)
                : fulfillJson(route, { items: SESSIONS })
        })

        await page.goto("/seguranca")
        await hideDevTools(page)

        await expect(page.getByText("Não foi possível carregar as sessões.")).toBeVisible()
        await page.getByRole("button", { name: "Tentar novamente" }).click()

        await expect(page.getByRole("list", { name: "Sessões ativas da conta" })).toBeVisible()
    })
})
