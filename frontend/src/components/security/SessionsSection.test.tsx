import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { SessionsSection } from "@/components/security/SessionsSection"
import { sessionService } from "@/services/session.service"
import type { Session } from "@/types/session.types"

vi.mock("@/services/session.service", () => ({
    sessionService: { list: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

    describe("encerrar sessões", () => {
        const user = () => userEvent.setup({ advanceTimers: () => undefined })

        it("cada sessão, menos a atual, tem Encerrar com o dispositivo no nome", async () => {
            vi.mocked(sessionService.list).mockResolvedValue([current, phone, legacy])

            renderSection()

            await screen.findAllByRole("listitem")
            expect(
                screen.getByRole("button", { name: "Encerrar sessão Safari · iOS" }),
            ).toBeInTheDocument()
            expect(
                screen.getByRole("button", { name: "Encerrar sessão Navegador" }),
            ).toBeInTheDocument()
            expect(
                screen.queryByRole("button", { name: "Encerrar sessão Chrome · Windows" }),
            ).not.toBeInTheDocument()
        })

        it("pede confirmação e só encerra depois de confirmar", async () => {
            const u = user()
            vi.mocked(sessionService.list).mockResolvedValue([current, phone])
            vi.mocked(sessionService.revoke).mockResolvedValue({ endedCurrent: false })
            renderSection()

            await u.click(
                await screen.findByRole("button", { name: "Encerrar sessão Safari · iOS" }),
            )

            const dialog = await screen.findByRole("dialog")
            expect(within(dialog).getByText("Encerrar sessão")).toBeInTheDocument()
            expect(dialog).toHaveTextContent("Safari · iOS perderá o acesso na hora")
            expect(sessionService.revoke).not.toHaveBeenCalled()

            await u.click(within(dialog).getByRole("button", { name: "Encerrar" }))

            await waitFor(() => expect(sessionService.revoke).toHaveBeenCalledWith("s-phone"))
            await waitFor(() => expect(sessionService.list).toHaveBeenCalledTimes(2))
            expect(toast.success).toHaveBeenCalledWith("Sessão encerrada")
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        })

        it("cancelar não encerra nada", async () => {
            const u = user()
            vi.mocked(sessionService.list).mockResolvedValue([current, phone])
            renderSection()

            await u.click(
                await screen.findByRole("button", { name: "Encerrar sessão Safari · iOS" }),
            )
            await u.click(await screen.findByRole("button", { name: "Cancelar" }))

            expect(sessionService.revoke).not.toHaveBeenCalled()
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        })

        it("'Encerrar todas as outras' só aparece quando há outra sessão", async () => {
            vi.mocked(sessionService.list).mockResolvedValue([current])

            renderSection()

            await screen.findByRole("list")
            expect(
                screen.queryByRole("button", { name: "Encerrar todas as outras" }),
            ).not.toBeInTheDocument()
        })

        it("encerra todas as outras depois de confirmar, avisando que a atual continua", async () => {
            const u = user()
            vi.mocked(sessionService.list).mockResolvedValue([current, phone, legacy])
            vi.mocked(sessionService.revokeOthers).mockResolvedValue({ revoked: 2 })
            renderSection()

            await u.click(await screen.findByRole("button", { name: "Encerrar todas as outras" }))

            const dialog = await screen.findByRole("dialog")
            expect(dialog).toHaveTextContent("Esta sessão continua ativa")
            expect(sessionService.revokeOthers).not.toHaveBeenCalled()
            await u.click(within(dialog).getByRole("button", { name: "Encerrar" }))

            await waitFor(() => expect(sessionService.revokeOthers).toHaveBeenCalledOnce())
            await waitFor(() => expect(sessionService.list).toHaveBeenCalledTimes(2))
            expect(toast.success).toHaveBeenCalledWith("Sessões encerradas")
        })

        it("falha ao encerrar mostra o erro e fecha o diálogo, sem recarregar a lista", async () => {
            const u = user()
            vi.mocked(sessionService.list).mockResolvedValue([current, phone])
            vi.mocked(sessionService.revoke).mockRejectedValue(
                new Error("Conta de demonstração é somente leitura"),
            )
            renderSection()

            await u.click(
                await screen.findByRole("button", { name: "Encerrar sessão Safari · iOS" }),
            )
            await u.click(
                within(await screen.findByRole("dialog")).getByRole("button", { name: "Encerrar" }),
            )

            await waitFor(() =>
                expect(toast.error).toHaveBeenCalledWith("Não foi possível encerrar a sessão", {
                    description: "Conta de demonstração é somente leitura",
                }),
            )
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
            expect(sessionService.list).toHaveBeenCalledTimes(1)
        })

        it("enquanto encerra, o botão de confirmar fica desabilitado", async () => {
            const u = user()
            vi.mocked(sessionService.list).mockResolvedValue([current, phone])
            vi.mocked(sessionService.revoke).mockReturnValue(new Promise(() => undefined))
            renderSection()

            await u.click(
                await screen.findByRole("button", { name: "Encerrar sessão Safari · iOS" }),
            )
            const dialog = await screen.findByRole("dialog")
            await u.click(within(dialog).getByRole("button", { name: "Encerrar" }))

            // Em andamento, o botão vira um spinner e o cancelar também trava.
            await waitFor(() => {
                const buttons = within(dialog).getAllByRole("button")
                expect(buttons.length).toBeGreaterThan(0)
                for (const button of buttons) expect(button).toBeDisabled()
            })
        })
    })
})
