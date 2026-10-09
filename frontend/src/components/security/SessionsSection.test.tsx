import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { SessionsSection } from "@/components/security/SessionsSection"
import { sessionService } from "@/services/session.service"
import type { Session } from "@/types/session.types"

vi.mock("@/services/session.service", () => ({
    sessionService: { list: vi.fn() },
}))

// 16/10/2026, 15:30 em São Paulo.
const NOW = new Date("2026-10-16T18:30:00.000Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const HOUR = 3_600_000

const current: Session = {
    id: "s-current",
    channel: "WEB",
    deviceLabel: "Chrome · Windows",
    origin: "189.45.xx.xx",
    lastAccessAt: ago(0),
    isCurrent: true,
}
const phone: Session = {
    id: "s-phone",
    channel: "MOBILE",
    deviceLabel: "Safari · iOS",
    origin: "189.45.xx.xx",
    lastAccessAt: ago(2 * HOUR),
    isCurrent: false,
}
const legacy: Session = {
    id: "s-legacy",
    channel: "WEB",
    deviceLabel: null,
    origin: null,
    lastAccessAt: ago(26 * HOUR),
    isCurrent: false,
}

const renderSection = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    return render(
        <QueryClientProvider client={client}>
            <SessionsSection />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"], now: NOW })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("SessionsSection", () => {
    it("mostra o esqueleto enquanto carrega", () => {
        vi.mocked(sessionService.list).mockReturnValue(new Promise(() => undefined))

        renderSection()

        expect(screen.getByTestId("sessions-skeleton")).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Sessões ativas" })).toBeInTheDocument()
    })

    it("lista cada sessão com dispositivo, origem e último acesso", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current, phone])

        renderSection()

        const list = await screen.findByRole("list", { name: "Sessões ativas da conta" })
        const [first, second] = within(list).getAllByRole("listitem")
        expect(within(first!).getByText("Chrome · Windows")).toBeInTheDocument()
        expect(within(first!).getByText("189.45.xx.xx")).toBeInTheDocument()
        expect(within(first!).getByText("agora")).toBeInTheDocument()
        expect(within(second!).getByText("Safari · iOS")).toBeInTheDocument()
        expect(within(second!).getByText("há 2 h")).toBeInTheDocument()
    })

    it("marca como 'Esta sessão' só a sessão atual", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current, phone])

        renderSection()

        const items = await screen.findAllByRole("listitem")
        expect(within(items[0]!).getByText("Esta sessão")).toBeInTheDocument()
        expect(within(items[1]!).queryByText("Esta sessão")).not.toBeInTheDocument()
        expect(screen.getAllByText("Esta sessão")).toHaveLength(1)
    })

    it("sessão antiga, sem origem registrada, não inventa dado", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current, legacy])

        renderSection()

        const items = await screen.findAllByRole("listitem")
        expect(within(items[1]!).getByText("Origem não registrada")).toBeInTheDocument()
        expect(within(items[1]!).getByText("Navegador")).toBeInTheDocument()
        expect(within(items[1]!).getByText("ontem")).toBeInTheDocument()
    })

    it("sessão mobile sem dispositivo registrado cai no rótulo do canal", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([
            current,
            { ...phone, deviceLabel: null, origin: null },
        ])

        renderSection()

        const items = await screen.findAllByRole("listitem")
        expect(within(items[1]!).getByText("App móvel")).toBeInTheDocument()
    })

    it("só a sessão atual: avisa que não há outra sessão ativa", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current])

        renderSection()

        expect(await screen.findByRole("status")).toHaveTextContent("Nenhuma outra sessão ativa.")
        expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    it("com outras sessões, não mostra o aviso de sessão única", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current, phone])

        renderSection()

        await screen.findAllByRole("listitem")
        expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("lista vazia mostra um aviso, sem lista", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([])

        renderSection()

        expect(await screen.findByRole("status")).toHaveTextContent(
            "Nenhuma sessão ativa encontrada.",
        )
        expect(screen.queryByRole("list")).not.toBeInTheDocument()
    })

    it("erro mostra o alerta e a nova tentativa recarrega a lista", async () => {
        const user = userEvent.setup({ advanceTimers: () => undefined })
        vi.mocked(sessionService.list).mockRejectedValueOnce(new Error("falha"))
        vi.mocked(sessionService.list).mockResolvedValueOnce([current])

        renderSection()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar as sessões.",
        )
        await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

        expect(await screen.findByRole("list")).toBeInTheDocument()
        expect(sessionService.list).toHaveBeenCalledTimes(2)
    })

    it("não tem botão de encerrar nesta etapa", async () => {
        vi.mocked(sessionService.list).mockResolvedValue([current, phone])

        renderSection()

        await screen.findAllByRole("listitem")
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })
})
