import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/services/api", () => ({
    ensureFreshSession: vi.fn(),
}))

import { ensureFreshSession } from "@/services/api"
import { scheduleProactiveRefresh, cancelProactiveRefresh } from "@/lib/sessionRefresh"

const mockRefresh = vi.mocked(ensureFreshSession)

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    cancelProactiveRefresh()
})

afterEach(() => {
    vi.useRealTimers()
    cancelProactiveRefresh()
})

// SESSION_DURATION_MS = 1h → PROACTIVE = 80% = 2_880_000 ms (48 min)
const PROACTIVE_MS = 60 * 60 * 1000 * 0.8

describe("scheduleProactiveRefresh / cancelProactiveRefresh", () => {
    it("dispara refresh em ~80% do tempo de sessão (48 min de 1h)", async () => {
        mockRefresh.mockResolvedValue(undefined)

        scheduleProactiveRefresh()

        // Antes de 48 min, nada deve ter acontecido.
        await vi.advanceTimersByTimeAsync(PROACTIVE_MS - 1)
        expect(mockRefresh).not.toHaveBeenCalled()

        // Exatamente em 48 min, o refresh deve disparar.
        await vi.advanceTimersByTimeAsync(1)
        expect(mockRefresh).toHaveBeenCalledTimes(1)

        // Cancela o re-agendamento para não vazar para outros testes.
        cancelProactiveRefresh()
    })

    it("reagenda automaticamente após refresh bem-sucedido", async () => {
        mockRefresh.mockResolvedValue(undefined)

        scheduleProactiveRefresh()
        // Avança até o primeiro disparo.
        await vi.advanceTimersByTimeAsync(PROACTIVE_MS)
        expect(mockRefresh).toHaveBeenCalledTimes(1)

        // Avança mais um ciclo — deve ter sido re-agendado.
        await vi.advanceTimersByTimeAsync(PROACTIVE_MS)
        expect(mockRefresh).toHaveBeenCalledTimes(2)

        cancelProactiveRefresh()
    })

    it("cancelProactiveRefresh impede o disparo do timer pendente", async () => {
        mockRefresh.mockResolvedValue(undefined)

        scheduleProactiveRefresh()
        cancelProactiveRefresh()

        await vi.advanceTimersByTimeAsync(PROACTIVE_MS + 1000)

        expect(mockRefresh).not.toHaveBeenCalled()
    })

    it("scheduleProactiveRefresh cancela timer anterior antes de criar novo", async () => {
        mockRefresh.mockResolvedValue(undefined)

        scheduleProactiveRefresh()
        scheduleProactiveRefresh() // substitui o primeiro

        await vi.advanceTimersByTimeAsync(PROACTIVE_MS)

        // Só um refresh deve acontecer (o segundo timer).
        expect(mockRefresh).toHaveBeenCalledTimes(1)

        cancelProactiveRefresh()
    })
})
