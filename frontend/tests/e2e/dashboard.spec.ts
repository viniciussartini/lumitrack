import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockSseStream, sseEvent } from "./support/sse"
import { AREA_1, DIST_CEMIG, METER_1, PROP_1 } from "./support/fixtures"
import { mockPropertyTree } from "./support/propertyTree"

/**
 * E2E do Painel — igual a `realtime.spec.ts`: mocka o backend via
 * `page.route()`, sem depender do backend rodando.
 *
 * O seletor de propriedade já é exercitado aqui de passagem — é o
 * primeiro E2E da rota `/dashboard`, então cobre também o caminho até
 * chegar na propriedade com o KPI.
 *
 * `sseEvent`/`mockSseStream` vêm de `./support/sse`.
 */

/** 2ª propriedade só para os cenários de comparação — o resto do
 * arquivo usa só PROP_1, um único item não exercitaria "N propriedades". */
const PROP_2 = { ...PROP_1, id: "prop-2", name: "Loja" }

/** Medidor de nível PROPERTY vinculado diretamente a PROP_1 (ver nota de
 * design: KPIs usam só o medidor direto da propriedade, sem somar
 * Área/Dispositivo). */
const PROPERTY_METER = {
    ...METER_1,
    targetType: "PROPERTY" as const,
    propertyId: PROP_1.id,
    deviceId: null,
}

const TARIFF_FLAG = {
    currentFlag: "YELLOW" as const,
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.88,
    redP1Per100Kwh: 4.46,
    redP2Per100Kwh: 7.87,
    updatedAt: new Date().toISOString(),
}

const setupDashboard = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
    // `PropertyComparisonSection` dispara `GET /api/consumption/summary`
    // com os ids de todas as propriedades — endpoint batch, 1 requisição
    // pra N propriedades. Default vazio; o teste de comparação abaixo
    // sobrescreve com dado real.
    await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [] }),
    )
    // Default vazio — o gráfico "Consumo em tempo real" busca
    // /api/meter-readings sempre que há medidor; testes que não olham pro
    // conteúdo do gráfico não precisam sobrescrever isto.
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )
    await page.route(/\/api\/tariff-flag(\?.*)?$/, (route) => fulfillJson(route, TARIFF_FLAG))
    await mockPropertyTree(page)
}

test.describe("Painel — visão em tempo real (#116)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("propriedade com medidor recebe leitura ao vivo e mostra Potência agora", async ({
        page,
    }) => {
        // Relógio da PÁGINA congelado (page.clock, mesmo padrão de
        // realtime.spec.ts) — sem isso, o bucket abaixo é calculado com
        // `Date.now()` real no processo do teste (Node, não afetado por
        // page.clock) e comparado contra a hora corrente real da app no
        // browser; se o teste rodasse no primeiro minuto de uma hora, "1
        // minuto atrás" cairia na hora ANTERIOR e seria corretamente
        // excluído pela janela "hora corrente" de buildDenseWindowBuckets —
        // gráfico ficaria vazio de forma intermitente, dependendo só de
        // quando o CI por acaso executasse o teste. CLOCK_TIME fixo, longe
        // de qualquer fronteira de hora, elimina essa dependência.
        const CLOCK_TIME = "2026-07-17T12:30:00.000Z"
        await page.clock.install({ time: new Date(CLOCK_TIME) })

        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        // Um balde no minuto anterior ao atual — já "fechado", então
        // buildDenseWindowBuckets o inclui no gráfico (o balde em curso
        // nunca aparece, só os já persistidos). bucketStart segue a mesma
        // convenção do backend real (meter-reading.repository.ts::
        // findAggregated): dígitos de SP "mascarados" como UTC.
        await page.route(/\/api\/meter-readings(\?.*)?$/, (route) => {
            const SAO_PAULO_UTC_OFFSET_MS = 3 * 60 * 60 * 1000
            const maskedBucketStart = new Date(
                new Date(CLOCK_TIME).getTime() - 60_000 - SAO_PAULO_UTC_OFFSET_MS,
            )
            maskedBucketStart.setUTCSeconds(0, 0)
            return fulfillJson(route, {
                items: [{ bucketStart: maskedBucketStart.toISOString(), avgPowerW: 900 }],
                granularity: "minute",
            })
        })

        const streamBody =
            sseEvent("connected", { meterCount: 1 }) +
            sseEvent("reading", {
                meterId: PROPERTY_METER.id,
                voltage: 220,
                current: 5,
                powerW: 950,
                powerFactor: 0.95,
                receivedAt: CLOCK_TIME,
            })
        await mockSseStream(page, streamBody)

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByTestId("property-selector")).toBeVisible()
        // Card único "Potência agora" + custo estimado (corrige a divisão
        // anterior em 2 cards — handoff é 1 card com 2 linhas).
        // "Potência agora" vem do SSE (ao vivo); o gráfico vem do banco —
        // as duas fontes são independentes de propósito.
        await expect(page.getByText("0,95kW")).toBeVisible()
        await expect(page.getByTestId("realtime-power-chart")).toBeVisible()
    })

    test("mostra Consumo hoje/Custo projetado do mês e a bandeira vigente destacada (#117)", async ({
        page,
    }) => {
        // Relógio da PÁGINA congelado (mesmo padrão do teste "Potência
        // agora" acima) — o card "Consumo hoje" busca o bucket de hoje
        // comparando a data local do browser (`toLocalDateKey`) contra a
        // data do `bucketStart` do mock decodificada como UTC
        // (`bucketDateKey`, dashboardKpis.ts — mesma convenção do backend
        // real). Sem relógio fixo, os dois lados usam a hora real do
        // sistema; toda vez que o teste roda entre 21h e meia-noite em
        // São Paulo (UTC-3), a data UTC já virou o dia seguinte enquanto a
        // data local de SP ainda é "hoje", e o bucket deixa de ser
        // encontrado — falha intermitente e dependente só do horário do
        // CI. CLOCK_TIME fixo, longe de qualquer fronteira de dia nos dois
        // fusos, elimina essa dependência.
        const CLOCK_TIME = "2026-07-17T12:30:00.000Z"
        await page.clock.install({ time: new Date(CLOCK_TIME) })

        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const granularity = url.searchParams.get("granularity")
            if (granularity === "day") {
                // Meia-noite (UTC) do dia de CLOCK_TIME — mesma convenção
                // que `bucketDateKey` espera (dígitos de data já prontos
                // pra leitura via getters UTC), sem precisar de máscara de
                // fuso: à diferença do bucket de minuto do teste acima, um
                // bucket de DIA só precisa acertar a data, não a hora.
                const todayBucketStart = new Date(CLOCK_TIME)
                todayBucketStart.setUTCHours(0, 0, 0, 0)
                return fulfillPaginated(route, [
                    {
                        bucketStart: todayBucketStart.toISOString(),
                        kwhConsumed: 12,
                        costBrl: 9.6,
                        avgPowerW: 500,
                    },
                ])
            }
            return fulfillPaginated(route, [])
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByText("12,00kWh")).toBeVisible()

        const flagCard = page.getByTestId("tariff-flag-list-card")
        await expect(flagCard).toBeVisible()
        await expect(flagCard.getByText("Bandeiras tarifárias")).toBeVisible()

        const currentRow = page.getByTestId("tariff-flag-row-YELLOW")
        await expect(currentRow).toContainText("Vigente")
        await expect(currentRow).toContainText("Amarela")
    })

    test("propriedade sem medidor vinculado mostra estado vazio com link pra propriedade", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({ status: "error", message: "Alvo sem medidor vinculado" }),
            }),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByText(/não tem medidor vinculado/i)).toBeVisible()
        await expect(page.getByRole("link", { name: /ver propriedade/i })).toHaveAttribute(
            "href",
            `/propriedades/${PROP_1.id}`,
        )
    })

    test("gráfico de tempo real não tem mais opção de janela (issue #240)", async ({ page }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByText("Consumo em tempo real")).toBeVisible()
        await expect(page.getByTestId("realtime-window-toggle")).toHaveCount(0)
        await expect(page.getByTestId("realtime-window-24h")).toHaveCount(0)
        await expect(page.getByText(/última hora/i)).toBeVisible()
    })
})

test.describe("Painel — histórico e comparação entre propriedades (#119)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("histórico de consumo abre em Mensal e alterna entre 6 e 12 meses (issue #239)", async ({
        page,
    }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const granularity = url.searchParams.get("granularity")
            if (granularity === "month") {
                const pageSize = Number(url.searchParams.get("pageSize"))
                return fulfillPaginated(
                    route,
                    Array.from({ length: pageSize }, (_, i) => ({
                        bucketStart: new Date(2026, i, 1).toISOString(),
                        kwhConsumed: 100 + i,
                        costBrl: 80 + i,
                        avgPowerW: 500,
                    })),
                    { pageSize },
                )
            }
            if (granularity === "day") {
                // Bucket da visão Mensal (padrão default) — dia 1 e 2 do mês
                // corrente, dentro da janela que o componente pede.
                return fulfillPaginated(
                    route,
                    [
                        {
                            bucketStart: new Date(2026, 0, 1).toISOString(),
                            kwhConsumed: 10,
                            costBrl: 8,
                            avgPowerW: 500,
                        },
                        {
                            bucketStart: new Date(2026, 0, 2).toISOString(),
                            kwhConsumed: 12,
                            costBrl: 9.6,
                            avgPowerW: 500,
                        },
                    ],
                    { pageSize: 31 },
                )
            }
            return fulfillPaginated(route, [])
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const history = page.getByTestId("consumption-history-section")
        await expect(history).toBeVisible()
        // Padrão é Mensal.
        await expect(history.getByTestId("consumption-chart")).toBeVisible()
        await expect(page.getByTestId("history-range-month")).toHaveAttribute(
            "aria-selected",
            "true",
        )

        await page.getByTestId("history-range-6").click()

        await expect(page.getByTestId("history-range-6")).toHaveAttribute("aria-selected", "true")
        await expect(page.getByTestId("history-range-month")).toHaveAttribute(
            "aria-selected",
            "false",
        )

        await page.getByTestId("history-range-12").click()

        await expect(page.getByTestId("history-range-12")).toHaveAttribute("aria-selected", "true")
        await expect(page.getByTestId("history-range-6")).toHaveAttribute("aria-selected", "false")
    })

    test("compara consumo entre propriedades e alterna entre kWh e R$", async ({ page }) => {
        // setupDashboard registra só PROP_1 — sobrescrevemos /api/properties
        // depois (last-registered-wins, ver comentário de mockAppShellBackground)
        // para exercitar N propriedades.
        await setupDashboard(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) => {
            if (route.request().method() === "GET") {
                return fulfillPaginated(route, [PROP_1, PROP_2])
            }
            return route.continue()
        })
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            if (url.searchParams.get("granularity") !== "month") {
                return fulfillPaginated(route, [])
            }
            // Só o KPI da propriedade selecionada (PROP_1) chama isto agora
            // — a comparação entre propriedades usa o endpoint batch abaixo.
            return fulfillPaginated(route, [
                {
                    bucketStart: new Date().toISOString(),
                    kwhConsumed: 120,
                    costBrl: 96,
                    avgPowerW: 500,
                },
            ])
        })
        // `PropertyComparisonSection` — 1 requisição batch pra todas as
        // propriedades, não mais 1 por propriedade (substitui o mock acima
        // por targetId).
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, {
                items: [
                    {
                        id: PROP_1.id,
                        targetType: "PROPERTY",
                        bucketStart: new Date().toISOString(),
                        kwhConsumed: 120,
                        costBrl: 96,
                        avgPowerW: 500,
                    },
                    {
                        id: PROP_2.id,
                        targetType: "PROPERTY",
                        bucketStart: new Date().toISOString(),
                        kwhConsumed: 60,
                        costBrl: 48,
                        avgPowerW: 500,
                    },
                ],
            }),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const comparison = page.getByTestId("property-comparison-section")
        await expect(comparison).toBeVisible()
        await expect(comparison.getByText(PROP_1.name)).toBeVisible()
        await expect(comparison.getByText(PROP_2.name)).toBeVisible()
        await expect(comparison.getByText("120,00 kWh")).toBeVisible()
        await expect(comparison.getByText("60,00 kWh")).toBeVisible()

        await comparison.getByRole("button", { name: "R$" }).click()

        await expect(comparison.getByText(/R\$\s*96,00/)).toBeVisible()
        await expect(comparison.getByText(/R\$\s*48,00/)).toBeVisible()
    })

    test("não quebra com apenas 1 propriedade cadastrada", async ({ page }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            if (url.searchParams.get("granularity") === "month") {
                return fulfillPaginated(route, [
                    {
                        bucketStart: new Date().toISOString(),
                        kwhConsumed: 30,
                        costBrl: 24,
                        avgPowerW: 500,
                    },
                ])
            }
            return fulfillPaginated(route, [])
        })
        // `PropertyComparisonSection` só renderiza com pelo menos 1 alvo
        // trazendo dado — sem este mock (a versão em lote da chamada acima),
        // o teste abaixo (seção visível mesmo com 1 propriedade só) falharia.
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, {
                items: [
                    {
                        id: PROP_1.id,
                        targetType: "PROPERTY",
                        bucketStart: new Date().toISOString(),
                        kwhConsumed: 30,
                        costBrl: 24,
                        avgPowerW: 500,
                    },
                ],
            }),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByTestId("property-comparison-section")).toBeVisible()
        await expect(
            page.getByTestId("property-comparison-section").getByText(PROP_1.name),
        ).toBeVisible()
    })
})

/** Acompanhamento de uma meta de consumo de 2026: 100 kWh/mês, meses fechados na meta. */
const GOAL_PROGRESS_KWH = {
    goalId: "goal-kwh",
    year: 2026,
    unit: "KWH",
    months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 100,
        realized: i < 9 ? 100 : i === 9 ? 50 : null,
    })),
    yearTarget: 1200,
    realized: 950,
    deviationPercent: 0,
    currentMonthTarget: 300,
    situation: "IN_PROGRESS",
}

test.describe("Painel — meta de consumo", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra o acumulado e a projeção do mês e alterna para o ano e para o R$", async ({
        page,
    }) => {
        // 16/10/2026 meio-dia em São Paulo (e no mesmo dia em UTC): 15 dias
        // fechados num mês de 31, independente do fuso da máquina do CI.
        await page.clock.install({ time: new Date("2026-10-16T15:00:00.000Z") })
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await page.route(/\/api\/goals\/progress(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [GOAL_PROGRESS_KWH] }),
        )
        // O mês pede o consumo diário; o resto do Painel (KPIs, histórico) vem vazio.
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            if (url.searchParams.get("granularity") !== "day") return fulfillPaginated(route, [])
            return fulfillPaginated(
                route,
                Array.from({ length: 15 }, (_, i) => ({
                    bucketStart: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
                    kwhConsumed: 10,
                    costBrl: 8,
                    avgPowerW: 500,
                })),
                { pageSize: 31 },
            )
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const goal = page.getByTestId("goal-section")
        await expect(goal.getByText("Acumulado · até o dia 15")).toBeVisible()
        await expect(goal.getByTestId("goal-stats")).toContainText("150 kWh")
        await expect(goal.getByTestId("goal-stats")).toContainText("310 kWh")
        await expect(goal.getByTestId("goal-stats")).toContainText("+3,3% vs. meta")

        await page.getByTestId("goal-period-year").click()
        await expect(goal.getByTestId("goal-stats")).toContainText("1.200 kWh")
        await expect(goal.getByTestId("goal-stats")).toContainText("950 kWh")

        // Só há meta em kWh: o R$ mostra o vazio com o link para criá-la.
        await page.getByTestId("goal-unit-BRL").click()
        await expect(goal.getByTestId("goal-empty")).toContainText(
            "Nenhuma meta de custo cadastrada para 2026.",
        )
        await expect(goal.getByRole("link", { name: "Criar meta" })).toHaveAttribute(
            "href",
            `/configuracoes/metas?propertyId=${PROP_1.id}`,
        )
    })

    test("propriedade sem meta do ano mostra o vazio com o link para criá-la", async ({ page }) => {
        await setupDashboard(page)
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillJson(route, PROPERTY_METER),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 1 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const goal = page.getByTestId("goal-section")
        await expect(goal.getByTestId("goal-empty")).toBeVisible()
        await expect(goal.getByRole("link", { name: "Criar meta" })).toBeVisible()
    })
})

const DEVICE_ID = "device-geladeira"

/** Propriedade, a área e um dispositivo das fixtures — a hierarquia do "Consumo de hoje". */
const TODAY_TREE = {
    total: 1,
    items: [
        {
            id: PROP_1.id,
            name: PROP_1.name,
            tariffGroup: "GROUP_B" as const,
            areas: [
                {
                    id: AREA_1.id,
                    name: AREA_1.name,
                    devices: [{ id: DEVICE_ID, name: "Geladeira", powerWatts: 150 }],
                },
            ],
        },
    ],
}

const todayItem = (id: string, targetType: string, kwhConsumed: number, costBrl?: number) => ({
    id,
    targetType,
    bucketStart: "2026-10-16T00:00:00.000Z",
    kwhConsumed,
    avgPowerW: 500,
    ...(costBrl !== undefined && { costBrl }),
})

test.describe("Painel — consumo de hoje", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("expande a propriedade até o dispositivo e mostra '-' onde falta dado", async ({
        page,
    }) => {
        await page.clock.install({ time: new Date("2026-10-16T15:00:00.000Z") })
        await setupDashboard(page)
        await mockPropertyTree(page, () => TODAY_TREE)
        const summaryTargets: string[] = []
        // Um pedido por tipo de alvo; a área vem sem custo e o dispositivo sem medidor.
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const targetType = url.searchParams.get("targetType") ?? ""
            // A comparação entre propriedades também pede o resumo, em granularidade mês.
            if (url.searchParams.get("granularity") === "day") summaryTargets.push(targetType)
            const itemsByType: Record<string, unknown[]> = {
                PROPERTY: [todayItem(PROP_1.id, "PROPERTY", 12.5, 9.9)],
                AREA: [todayItem(AREA_1.id, "AREA", 7)],
                DEVICE: [],
            }
            return fulfillJson(route, { items: itemsByType[targetType] ?? [] })
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const section = page.getByTestId("today-consumption-section")
        const casa = section.getByRole("treeitem", { name: new RegExp(`^${PROP_1.name}:`) })
        await expect(casa).toContainText("12,50 kWh")
        await expect(casa).toContainText("R$")
        await expect(casa).toHaveAttribute("aria-expanded", "false")
        await expect(section.getByRole("treeitem")).toHaveCount(1)

        await casa.click()
        const area = section.getByRole("treeitem", { name: new RegExp(`^${AREA_1.name}:`) })
        await expect(area).toContainText("7,00 kWh")
        await expect(area.locator(".lt-today-cost")).toHaveText("-")

        await area.click()
        const device = section.getByRole("treeitem", { name: /^Geladeira:/ })
        await expect(device.locator(".lt-today-kwh")).toHaveText("-")
        await expect(device.locator(".lt-today-cost")).toHaveText("-")

        expect([...summaryTargets].sort()).toEqual(["AREA", "DEVICE", "PROPERTY"])
    })

    test("navega a hierarquia pelo teclado", async ({ page }) => {
        await page.clock.install({ time: new Date("2026-10-16T15:00:00.000Z") })
        await setupDashboard(page)
        await mockPropertyTree(page, () => TODAY_TREE)
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [] }),
        )
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const section = page.getByTestId("today-consumption-section")
        const casa = section.getByRole("treeitem", { name: new RegExp(`^${PROP_1.name}:`) })
        await casa.focus()
        await page.keyboard.press("ArrowRight")
        await expect(casa).toHaveAttribute("aria-expanded", "true")

        await page.keyboard.press("ArrowDown")
        const area = section.getByRole("treeitem", { name: new RegExp(`^${AREA_1.name}:`) })
        await expect(area).toBeFocused()

        await page.keyboard.press("Enter")
        await expect(area).toHaveAttribute("aria-expanded", "true")
        await expect(section.getByRole("treeitem", { name: /^Geladeira:/ })).toBeVisible()
    })
})

const WEIGHT_TREE = {
    total: 1,
    items: [
        {
            id: PROP_1.id,
            name: PROP_1.name,
            tariffGroup: "GROUP_B" as const,
            areas: [
                { id: "area-cozinha", name: "Cozinha", devices: [] },
                { id: "area-sala", name: "Sala", devices: [] },
                { id: "area-quintal", name: "Quintal", devices: [] },
            ],
        },
    ],
}

test.describe("Painel — peso de cada medidor", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("mostra a participação das áreas com medidor e recalcula ao desmarcar", async ({
        page,
    }) => {
        await page.clock.install({ time: new Date("2026-10-16T15:00:00.000Z") })
        await setupDashboard(page)
        await mockPropertyTree(page, () => WEIGHT_TREE)
        const monthRequests: string[] = []
        // Só as áreas com leitura no mês voltam; o Quintal fica de fora.
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            const isAreaMonth =
                url.searchParams.get("targetType") === "AREA" &&
                url.searchParams.get("granularity") === "month"
            if (isAreaMonth) monthRequests.push(url.searchParams.get("ids") ?? "")
            return fulfillJson(route, {
                items: isAreaMonth
                    ? [todayItem("area-cozinha", "AREA", 75), todayItem("area-sala", "AREA", 25)]
                    : [],
            })
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        const section = page.getByTestId("area-weight-section")
        const trigger = section.getByTestId("area-weight-menu-trigger")
        await expect(trigger).toHaveText(/2 de 2 medidores/)
        await expect(section.getByTestId("area-weight-chart").locator("li")).toHaveText([
            /Cozinha\s*75%/,
            /Sala\s*25%/,
        ])
        await expect(section.getByTestId("area-weight-chart-graphic")).toContainText("100")
        // O desenho não pode entrar na ordem de tabulação (tabindex -1 só tira do Tab).
        await expect(section.locator('svg [tabindex="0"]')).toHaveCount(0)
        expect(monthRequests).toEqual(["area-cozinha,area-sala,area-quintal"])

        await trigger.click()
        await section.getByRole("checkbox", { name: "Cozinha" }).uncheck()
        await expect(trigger).toHaveText(/1 de 2 medidores/)
        await expect(section.getByTestId("area-weight-chart").locator("li")).toHaveText([
            /Sala\s*100%/,
        ])

        await section.getByRole("checkbox", { name: "Sala" }).uncheck()
        await expect(section.getByText("Selecione ao menos um medidor.")).toBeVisible()

        await section.getByRole("button", { name: "Selecionar todos" }).click()
        await expect(trigger).toHaveText(/2 de 2 medidores/)
        await expect(section.getByTestId("area-weight-chart")).toBeVisible()
    })
})

const DIST_WITH_PEAK_WINDOW = {
    ...DIST_CEMIG,
    peakWindowStartHour: 18,
    peakWindowEndHour: 21,
}

const GROUP_A_PROPERTY = {
    ...PROP_1,
    id: "prop-ga",
    name: "Galpão",
    tariffGroup: "GROUP_A" as const,
    tariffSubgroup: "A4" as const,
    tariffModality: "GREEN" as const,
    contractedDemandKw: 200,
}

// Meia-noite de São Paulo (UTC-3) de 16/10/2026.
const DEMAND_DAY_START = Date.UTC(2026, 9, 16, 3, 0)

/** Visão de demanda do dia: medição até as 12:30, ponta das 18h às 21h. */
const demandOverview = (modality: "GREEN" | "BLUE") => ({
    propertyId: GROUP_A_PROPERTY.id,
    modality,
    windowMinutes: 15,
    contracted:
        modality === "GREEN"
            ? [{ post: null, kw: 200 }]
            : [
                  { post: "PEAK", kw: 150 },
                  { post: "OFF_PEAK", kw: 250 },
              ],
    current: { kw: 150, windowEnd: "2026-10-16T15:29:00.000Z" },
    monthMax: { kw: 230, windowEnd: "2026-10-09T21:14:00.000Z" },
    exceedancePercent: 15,
    day: {
        date: "2026-10-16",
        points: Array.from({ length: 96 }, (_, block) => {
            const peak = block >= 72 && block < 84
            return {
                windowEnd: new Date(DEMAND_DAY_START + (block * 15 + 14) * 60_000).toISOString(),
                kw: block < 50 ? 120 + 40 * Math.sin(block / 6) : null,
                post: peak ? "PEAK" : "OFF_PEAK",
                contractedKw: modality === "BLUE" ? (peak ? 150 : 250) : 200,
            }
        }),
    },
})

const setupGroupADashboard = async (page: Page, modality: "GREEN" | "BLUE" = "GREEN") => {
    await page.clock.install({ time: new Date("2026-10-16T15:30:00.000Z") })
    await setupDashboard(page)
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [GROUP_A_PROPERTY])
        }
        return route.continue()
    })
    await page.route(/\/api\/demand\/overview(\?.*)?$/, (route) =>
        fulfillJson(route, demandOverview(modality)),
    )
    // A faixa de ponta do bloco de meta lê a janela de ponta da distribuidora.
    await page.route(/\/api\/distributors\/[^/?]+$/, (route) =>
        fulfillJson(route, DIST_WITH_PEAK_WINDOW),
    )
    await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))
}

test.describe("Painel — demanda atual vs. contratada", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("propriedade do Grupo A mostra os cards, a nota da modalidade e o gráfico acessível", async ({
        page,
    }) => {
        await setupGroupADashboard(page)

        await page.goto("/dashboard")
        await hideDevTools(page)

        const demand = page.getByTestId("demand-section")
        await expect(demand).toContainText("modalidade Verde · medição a cada 15 min")
        const stats = demand.getByTestId("demand-stats")
        await expect(stats).toContainText("150 kW")
        await expect(stats).toContainText("230 kW")
        await expect(stats).toContainText("200 kW")
        await expect(stats).toContainText("+15,0%")
        // O desenho não pode entrar na ordem de tabulação; os valores estão na tabela.
        await expect(demand.locator('svg [tabindex="0"]')).toHaveCount(0)
        await expect(demand.locator("table.sr-only tbody tr")).toHaveCount(96)
    })

    test("Azul mostra as duas contratadas", async ({ page }) => {
        await setupGroupADashboard(page, "BLUE")

        await page.goto("/dashboard")
        await hideDevTools(page)

        const demand = page.getByTestId("demand-section")
        await expect(demand).toContainText("modalidade Azul")
        await expect(demand.getByTestId("demand-stats")).toContainText("Ponta 150 · Fora 250 kW")
    })

    test("propriedade do Grupo B não mostra o bloco nem chama o endpoint", async ({ page }) => {
        const demandCalls: string[] = []
        await setupDashboard(page)
        await page.route(/\/api\/demand\/overview(\?.*)?$/, (route) => {
            demandCalls.push(route.request().url())
            return fulfillJson(route, demandOverview("GREEN"))
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByTestId("today-consumption-section")).toBeVisible()
        await expect(page.getByTestId("demand-section")).toHaveCount(0)
        expect(demandCalls).toEqual([])
    })
})

test.describe("Painel — faixa de horário de ponta", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("Grupo A mostra a janela da distribuidora e a participação da ponta no mês", async ({
        page,
    }) => {
        await setupGroupADashboard(page)
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            if (url.searchParams.get("granularity") !== "month") {
                return fulfillPaginated(route, [])
            }
            return fulfillPaginated(route, [
                {
                    bucketStart: "2026-10-01T00:00:00.000Z",
                    kwhConsumed: 1000,
                    costBrl: 800,
                    avgPowerW: 500,
                    groupA: {
                        contractedDemandKw: 200,
                        demandByPost: [],
                        demandBrl: 0,
                        ultrapassagemBrl: 0,
                        energyByPost: [
                            { post: "PEAK", kwhConsumed: 310, brl: 400 },
                            { post: "OFF_PEAK", kwhConsumed: 690, brl: 300 },
                        ],
                        ereByWindow: [],
                        ereBrl: 0,
                        flagBrl: 0,
                        taxesBrl: 0,
                        publicLightingFeeBrl: 0,
                    },
                },
            ])
        })

        await page.goto("/dashboard")
        await hideDevTools(page)

        const band = page.getByTestId("goal-section").getByTestId("peak-hours-band")
        await expect(band).toContainText(
            "Seg a sex, 18h–21h · excluídos sábados, domingos e feriados",
        )
        await expect(band).toContainText("Consumo na ponta responde por 31% do acumulado do mês")
    })

    test("sem consumo no mês a participação é '-', nunca 0%", async ({ page }) => {
        await setupGroupADashboard(page)

        await page.goto("/dashboard")
        await hideDevTools(page)

        const band = page.getByTestId("peak-hours-band")
        await expect(band).toContainText("Consumo na ponta no mês: -")
        await expect(band).not.toContainText("0%")
    })

    test("Grupo B não mostra a faixa nem consulta a distribuidora", async ({ page }) => {
        const distributorCalls: string[] = []
        await setupDashboard(page)
        await page.route(/\/api\/distributors\/[^/?]+$/, (route) => {
            distributorCalls.push(route.request().url())
            return fulfillJson(route, DIST_WITH_PEAK_WINDOW)
        })
        await mockSseStream(page, sseEvent("connected", { meterCount: 0 }))

        await page.goto("/dashboard")
        await hideDevTools(page)

        await expect(page.getByTestId("goal-section")).toBeVisible()
        await expect(page.getByTestId("peak-hours-band")).toHaveCount(0)
        expect(distributorCalls).toEqual([])
    })
})
