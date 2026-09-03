import { describe, it, expect, beforeEach, vi } from "vitest"
import { useEffect } from "react"
import { act, render, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
    RealtimeProvider,
    useRealtimeConnection,
    useRealtimeReadings,
} from "@/contexts/RealtimeContext"
import { createAppStream, type AppStreamOptions } from "@/lib/sse/appStream"
import type { User } from "@/types/auth.types"

/**
 * Prova o contrato por trás de `RealtimeConnectionContext`/
 * `RealtimeReadingsContext` serem dois contextos, não um: um componente que
 * só lê `isConnected` não deve re-renderizar quando uma leitura chega — só
 * quando a conexão muda. Com um único contexto combinando os dois estados,
 * qualquer leitura de qualquer medidor recria o `value` inteiro e
 * re-renderiza todo mundo, inclusive quem só olha pra `isConnected`
 * (`Header`, na prática).
 *
 * Usa sondas mínimas em vez do `Header` real de propósito: `Header` também
 * renderiza `WarningBadge`/`NotificationDropdown`, que buscam dados via
 * TanStack Query e re-renderizam sozinhos quando essas queries resolvem —
 * ruído incidental que tornaria a contagem de commits menos direta sobre o
 * que este teste quer provar (a assinatura do contexto).
 */

const mockUser: User = {
    id: "user-123",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    mfaEnabled: false,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: () => ({ user: mockUser, isAuthenticated: true }),
}))

// Captura os handlers passados a `createAppStream` pra poder simular eventos
// SSE manualmente (`onReading`/`onOpen`), sem depender de rede real.
vi.mock("@/lib/sse/appStream", () => ({
    createAppStream: vi.fn(),
}))

const mockedCreateAppStream = vi.mocked(createAppStream)

let renderCounts: { connection: number; readings: number }

// Contador incrementado num efeito (commit já concluído), não no corpo do
// render — mutar uma variável externa durante o render é impureza que o
// React Compiler barra (`react-hooks/immutability`), mesmo em teste.
const ConnectionProbe = () => {
    useRealtimeConnection()
    useEffect(() => {
        renderCounts.connection++
    })
    return null
}

const ReadingsProbe = () => {
    useRealtimeReadings()
    useEffect(() => {
        renderCounts.readings++
    })
    return null
}

const renderApp = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <RealtimeProvider>
                    <ConnectionProbe />
                    <ReadingsProbe />
                </RealtimeProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    renderCounts = { connection: 0, readings: 0 }
    mockedCreateAppStream.mockImplementation(() => () => {})
})

describe("RealtimeContext — isolamento entre conexão e leituras", () => {
    it("consumidor de isConnected não re-renderiza quando uma leitura chega, só quando a conexão muda", async () => {
        renderApp()
        await waitFor(() => expect(mockedCreateAppStream).toHaveBeenCalled())

        const capturedOptions = mockedCreateAppStream.mock.calls[0]?.[0] as AppStreamOptions
        const rendersAfterMount = { ...renderCounts }

        act(() => {
            capturedOptions.onReading?.({
                meterId: "meter-1",
                voltage: 220,
                current: 5,
                powerW: 1000,
                powerFactor: 0.95,
                receivedAt: new Date().toISOString(),
            })
        })

        // O consumidor de leituras precisa ter re-renderizado — prova que o
        // evento simulado realmente propagou pelo contexto, e que a ausência
        // de render do outro lado não é só "nada aconteceu".
        expect(renderCounts.readings).toBeGreaterThan(rendersAfterMount.readings)
        expect(renderCounts.connection).toBe(rendersAfterMount.connection)

        act(() => {
            capturedOptions.onOpen?.()
        })

        expect(renderCounts.connection).toBeGreaterThan(rendersAfterMount.connection)
    })
})
