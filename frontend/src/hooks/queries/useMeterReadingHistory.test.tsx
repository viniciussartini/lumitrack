import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useMeterReadingHistory } from "@/hooks/queries/useMeterReadingHistory"
import { meterReadingService } from "@/services/meterReading.service"

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { list: vi.fn() },
}))

// Mesmos helpers de `realtimePowerBuckets.test.ts` — "agora" é sempre um
// epoch verdadeiro; os itens do serviço replicam o formato que o backend
// devolve (dígitos de SP "mascarados" como UTC).
const SP_OFFSET_MS = 3 * 60 * 60 * 1000
const trueEpoch = (h: number, m: number, s = 0): number =>
    Date.UTC(2026, 7, 20, h, m, s) + SP_OFFSET_MS
const maskedIso = (h: number, m: number): string =>
    new Date(Date.UTC(2026, 7, 20, h, m, 0)).toISOString()

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("useMeterReadingHistory — retenção na virada de hora", () => {
    it("mantém os últimos baldes não vazios quando a virada de hora devolve vazio", async () => {
        // Fetch a 30s da virada — o mesmo espaçamento do `refetchInterval`
        // real, não um salto arbitrário: é essa janela curta que o limite de
        // retenção precisa continuar cobrindo.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(19, 59, 30))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: maskedIso(19, 0), avgPowerW: 1000 }],
            granularity: "minute",
        })

        const { result } = renderHook(
            () => useMeterReadingHistory("PROPERTY", "prop-1", "meter-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.data).toBeDefined())
        const bucketsBeforeTurnover = result.current.data!
        const updatedAtBeforeTurnover = result.current.dataUpdatedAt
        expect(bucketsBeforeTurnover.length).toBeGreaterThan(0)

        // Vira a hora: primeiro minuto do novo período, nenhum ainda fechado
        // — `buildDenseWindowBuckets` devolve `[]` pra qualquer alvo aqui,
        // não só pra quem nunca teve leitura.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 0, 5))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })

        await result.current.refetch()

        // Espera o SEGUNDO fetch assentar (`dataUpdatedAt` muda) antes de
        // checar o valor final — sem isso, `waitFor` compararia contra o
        // valor antigo antes de o refetch assíncrono ter chance de aplicar,
        // e passaria mesmo se a virada de hora tivesse mesmo esvaziado o
        // gráfico (a asserção nunca teria motivo pra falhar).
        await waitFor(() => {
            expect(result.current.dataUpdatedAt).not.toBe(updatedAtBeforeTurnover)
        })
        expect(result.current.data).toEqual(bucketsBeforeTurnover)
    })

    it("primeiro carregamento sem nenhum minuto fechado ainda mostra vazio (sem baldes anteriores pra reter)", async () => {
        // Consultado nos primeiros segundos da hora, antes de qualquer minuto
        // fechar — não é regressão, é o caso real de "sem dado ainda".
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(19, 0, 5))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })

        const { result } = renderHook(
            () => useMeterReadingHistory("PROPERTY", "prop-1", "meter-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual([])
    })

    it("para de reter depois de ~2 minutos sem virada resolvida (retorno de segundo plano tardio)", async () => {
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(18, 45, 0))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: maskedIso(18, 0), avgPowerW: 1000 }],
            granularity: "minute",
        })

        const { result } = renderHook(
            () => useMeterReadingHistory("PROPERTY", "prop-1", "meter-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))

        // Aba volta de segundo plano mais de 1h depois (sem `refetchInterval`
        // rodando enquanto estava em background), bem no primeiro minuto de
        // uma hora nova (a única janela em que `buildDenseWindowBuckets`
        // devolve `[]` de propósito) — sem o limite de idade, o retido de
        // 18:45 continuaria sendo servido como se fosse dado da hora
        // corrente.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 0, 30))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })

        await result.current.refetch()

        await waitFor(() => expect(result.current.data).toEqual([]))
    })

    it("mantém o retido mesmo quando o backend atrasa além do 1min ideal pra fechar o minuto novo da hora", async () => {
        // Último poll não-vazio pouco antes da virada — o pior caso pra
        // idade do retido: o `refetchInterval` pode capturar o último dado
        // fresco até ~30s antes da virada em si.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(19, 59, 45))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: maskedIso(19, 0), avgPowerW: 1000 }],
            granularity: "minute",
        })

        const { result } = renderHook(
            () => useMeterReadingHistory("PROPERTY", "prop-1", "meter-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
        const bucketsBeforeTurnover = result.current.data!
        let lastUpdatedAt = result.current.dataUpdatedAt

        // Virada de hora, minuto ainda em curso — vazio esperado, retido
        // cobre sem esforço (~25s decorridos).
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 0, 10))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })
        await result.current.refetch()
        await waitFor(() => expect(result.current.dataUpdatedAt).not.toBe(lastUpdatedAt))
        expect(result.current.data).toEqual(bucketsBeforeTurnover)
        lastUpdatedAt = result.current.dataUpdatedAt

        // O minuto novo (20:00) só é persistido quando o rollup do backend
        // drena o buffer no flush seguinte, alinhado a 20:01:00 — não em
        // tempo real por leitura. Sob carga (muitos medidores concorrendo
        // pelo pool de conexões), esse flush pode atrasar alguns segundos
        // além do ideal antes de o dado ficar visível via `/api/meter-readings`.
        // Aqui, ~50s de atraso: ainda vazio às 20:01:50 (125s desde o
        // retido), dado real só a partir de 20:01:56.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 1, 50))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })
        await result.current.refetch()
        await waitFor(() => expect(result.current.dataUpdatedAt).not.toBe(lastUpdatedAt))
        expect(result.current.data).toEqual(bucketsBeforeTurnover)
        lastUpdatedAt = result.current.dataUpdatedAt

        // Dado real da hora nova finalmente disponível — some o retido, usa
        // o de verdade.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 1, 56))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: maskedIso(20, 0), avgPowerW: 2000 }],
            granularity: "minute",
        })
        await result.current.refetch()
        await waitFor(() => expect(result.current.dataUpdatedAt).not.toBe(lastUpdatedAt))
        expect(result.current.data).toEqual([{ bucketStart: trueEpoch(20, 0), kw: 2 }])
    })

    it("troca de alvo não herda os baldes retidos do alvo anterior", async () => {
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(19, 30, 10))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: maskedIso(19, 0), avgPowerW: 1000 }],
            granularity: "minute",
        })

        const { result, rerender } = renderHook(
            ({ targetId }: { targetId: string }) =>
                useMeterReadingHistory("PROPERTY", targetId, "meter-1"),
            { wrapper: createWrapper(), initialProps: { targetId: "prop-1" } },
        )

        await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))

        // Troca de alvo bem no instante em que a hora vira — sem resetar o
        // que é retido por alvo, o alvo novo herdaria os baldes do anterior.
        vi.spyOn(Date, "now").mockReturnValue(trueEpoch(20, 0, 5))
        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [],
            granularity: "minute",
        })
        rerender({ targetId: "prop-2" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual([])
    })
})
