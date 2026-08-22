import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import {
    BUCKET_HOUR_1,
    BUCKET_HOUR_2,
    BUCKET_MINUTE_1,
    BUCKET_MINUTE_2,
    DIST_CEMIG,
    METER_1,
    PROP_1,
} from "./support/fixtures"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * `ConsumptionSection` — consumo agregado somente leitura (Fase 3/5,
 * substitui o antigo CRUD manual de `ConsumptionRecord`). Testado através da
 * `PropertyDetailsPage` (`PropertyConsumptionSection`), que usa
 * `DETAILS_GRANULARITIES` (hora|dia) — os 4 níveis de `/relatorios` são
 * escopo da sub-issue #8.
 *
 * Ordem de checagem da própria seção: primeiro resolve se o alvo tem
 * medidor (`GET /api/meters/by-target`); só dispara `GET /api/consumption`
 * quando há medidor — sem isso, o EmptyState "Sem consumo para exibir"
 * aparece sem nenhuma chamada à API de consumo.
 */

/**
 * Configura mocks compartilhados (auth + AppShell + distribuidora + 1
 * propriedade fixa + áreas vazias). O medidor (`meters/by-target`) fica a
 * cargo de cada teste — é a variável que muda o comportamento da seção.
 */
const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, PROP_1)
        }
        return route.continue()
    })
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
    // Default vazio — o card "Consumo em tempo real" (issue #211) busca
    // /api/meter-readings sempre que há medidor; testes deste arquivo não
    // olham pro conteúdo desse card, mas a rota precisa de resposta (senão
    // cai no proxy do Vite pro backend real, que não está rodando aqui).
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )
}

test.describe("Consumo agregado (ConsumptionSection)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("sem medidor vinculado: mostra EmptyState orientando a configurar, sem chamar /api/consumption", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillError(route, "Alvo sem medidor vinculado", 404),
        )

        let consumptionCalled = false
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            consumptionCalled = true
            return fulfillPaginated(route, [])
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await expect(page.getByRole("heading", { level: 2, name: /^consumo$/i })).toBeVisible()
        await expect(page.getByText(/sem consumo para exibir/i)).toBeVisible()
        await expect(page.getByText(/configure um medidor na seção acima/i)).toBeVisible()
        await expect(page.getByTestId("consumption-table")).toHaveCount(0)
        await expect(page.getByTestId("consumption-chart")).toHaveCount(0)

        expect(consumptionCalled).toBe(false)
    })

    test("troca de granularidade (Hora → Dia) desce um nível de bucket e recorta a janela", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) => fulfillJson(route, METER_1))

        const requests: { granularity: string | null; from: string | null; to: string | null }[] =
            []

        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const granularity = url.searchParams.get("granularity")
            requests.push({
                granularity,
                from: url.searchParams.get("from"),
                to: url.searchParams.get("to"),
            })
            const items =
                granularity === "minute"
                    ? [BUCKET_MINUTE_1, BUCKET_MINUTE_2]
                    : granularity === "hour"
                      ? [BUCKET_HOUR_1, BUCKET_HOUR_2]
                      : []
            return fulfillJson(route, {
                items,
                total: items.length,
                page: 1,
                pageSize: 10,
                granularity,
            })
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // Hora é a granularidade default (primeiro item de DETAILS_GRANULARITIES)
        // e pede buckets de MINUTO da hora corrente — a issue #226.
        await expect(page.getByTestId("granularity-tab-hour")).toHaveAttribute(
            "aria-selected",
            "true",
        )
        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_1.bucketStart}`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_2.bucketStart}`),
        ).toBeVisible()
        await expect(page.getByTestId("consumption-chart")).toBeVisible()

        await page.getByTestId("granularity-tab-day").click()

        await expect(page.getByTestId("granularity-tab-day")).toHaveAttribute(
            "aria-selected",
            "true",
        )
        // Dia → buckets de HORA.
        await expect(page.getByTestId(`consumption-row-${BUCKET_HOUR_1.bucketStart}`)).toBeVisible()
        await expect(page.getByTestId(`consumption-row-${BUCKET_HOUR_2.bucketStart}`)).toBeVisible()
        // As linhas de minuto somem — prova que a query mudou de fato, não
        // só que a tabela ganhou linhas novas por cima das antigas.
        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_1.bucketStart}`),
        ).toHaveCount(0)

        // Toda consulta recorta uma janela fechada, e a janela da aba Dia
        // contém a da aba Hora.
        const minuteRequest = requests.find((r) => r.granularity === "minute")!
        const hourRequest = requests.find((r) => r.granularity === "hour")!

        for (const request of [minuteRequest, hourRequest]) {
            expect(request.from).toBeTruthy()
            expect(request.to).toBeTruthy()
            expect(new Date(request.from!).getTime()).toBeLessThan(new Date(request.to!).getTime())
        }
        expect(new Date(hourRequest.from!).getTime()).toBeLessThanOrEqual(
            new Date(minuteRequest.from!).getTime(),
        )
        expect(new Date(hourRequest.to!).getTime()).toBeGreaterThanOrEqual(
            new Date(minuteRequest.to!).getTime(),
        )
    })

    test("mostra EmptyState 'Sem leituras neste período' quando a granularidade não tem buckets", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) => fulfillJson(route, METER_1))
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await expect(page.getByText(/sem leituras neste período/i)).toBeVisible()
        await expect(page.getByText(/ainda não há consumo agregado/i)).toBeVisible()
        await expect(page.getByTestId("consumption-table")).toHaveCount(0)
        await expect(page.getByTestId("consumption-chart")).toHaveCount(0)
    })

    test("pagina a tabela de consumo dentro da mesma granularidade", async ({ page }) => {
        await setupAuthAndProperty(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) => fulfillJson(route, METER_1))

        let requestedPageSize: string | null = null

        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            requestedPageSize = url.searchParams.get("pageSize")
            const requestedPage = Number(url.searchParams.get("page") ?? "1")
            const items = requestedPage === 1 ? [BUCKET_MINUTE_1] : [BUCKET_MINUTE_2]
            return fulfillJson(route, {
                items,
                total: 11,
                page: requestedPage,
                pageSize: 10,
                granularity: "minute",
            })
        })

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // 30 registros por página (issue #227) — o teto do backend é 31.
        await expect.poll(() => requestedPageSize).toBe("30")

        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_1.bucketStart}`),
        ).toBeVisible()
        await expect(page.getByTestId("pagination")).toContainText(/11 itens · página 1 de 2/i)

        await page.getByTestId("pagination-next").click()

        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_2.bucketStart}`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_1.bucketStart}`),
        ).toHaveCount(0)
        await expect(page.getByTestId("pagination")).toContainText(/11 itens · página 2 de 2/i)

        // Volta pelo número da página, não pelo "anterior" — é o controle novo
        // da issue #227 exercitado na tela real.
        await page.getByTestId("pagination-page-1").click()

        await expect(
            page.getByTestId(`consumption-row-${BUCKET_MINUTE_1.bucketStart}`),
        ).toBeVisible()
        await expect(page.getByTestId("pagination-page-1")).toHaveAttribute("aria-current", "page")
    })
})
