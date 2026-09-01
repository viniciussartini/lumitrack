import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { mockSseStream, sseEvent } from "./support/sse"
import { DIST_CEMIG, METER_1, PROP_1 } from "./support/fixtures"

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
