import { test, expect, type Page } from "@playwright/test"

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

    test.describe("encerrar sessões", () => {
        // A lista do servidor fica em memória para o teste ver a recarga depois de encerrar.
        const setupSessions = async (page: Page) => {
            let items = [...SESSIONS]
            const calls: string[] = []
            await page.route(/\/api\/sessions(\?.*)?$/, (route) => fulfillJson(route, { items }))
            // O último registrado vence: o específico vem depois do genérico.
            await page.route(/\/api\/sessions\/[^/]+$/, (route) => {
                const id = route.request().url().split("/").pop()!
                calls.push(`${route.request().method()} ${id}`)
                items = items.filter((item) => item.id !== id)
                return fulfillJson(route, { endedCurrent: false })
            })
            await page.route(/\/api\/sessions\/revoke-others$/, (route) => {
                calls.push(`${route.request().method()} revoke-others`)
                items = items.filter((item) => item.isCurrent)
                return fulfillJson(route, { revoked: 2 })
            })
            return calls
        }

        test("encerra uma sessão só depois de confirmar e recarrega a lista", async ({ page }) => {
            const calls = await setupSessions(page)
            await page.goto("/seguranca")
            await hideDevTools(page)

            await page.getByRole("button", { name: "Encerrar sessão Safari · iOS" }).click()
            const dialog = page.getByRole("dialog")
            await expect(dialog).toContainText("Safari · iOS perderá o acesso na hora")
            expect(calls).toEqual([])

            await dialog.getByRole("button", { name: "Encerrar" }).click()

            await expect(page.getByText("Sessão encerrada")).toBeVisible()
            await expect(page.getByText("Safari · iOS")).toHaveCount(0)
            await expect(page.getByRole("listitem")).toHaveCount(2)
            expect(calls).toEqual(["DELETE s-phone"])
        })

        test("cancelar a confirmação não encerra nada", async ({ page }) => {
            const calls = await setupSessions(page)
            await page.goto("/seguranca")
            await hideDevTools(page)

            await page.getByRole("button", { name: "Encerrar sessão Safari · iOS" }).click()
            await page.getByRole("button", { name: "Cancelar" }).click()

            await expect(page.getByRole("dialog")).toHaveCount(0)
            await expect(page.getByRole("listitem")).toHaveCount(3)
            expect(calls).toEqual([])
        })

        test("encerra todas as outras e deixa só a atual", async ({ page }) => {
            const calls = await setupSessions(page)
            await page.goto("/seguranca")
            await hideDevTools(page)

            await page.getByRole("button", { name: "Encerrar todas as outras" }).click()
            await page.getByRole("dialog").getByRole("button", { name: "Encerrar" }).click()

            await expect(page.getByText("Nenhuma outra sessão ativa.")).toBeVisible()
            await expect(page.getByRole("listitem")).toHaveCount(1)
            await expect(
                page.getByRole("button", { name: "Encerrar todas as outras" }),
            ).toHaveCount(0)
            expect(calls).toEqual(["POST revoke-others"])
        })

        test("a sessão atual não tem botão de encerrar", async ({ page }) => {
            await setupSessions(page)
            await page.goto("/seguranca")
            await hideDevTools(page)

            await expect(page.getByRole("listitem")).toHaveCount(3)
            await expect(
                page.getByRole("button", { name: "Encerrar sessão Chrome · Windows" }),
            ).toHaveCount(0)
        })

        test("a recusa do servidor aparece como aviso e a lista não muda", async ({ page }) => {
            await page.route(/\/api\/sessions(\?.*)?$/, (route) =>
                fulfillJson(route, { items: SESSIONS }),
            )
            await page.route(/\/api\/sessions\/[^/]+$/, (route) =>
                fulfillError(route, "Conta de demonstração é somente leitura", 403),
            )
            await page.goto("/seguranca")
            await hideDevTools(page)

            await page.getByRole("button", { name: "Encerrar sessão Safari · iOS" }).click()
            await page.getByRole("dialog").getByRole("button", { name: "Encerrar" }).click()

            await expect(page.getByText("Não foi possível encerrar a sessão")).toBeVisible()
            await expect(page.getByRole("listitem")).toHaveCount(3)
        })
    })
})
