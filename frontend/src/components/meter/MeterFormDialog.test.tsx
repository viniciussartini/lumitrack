import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MeterFormDialog } from "@/components/meter/MeterFormDialog"
import { meterService } from "@/services/meter.service"
import type { Meter } from "@/types/meter.types"

vi.mock("@/services/meter.service", () => ({
    meterService: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockMqttMeter: Meter = {
    id: "meter-1",
    name: "Medidor Geral",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    protocol: "MQTT",
    host: "localhost",
    port: 1883,
    topic: "lumitrack/sim/dev1",
    address: null,
    extra: { username: "sim-user", passwordSet: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderDialog = (props: Partial<React.ComponentProps<typeof MeterFormDialog>> = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const onClose = vi.fn()

    render(
        <QueryClientProvider client={queryClient}>
            <MeterFormDialog
                isOpen
                onClose={onClose}
                mode={{ kind: "create", targetType: "PROPERTY", targetId: "prop-1" }}
                {...props}
            />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("MeterFormDialog — credencial MQTT", () => {
    it("envia extra.username/extra.password ao criar um medidor MQTT com credencial", async () => {
        const user = userEvent.setup()
        vi.mocked(meterService.create).mockResolvedValue(mockMqttMeter)

        renderDialog()

        await user.type(screen.getByLabelText(/nome do medidor/i), "Medidor Novo")
        await user.type(screen.getByLabelText(/host/i), "localhost")
        await user.type(screen.getByLabelText(/porta/i), "1883")
        await user.type(screen.getByLabelText(/tópico mqtt/i), "lumitrack/teste")
        await user.type(screen.getByLabelText(/usuário mqtt/i), "meu-usuario")
        await user.type(screen.getByLabelText(/senha mqtt/i), "minha-senha")
        await user.click(screen.getByRole("button", { name: /vincular medidor/i }))

        expect(meterService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                extra: { username: "meu-usuario", password: "minha-senha" },
            }),
        )
    })

    it("campos de credencial MQTT não usam autocomplete do navegador", () => {
        renderDialog()

        // Sem isso, o gerenciador de senha do navegador pode oferecer
        // autopreencher com a credencial da própria conta LumiTrack do
        // usuário — que iria cifrada como credencial de um broker MQTT de
        // terceiros (equipamento de terceiros, não login do usuário).
        expect(screen.getByLabelText(/usuário mqtt/i)).toHaveAttribute("autocomplete", "off")
        expect(screen.getByLabelText(/senha mqtt/i)).toHaveAttribute("autocomplete", "new-password")
    })

    it("não envia extra quando o medidor MQTT é criado sem credencial (broker sem auth)", async () => {
        const user = userEvent.setup()
        vi.mocked(meterService.create).mockResolvedValue(mockMqttMeter)

        renderDialog()

        await user.type(screen.getByLabelText(/nome do medidor/i), "Medidor Novo")
        await user.type(screen.getByLabelText(/host/i), "localhost")
        await user.type(screen.getByLabelText(/porta/i), "1883")
        await user.type(screen.getByLabelText(/tópico mqtt/i), "lumitrack/teste")
        await user.click(screen.getByRole("button", { name: /vincular medidor/i }))

        expect(meterService.create).toHaveBeenCalledWith(
            expect.not.objectContaining({ extra: expect.anything() }),
        )
    })

    it("edição sem tocar o campo de senha não reenvia password nem o campo derivado passwordSet", async () => {
        const user = userEvent.setup()
        vi.mocked(meterService.update).mockResolvedValue(mockMqttMeter)

        renderDialog({ mode: { kind: "edit", meter: mockMqttMeter } })

        // Usuário pré-preenchido (não é sensível); senha nasce vazia — só
        // trocamos o nome, sem tocar em nenhum campo de credencial. Este
        // teste cobre só a FORMA do payload que o frontend monta — quem a
        // senha existente de fato sobrevive à atualização é coberto no
        // backend (meter.repository.test.ts, MeterRepository.update), onde
        // dá pra observar o dado persistido; um mock de meterService não
        // prova preservação nenhuma.
        expect(screen.getByLabelText(/usuário mqtt/i)).toHaveValue("sim-user")
        expect(screen.getByLabelText(/senha mqtt/i)).toHaveValue("")

        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        const [, input] = vi.mocked(meterService.update).mock.calls[0]!
        // passwordSet só existe na resposta da API (campo derivado) — não
        // pode voltar no payload de update, senão o cliente reenviaria um
        // dado que não é seu para escrever.
        expect(input.extra).toEqual({ username: "sim-user" })
    })

    it("edição trocando a senha envia o novo valor, preservando o usuário existente", async () => {
        const user = userEvent.setup()
        vi.mocked(meterService.update).mockResolvedValue(mockMqttMeter)

        renderDialog({ mode: { kind: "edit", meter: mockMqttMeter } })

        await user.type(screen.getByLabelText(/senha mqtt/i), "senha-nova")
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        expect(meterService.update).toHaveBeenCalledWith(
            "meter-1",
            expect.objectContaining({
                extra: expect.objectContaining({ username: "sim-user", password: "senha-nova" }),
            }),
        )
    })
})
