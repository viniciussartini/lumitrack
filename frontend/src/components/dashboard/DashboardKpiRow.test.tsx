import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow"
import { consumptionService } from "@/services/consumption.service"
import { tariffFlagService } from "@/services/tariff-flag.service"
import { computeMonthProjection, daysInMonth } from "@/lib/dashboardKpis"
import { formatBrl } from "@/lib/format"
import type { BucketSize, ConsumptionBucket, Granularity } from "@/types/consumption.types"
import type { Paginated } from "@/types/pagination.types"
import type { TariffFlagConfig } from "@/types/tariff-flag.types"
import type { ReadingPayload } from "@/lib/sse/appStream"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: { list: vi.fn() },
}))

vi.mock("@/services/tariff-flag.service", () => ({
    tariffFlagService: { get: vi.fn() },
}))

// Fuso fixado em America/Sao_Paulo pra todo o processo de teste via
// `test.env.TZ` (vite.config.ts) — as constantes de data abaixo (que leem
// `now` via getters locais) dependem de um offset não-zero em relação a UTC
// pra reproduzir os bugs de dupla conversão de fuso ao decodificar datas
// vindas do backend.

// Datas relativas ao "agora" real do processo (sem fake timers — `findByText`/
// `waitFor` do testing-library dependem de timers reais para o polling
// assíncrono).
const now = new Date()
// Bucket de MÊS: fixture de meio-dia local, só pra testar a matemática da
// projeção (`computeMonthProjection`) isolada da decodificação do bucket —
// a decodificação em si (`findBucketForMonth`) já tem cobertura própria com
// a codificação real do backend logo abaixo (`currentMonthSpBucket`).
const firstOfMonthNoon = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)

/**
 * bucketStart de DIA no formato REAL que o backend produz:
 * timestamp naive de meia-noite SP, cujos dígitos o driver decodifica como
 * se já fossem UTC — não meio-dia local convertido de verdade via
 * `.toISOString()`. Os componentes de data vêm do próprio `date` local
 * (mesmos que `DashboardKpiRow` calcularia via `now.getDate()`), então o
 * teste fica determinístico em qualquer fuso do processo que o roda.
 */
const spDayBucketStart = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}T00:00:00.000Z`
}
const todaySpBucket = spDayBucketStart(now)
const yesterdaySpBucket = spDayBucketStart(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
)

/**
 * bucketStart de MÊS no formato REAL que o backend produz:
 * mesma codificação de `spDayBucketStart`, mas sempre no dia 1 — é como
 * `date_trunc('month', ...)` trunca no backend.
 */
const spMonthBucketStart = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${month}-01T00:00:00.000Z`
}
const currentMonthSpBucket = spMonthBucketStart(now)

const paginated = <T,>(items: T[]): Paginated<T> & { granularity: Granularity } => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 5,
    granularity: "hour",
})

const bucket = (bucketStart: string, kwhConsumed: number, costBrl: number): ConsumptionBucket => ({
    bucketStart,
    kwhConsumed,
    costBrl,
    avgPowerW: 500,
})

const mockTariffFlag: TariffFlagConfig = {
    currentFlag: "YELLOW",
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.88,
    redP1Per100Kwh: 4.46,
    redP2Per100Kwh: 7.87,
    updatedAt: now.toISOString(),
}

const mockReading = (powerW: number): ReadingPayload => ({
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW,
    powerFactor: 0.98,
    receivedAt: now.toISOString(),
})

/**
 * Devolve dado diferente por granularidade — cada KPI busca uma.
 *
 * `BucketSize` (não `Granularity`): `consumptionService.list` aceita
 * "minute" também — `Record<Granularity, ...>` não tem essa chave e
 * `responses[params.granularity]` quebrava o `tsc` (bug pré-existente,
 * sem relação com o bug de fuso deste arquivo).
 */
const mockConsumptionByGranularity = (
    responses: Partial<Record<BucketSize, ConsumptionBucket[]>>,
) => {
    vi.mocked(consumptionService.list).mockImplementation(async (params) =>
        paginated(responses[params.granularity] ?? []),
    )
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderRow = (props: Partial<Parameters<typeof DashboardKpiRow>[0]> = {}) => {
    const queryClient = createTestQueryClient()
    return render(
        <DashboardKpiRow propertyId="prop-1" reading={undefined} isStale={true} {...props} />,
        {
            wrapper: ({ children }) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            ),
        },
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    mockConsumptionByGranularity({})
    vi.mocked(tariffFlagService.get).mockResolvedValue(mockTariffFlag)
})

describe("DashboardKpiRow — Potência agora / custo estimado", () => {
    it("mostra '—' sem leitura ao vivo", async () => {
        renderRow()
        await screen.findByText("Potência agora")
        expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    })

    it("mostra a potência e o custo estimado com leitura + bucket de hora", async () => {
        mockConsumptionByGranularity({
            hour: [bucket(now.toISOString(), 2, 1)], // tarifa efetiva R$0,50/kWh
        })

        renderRow({ reading: mockReading(1000), isStale: false }) // 1 kW

        expect(await screen.findByText("1,00kW")).toBeInTheDocument()
        expect(await screen.findByText(/≈ R\$\s?0,50\/h estimado/)).toBeInTheDocument()
    })
})

describe("DashboardKpiRow — Consumo hoje", () => {
    it("mostra o delta vs. ontem quando os dois buckets existem", async () => {
        mockConsumptionByGranularity({
            day: [bucket(todaySpBucket, 12, 9.6), bucket(yesterdaySpBucket, 10, 8)],
        })

        renderRow()

        expect(await screen.findByText("12,00kWh")).toBeInTheDocument()
        // (12-10)/10 = +20% — consumo maior que ontem
        expect(await screen.findByText(/\+20% vs\. ontem/)).toBeInTheDocument()
    })

    it("não mostra delta quando não há bucket de ontem", async () => {
        mockConsumptionByGranularity({
            day: [bucket(todaySpBucket, 5, 4)],
        })

        renderRow()

        expect(await screen.findByText("5,00kWh")).toBeInTheDocument()
        expect(screen.queryByText(/vs\. ontem/)).not.toBeInTheDocument()
    })

    it("mostra 0,00kWh quando não há bucket de hoje (sem inventar dado)", async () => {
        mockConsumptionByGranularity({ day: [] })

        renderRow()

        expect(await screen.findByText("0,00kWh")).toBeInTheDocument()
    })
})

describe("DashboardKpiRow — Custo projetado do mês", () => {
    it("projeta linearmente a partir do custo acumulado no mês corrente", async () => {
        const costSoFar = 30
        mockConsumptionByGranularity({
            month: [bucket(firstOfMonthNoon.toISOString(), 40, costSoFar)],
        })

        const dayOfMonth = now.getDate()
        const totalDays = daysInMonth(now)
        const expectedProjection = computeMonthProjection(costSoFar, dayOfMonth, totalDays)
        const expectedDaysToClose = totalDays - dayOfMonth

        renderRow()

        // Comparação por conteúdo normalizado (espaço comum vs. NBSP do
        // Intl.NumberFormat) — o normalizador padrão do testing-library só
        // normaliza o texto do DOM, não a string de busca.
        const expectedProjectionText = formatBrl(expectedProjection).replace(/\s/g, " ")
        expect(
            await screen.findByText(
                (content) => content.replace(/\s/g, " ") === expectedProjectionText,
            ),
        ).toBeInTheDocument()
        expect(
            await screen.findByText(new RegExp(`fechamento em ${expectedDaysToClose} dias`)),
        ).toBeInTheDocument()
    })

    it("acha o bucket do mês mesmo com a codificação real de dia 1 meia-noite SP (issue #234)", async () => {
        // Fixture de meio-dia local (teste acima) nunca cruza fronteira de
        // mês em fuso nenhum — mascarava a mesma classe de bug já
        // confirmada no teste do bucket de dia, acima. Dia 1 meia-noite SP
        // naive-como-UTC é a codificação real que o backend produz pra
        // bucket de mês.
        const costSoFar = 30
        mockConsumptionByGranularity({
            month: [bucket(currentMonthSpBucket, 40, costSoFar)],
        })

        const dayOfMonth = now.getDate()
        const totalDays = daysInMonth(now)
        const expectedProjection = computeMonthProjection(costSoFar, dayOfMonth, totalDays)

        renderRow()

        const expectedProjectionText = formatBrl(expectedProjection).replace(/\s/g, " ")
        expect(
            await screen.findByText(
                (content) => content.replace(/\s/g, " ") === expectedProjectionText,
            ),
        ).toBeInTheDocument()
    })
})

describe("DashboardKpiRow — Bandeira vigente", () => {
    it("mostra o label e a nota da bandeira vigente (dado real da API)", async () => {
        renderRow()

        expect(await screen.findByText("Amarela")).toBeInTheDocument()
        expect(await screen.findByText(/\+ R\$\s?1,88 \/ 100 kWh/)).toBeInTheDocument()
    })

    it("mostra 'sem acréscimo' quando o valor da bandeira é zero", async () => {
        vi.mocked(tariffFlagService.get).mockResolvedValue({
            ...mockTariffFlag,
            currentFlag: "GREEN",
        })

        renderRow()

        expect(await screen.findByText("Verde")).toBeInTheDocument()
        expect(await screen.findByText("sem acréscimo")).toBeInTheDocument()
    })
})
