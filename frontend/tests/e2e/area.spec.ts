import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { mockPropertyTree } from "./support/propertyTree"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DEVICE_1, DIST_CEMIG, METER_1, PROP_1 } from "./support/fixtures"
import type { Area } from "../../src/types/area.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre a Área dentro da Análise:
 *   1. Chegar à área pela árvore de seleção (propriedade → área)
 *   2. Ver detalhes
 *   3. Editar (botão "Editar área", mesmo modal, sem sair da página)
 *   4. KPIs "Consumo hoje" e "Custo do mês" com dado real, e custo indisponível
 *      (Grupo A/Branca) como traço explicado
 *   5. Comparação de dispositivos com o consumo medido
 *
 * Criar e excluir área vivem em Configurações → Cadastro (settings.spec.ts):
 * as páginas da propriedade e da área não têm mais "Adicionar área", grade
 * de áreas, "Adicionar dispositivo", grade de dispositivos nem menu de excluir.
 *
 * O spec parte com 1 propriedade e 1 área já cadastradas.
 */

type AreaSeed = Area

/**
 * Configura mocks compartilhados (auth + AppShell + distribuidora + 1
 * propriedade fixa). As ÁREAS são geridas dentro de cada teste via closure
 * mutável, porque o estado da DB simulada evolui ao longo do fluxo.
 */
const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    // Distribuidora — usada apenas nos chips da PropertyDetailsPage.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    // Propriedade fixa — não editamos nem deletamos nesta spec.
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

    // MeterSection é renderizada em toda Property/AreaDetailsPage — sem
    // medidor vinculado, 404 é o estado normal em qualquer targetType.
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )

    // Sem medidor, o fallback REST de potência (`useLatestMeterReading`) não
    // deveria nem disparar — mas a rota precisa de resposta de qualquer
    // forma (senão vaza pro proxy do Vite pro backend real).
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )

    // `PropertyConsumptionSection` (o gráfico principal da propriedade)
    // dispara `GET /api/consumption` — sem esse mock, a chamada vaza pro
    // proxy do Vite: localmente falha como erro de rede (inofensivo,
    // mascara o problema); em CI, com o backend real de pé, o 401 (sem
    // sessão real — a auth aqui é só `page.route` em `/api/auth/me`)
    // dispara o interceptor global de "unauthorized" e redireciona pra
    // /login no meio do teste — sintoma: "element was detached from the
    // DOM" ao clicar em qualquer coisa depois (ver comentário em
    // `support/appShell.ts`).
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))

    // `AreasSection` (PropertyDetailsPage) dispara `GET /api/consumption/summary`
    // com os ids de todas as áreas da lista pra montar a "Comparação de
    // áreas" (endpoint batch — 1 requisição pra N áreas, não 1 por área) —
    // incondicional, não depende de a área ter medidor (a exclusão do id
    // sem dado é tratada no próprio backend). Mesmo sintoma do mock acima
    // se ficar sem resposta.
    await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [] }),
    )
}

/**
 * Registra os mocks dos endpoints de Area apontando pro estado mutável
 * passado como argumento. Encapsula o "DB simulada" pra cada teste.
 *
 * Cobertura de rotas:
 *   - GET    /api/properties/prop-1/areas         → lista (paginada)
 *   - POST   /api/properties/prop-1/areas         → cria (gera id sequencial)
 *   - GET    /api/properties/prop-1/areas/:id     → detalhe
 *   - PUT    /api/properties/prop-1/areas/:id     → atualiza
 *   - DELETE /api/properties/prop-1/areas/:id     → remove (204 sem body)
 *   - GET    .../areas/:id/devices                → lista vazia (DevicesSection
 *     da AreaDetailsPage renderiza pra toda área, mesmo as recém-criadas)
 *
 * Nota sobre o glob: `**\/api/properties/prop-1/areas/*` casa
 * `/areas/area-1` mas NÃO `/areas` (o `*` exige ao menos um segmento).
 * Por isso registramos os dois separadamente.
 */
const setupAreasRoutes = async (page: Page, state: { areas: AreaSeed[]; nextId: number }) => {
    // A árvore de Análise reflete o estado das áreas — editar ou excluir
    // invalida a chave da árvore e ela é lida de novo.
    await mockPropertyTree(page, () => ({
        total: 1,
        items: [
            {
                id: PROP_1.id,
                name: PROP_1.name,
                areas: state.areas.map((area) => ({ id: area.id, name: area.name, devices: [] })),
            },
        ],
    }))

    // Lista e criação. Regex (não glob): useAreas sempre envia
    // ?page=&pageSize= mesmo nos defaults — um glob sem tratar a query
    // string não casa a URL real e a requisição vaza pro backend (502).
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, async (route) => {
        const method = route.request().method()

        if (method === "GET") {
            return fulfillPaginated(route, state.areas)
        }

        if (method === "POST") {
            const body = JSON.parse(route.request().postData() ?? "{}")
            const created: AreaSeed = {
                id: `area-${state.nextId++}`,
                propertyId: "prop-1",
                name: body.name,
                description: body.description ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            state.areas.push(created)
            return fulfillJson(route, created, 201)
        }

        return route.continue()
    })

    // Detalhe, atualização e remoção (qualquer :areaId)
    await page.route("**/api/properties/prop-1/areas/*", async (route) => {
        const method = route.request().method()
        const url = new URL(route.request().url())
        const areaId = url.pathname.split("/").pop()!

        const index = state.areas.findIndex((a) => a.id === areaId)

        if (method === "GET") {
            if (index === -1) {
                return fulfillError(route, "Área não encontrada", 404)
            }
            return fulfillJson(route, state.areas[index])
        }

        if (method === "PUT") {
            if (index === -1) {
                return route.fulfill({ status: 404 })
            }
            const body = JSON.parse(route.request().postData() ?? "{}")
            state.areas[index] = {
                ...state.areas[index]!,
                ...body,
                updatedAt: new Date().toISOString(),
            }
            return fulfillJson(route, state.areas[index])
        }

        if (method === "DELETE") {
            if (index !== -1) {
                state.areas.splice(index, 1)
            }
            return route.fulfill({ status: 204 })
        }

        return route.continue()
    })

    // Idem: regex pra tolerar ?page=&pageSize= no GET de useDevices.
    await page.route(/\/api\/properties\/[^/]+\/areas\/[^/]+\/devices(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [])
        }
        return route.continue()
    })
}

test.describe("Área na Análise", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("chega pela árvore, vê detalhes e edita uma área", async ({ page }) => {
        await setupAuthAndProperty(page)
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [{ ...AREA_1, name: "Sala", description: "Área principal de convivência" }],
            nextId: 2,
        }
        await setupAreasRoutes(page, state)

        // ─── 1. Árvore: propriedade expande e revela a área ──────────────────
        await page.goto("/propriedades")
        await hideDevTools(page)
        await page.getByRole("treeitem", { name: "Casa Principal" }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        // Sem áreas cadastráveis aqui: só a comparação, que sem medidor explica por quê.
        await expect(page.getByTestId("areas-grid")).toHaveCount(0)
        await expect(page.getByRole("button", { name: /adicionar área/i })).toHaveCount(0)

        // ─── 2. Selecionar a área abre o detalhe ─────────────────────────────
        await page.getByRole("treeitem", { name: "Sala" }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(page.getByRole("treeitem", { name: "Sala" })).toHaveAttribute(
            "aria-selected",
            "true",
        )

        const main = page.getByRole("main")
        await expect(main.getByRole("heading", { level: 2, name: /sala/i })).toBeVisible()
        await expect(main.getByText(/área principal de convivência/i)).toBeVisible()
        // A árvore também mostra o nome da propriedade — o chip é o que se confere aqui.
        await expect(main.locator(".tag", { hasText: /casa principal/i })).toBeVisible()
        await expect(
            main.getByText("Cadastre dispositivos para comparar o consumo entre eles."),
        ).toBeVisible()
        await expect(page.getByRole("button", { name: /adicionar dispositivo/i })).toHaveCount(0)
        await expect(page.getByRole("button", { name: /opções de/i })).toHaveCount(0)

        // ─── 3. Editar via botão do header (modal, sem navegar) ──────────────
        await page.getByRole("button", { name: /editar área/i }).click()
        const editDialog = page.getByRole("dialog", { name: /editar área/i })
        await expect(editDialog).toBeVisible()
        await expect(page.getByLabel(/nome da área/i)).toHaveValue("Sala")

        await page.getByLabel(/nome da área/i).fill("Sala renovada")
        await page.getByRole("button", { name: /salvar área/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(main.getByRole("heading", { level: 2, name: /sala renovada/i })).toBeVisible()
        await expect(page.getByRole("treeitem", { name: "Sala renovada" })).toBeVisible()
    })

    test.describe("com medidor na área", () => {
        const TODAY = new Date()
        const pad = (value: number) => String(value).padStart(2, "0")
        const DAY_START = `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}-${pad(TODAY.getDate())}T00:00:00.000Z`
        const MONTH_START = `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}-01T00:00:00.000Z`
        const AREA_METER = {
            ...METER_1,
            name: "Medidor da Cozinha",
            targetType: "AREA",
            areaId: "area-1",
            deviceId: null,
        }

        const item = (
            id: string,
            targetType: string,
            bucketStart: string,
            kwh: number,
            cost?: number,
        ) => ({
            id,
            targetType,
            bucketStart,
            kwhConsumed: kwh,
            avgPowerW: 300,
            ...(cost !== undefined && { costBrl: cost }),
        })

        /** Resumo por alvo e granularidade, como o backend responde ao lote. */
        const mockSummary = async (page: Page, options: { areaCost: boolean }) =>
            page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) => {
                const params = new URL(route.request().url()).searchParams
                if (params.get("targetType") === "DEVICE") {
                    return fulfillJson(route, {
                        items: [
                            item(
                                "device-1",
                                "DEVICE",
                                MONTH_START,
                                60,
                                options.areaCost ? 48 : undefined,
                            ),
                        ],
                    })
                }
                const isDay = params.get("granularity") === "day"
                const cost = options.areaCost ? (isDay ? 10 : 160) : undefined
                return fulfillJson(route, {
                    items: [
                        isDay
                            ? item("area-1", "AREA", DAY_START, 12.5, cost)
                            : item("area-1", "AREA", MONTH_START, 200, cost),
                    ],
                })
            })

        test.beforeEach(async ({ page }) => {
            await setupAuthAndProperty(page)
            await setupAreasRoutes(page, { areas: [{ ...AREA_1 }], nextId: 2 })
            await page.route(/\/api\/properties\/prop-1\/areas\/area-1\/devices(\?.*)?$/, (route) =>
                fulfillPaginated(route, [
                    DEVICE_1,
                    { ...DEVICE_1, id: "device-2", name: "Ventilador" },
                ]),
            )
            await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
                new URL(route.request().url()).searchParams.get("targetType") === "AREA"
                    ? fulfillJson(route, AREA_METER)
                    : fulfillError(route, "Alvo sem medidor vinculado", 404),
            )
        })

        test("mostra consumo de hoje, custo do mês e a comparação de dispositivos", async ({
            page,
        }) => {
            await mockSummary(page, { areaCost: true })
            await page.goto("/propriedades/prop-1/areas/area-1")
            await hideDevTools(page)

            const main = page.getByRole("main")
            await expect(main.getByText("Medidor da Cozinha")).toBeVisible()
            await expect(main.getByText("12,50")).toBeVisible()
            await expect(main.getByText(/R\$\s?160,00/)).toBeVisible()
            await expect(main.getByText("200,00 kWh/mês")).toBeVisible()

            const comparison = page.getByTestId("device-comparison")
            await expect(comparison.getByText("Geladeira")).toBeVisible()
            await expect(comparison.getByText("60,00 kWh")).toBeVisible()
            await expect(comparison.getByText("Ventilador")).toHaveCount(0)
            await expect(
                comparison.getByText("1 dispositivo sem medidor não aparece na comparação."),
            ).toBeVisible()
            await comparison.getByRole("button", { name: "R$" }).click()
            await expect(comparison.getByText(/R\$\s?48,00/)).toBeVisible()
        })

        test("sem custo calculável (Grupo A ou Branca), o custo do mês é traço explicado", async ({
            page,
        }) => {
            await mockSummary(page, { areaCost: false })
            await page.goto("/propriedades/prop-1/areas/area-1")
            await hideDevTools(page)

            const main = page.getByRole("main")
            await expect(main.getByText("12,50")).toBeVisible()
            await expect(
                main.getByText("Custo indisponível para esta tarifa.").first(),
            ).toBeVisible()
            await expect(main.getByText("200,00 kWh/mês")).toBeVisible()

            const comparison = page.getByTestId("device-comparison")
            await expect(comparison.getByText("60,00 kWh")).toBeVisible()
            await expect(comparison.getByRole("button", { name: "R$" })).toBeDisabled()
        })
    })
})
