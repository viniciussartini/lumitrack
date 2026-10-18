import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { TodayConsumptionSection } from "@/components/dashboard/TodayConsumptionSection"
import { consumptionService } from "@/services/consumption.service"
import { propertyService } from "@/services/property.service"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"
import type { PropertyTree, PropertyTreeNode } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))
vi.mock("@/services/consumption.service", () => ({
    consumptionService: { summary: vi.fn() },
}))

const NOW = new Date(2026, 9, 5, 12)

const tree = (property: PropertyTreeNode): PropertyTree => ({ items: [property], total: 1 })

const casa: PropertyTreeNode = {
    id: "prop-1",
    name: "Casa",
    tariffGroup: "GROUP_B",
    areas: [
        {
            id: "area-1",
            name: "Cozinha",
            devices: [
                { id: "dev-1", name: "Geladeira", powerWatts: 150 },
                { id: "dev-2", name: "Forno", powerWatts: 1800 },
            ],
        },
        { id: "area-2", name: "Sala", devices: [] },
    ],
}

const item = (id: string, targetType: TargetType, kwh: number, cost?: number) =>
    ({
        id,
        targetType,
        bucketStart: "2026-10-05T00:00:00.000Z",
        kwhConsumed: kwh,
        avgPowerW: 0,
        ...(cost !== undefined && { costBrl: cost }),
    }) satisfies ConsumptionSummaryItem

/** Respostas por id — quem não está no mapa não tem medidor ou leitura hoje. */
const mockSummary = (items: ConsumptionSummaryItem[]) =>
    vi.mocked(consumptionService.summary).mockImplementation(async ({ ids, targetType }) => ({
        items: items.filter((entry) => entry.targetType === targetType && ids.includes(entry.id)),
    }))

const FULL_DAY = [
    item("prop-1", "PROPERTY", 12.5, 9.9),
    item("area-1", "AREA", 7, 5.5),
    item("area-2", "AREA", 1.25, 1),
    item("dev-1", "DEVICE", 3.5, 2.8),
    item("dev-2", "DEVICE", 3, 2.4),
]

const renderSection = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <TodayConsumptionSection propertyId="prop-1" propertyName="Casa" />
        </QueryClientProvider>,
    )
}

const row = (name: string) => screen.getByRole("treeitem", { name: new RegExp(`^${name}:`) })

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.mocked(propertyService.getTree).mockResolvedValue(tree(casa))
    mockSummary(FULL_DAY)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("TodayConsumptionSection — hierarquia", () => {
    it("nasce recolhida: só a propriedade, com o kWh e o R$ do dia", async () => {
        renderSection()

        await screen.findByRole("treeitem", { name: /^Casa:/ })

        expect(screen.getAllByRole("treeitem")).toHaveLength(1)
        expect(within(row("Casa")).getByText("12,50 kWh")).toBeInTheDocument()
        expect(within(row("Casa")).getByText(/R\$\s?9,90/)).toBeInTheDocument()
        expect(row("Casa")).toHaveAttribute("aria-expanded", "false")
    })

    it("expande por nível e recolhe de novo", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))

        expect(row("Casa")).toHaveAttribute("aria-expanded", "true")
        expect(screen.getAllByRole("treeitem")).toHaveLength(3)
        expect(row("Cozinha")).toHaveAttribute("aria-level", "2")

        await user.click(row("Cozinha"))
        expect(screen.getAllByRole("treeitem")).toHaveLength(5)
        expect(row("Geladeira")).toHaveAttribute("aria-level", "3")

        await user.click(row("Casa"))
        expect(screen.getAllByRole("treeitem")).toHaveLength(1)
    })

    it("o total de um nó é o do medidor dele, não a soma dos filhos", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))
        await user.click(row("Cozinha"))

        // áreas somam 8,25 e dispositivos da cozinha, 6,5: nenhum bate com o pai
        expect(within(row("Cozinha")).getByText("7,00 kWh")).toBeInTheDocument()
        expect(within(row("Casa")).getByText("12,50 kWh")).toBeInTheDocument()
    })

    it("área sem dispositivo e dispositivo são folhas, sem aria-expanded", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))
        await user.click(row("Cozinha"))

        expect(row("Sala")).not.toHaveAttribute("aria-expanded")
        expect(row("Geladeira")).not.toHaveAttribute("aria-expanded")
    })
})

describe("TodayConsumptionSection — ausência", () => {
    it("nó sem medidor ou leitura hoje mostra '-' nos dois valores, sem esconder o nó", async () => {
        mockSummary([item("prop-1", "PROPERTY", 12.5, 9.9), item("area-1", "AREA", 7, 5.5)])
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))

        const sala = row("Sala")
        expect(within(sala).getAllByText("-")).toHaveLength(2)
        expect(sala).toHaveAccessibleName("Sala: consumo de hoje sem dado, custo sem dado")
    })

    it("custo ausente (Grupo A, Tarifa Branca) mostra o kWh e '-' no R$", async () => {
        mockSummary([
            item("prop-1", "PROPERTY", 12.5),
            item("area-1", "AREA", 7),
            item("area-2", "AREA", 1.25),
        ])
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))

        expect(within(row("Casa")).getByText("12,50 kWh")).toBeInTheDocument()
        expect(within(row("Casa")).getByText("-")).toBeInTheDocument()
        expect(within(row("Cozinha")).getByText("-")).toBeInTheDocument()
    })

    it("o nome da linha traz os valores, para o leitor de tela", async () => {
        renderSection()

        const casaRow = await screen.findByRole("treeitem", { name: /^Casa:/ })

        expect(casaRow.getAttribute("aria-label")).toMatch(
            /^Casa: consumo de hoje 12,50 kWh, custo R\$\s?9,90$/,
        )
    })

    it("nenhum medidor com leitura hoje avisa, mas a estrutura segue visível", async () => {
        mockSummary([])
        renderSection()

        expect(await screen.findByText(/nenhum medidor com leitura hoje/i)).toBeInTheDocument()
        expect(row("Casa")).toBeInTheDocument()
    })
})

describe("TodayConsumptionSection — pedidos ao resumo", () => {
    it("faz um pedido por tipo de alvo, com granularidade dia e a janela de hoje", async () => {
        renderSection()
        await screen.findByRole("treeitem", { name: /^Casa:/ })

        const calls = vi.mocked(consumptionService.summary).mock.calls.map(([params]) => params)
        expect(calls).toHaveLength(3)
        expect(calls.map((call) => call.targetType).sort()).toEqual(["AREA", "DEVICE", "PROPERTY"])
        for (const call of calls) {
            expect(call.granularity).toBe("day")
            expect(call.from).toEqual(new Date(2026, 9, 5))
            expect(call.to).toEqual(new Date(2026, 9, 6))
        }
        expect(calls.find((call) => call.targetType === "AREA")?.ids).toEqual(["area-1", "area-2"])
        expect(calls.find((call) => call.targetType === "DEVICE")?.ids).toEqual(["dev-1", "dev-2"])
    })

    it("não pede mais ao expandir a hierarquia", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await screen.findByRole("treeitem", { name: /^Casa:/ }))
        await user.click(row("Cozinha"))

        expect(consumptionService.summary).toHaveBeenCalledTimes(3)
    })

    it("passando de 50 dispositivos, abre um pedido a mais por lote de 50", async () => {
        const devices = Array.from({ length: 120 }, (_, i) => ({
            id: `dev-${i}`,
            name: `Dispositivo ${i}`,
            powerWatts: 10,
        }))
        vi.mocked(propertyService.getTree).mockResolvedValue(
            tree({ ...casa, areas: [{ id: "area-1", name: "Galpão", devices }] }),
        )
        renderSection()
        await screen.findByRole("treeitem", { name: /^Casa:/ })

        const deviceCalls = vi
            .mocked(consumptionService.summary)
            .mock.calls.map(([params]) => params)
            .filter((params) => params.targetType === "DEVICE")
        expect(deviceCalls.map((call) => call.ids.length)).toEqual([50, 50, 20])
    })

    it("propriedade sem áreas só pede a propriedade", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue(tree({ ...casa, areas: [] }))
        renderSection()
        await screen.findByRole("treeitem", { name: /^Casa:/ })

        expect(consumptionService.summary).toHaveBeenCalledTimes(1)
        expect(row("Casa")).not.toHaveAttribute("aria-expanded")
    })
})

describe("TodayConsumptionSection — teclado", () => {
    const focusCasa = async () => {
        renderSection()
        const user = userEvent.setup()
        const casaRow = await screen.findByRole("treeitem", { name: /^Casa:/ })
        casaRow.focus()
        return user
    }

    it("só a linha com foco entra na ordem de tabulação", async () => {
        const user = await focusCasa()
        await user.keyboard("{ArrowRight}")

        expect(row("Casa")).toHaveAttribute("tabindex", "0")
        expect(row("Cozinha")).toHaveAttribute("tabindex", "-1")
    })

    it("→ expande, ↓ desce, Enter expande a área e ← recolhe e sobe", async () => {
        const user = await focusCasa()

        await user.keyboard("{ArrowRight}")
        expect(row("Casa")).toHaveAttribute("aria-expanded", "true")

        await user.keyboard("{ArrowDown}")
        expect(row("Cozinha")).toHaveFocus()

        await user.keyboard("{Enter}")
        expect(row("Cozinha")).toHaveAttribute("aria-expanded", "true")

        await user.keyboard("{ArrowDown}")
        expect(row("Geladeira")).toHaveFocus()

        await user.keyboard("{ArrowLeft}")
        expect(row("Cozinha")).toHaveFocus()

        await user.keyboard("{ArrowLeft}")
        expect(row("Cozinha")).toHaveAttribute("aria-expanded", "false")

        await user.keyboard("{ArrowLeft}")
        expect(row("Casa")).toHaveFocus()
    })

    it("Espaço alterna, Home e End vão às pontas", async () => {
        const user = await focusCasa()

        await user.keyboard(" ")
        expect(row("Casa")).toHaveAttribute("aria-expanded", "true")

        await user.keyboard("{End}")
        expect(row("Sala")).toHaveFocus()

        await user.keyboard("{Home}")
        expect(row("Casa")).toHaveFocus()

        await user.keyboard(" ")
        expect(row("Casa")).toHaveAttribute("aria-expanded", "false")
    })

    it("o grupo recolhido sai do foco e da leitura", async () => {
        await focusCasa()

        const group = row("Casa").nextElementSibling
        expect(group).toHaveAttribute("role", "group")
        expect(group).toHaveAttribute("aria-hidden", "true")
        expect(group).toHaveAttribute("inert")
    })
})

describe("TodayConsumptionSection — estados", () => {
    it("mostra o skeleton enquanto a hierarquia carrega", () => {
        vi.mocked(propertyService.getTree).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(screen.getByLabelText("Carregando consumo de hoje")).toBeInTheDocument()
    })

    it("mostra o skeleton enquanto o resumo carrega", async () => {
        vi.mocked(consumptionService.summary).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(await screen.findByLabelText("Carregando consumo de hoje")).toBeInTheDocument()
        expect(screen.queryByRole("tree")).not.toBeInTheDocument()
    })

    it("erro no resumo mostra o alerta e tenta de novo", async () => {
        vi.mocked(consumptionService.summary).mockRejectedValue(new Error("falha"))
        renderSection()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("Não foi possível carregar o consumo de hoje.")

        mockSummary(FULL_DAY)
        await userEvent.setup().click(within(alert).getByRole("button", { name: /tentar/i }))

        expect(await screen.findByRole("treeitem", { name: /^Casa:/ })).toBeInTheDocument()
    })

    it("erro na hierarquia mostra o alerta e não consulta o resumo", async () => {
        vi.mocked(propertyService.getTree).mockRejectedValue(new Error("falha"))
        renderSection()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar a hierarquia.",
        )
        expect(consumptionService.summary).not.toHaveBeenCalled()
    })

    it("propriedade fora da hierarquia carregada avisa", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ items: [], total: 1 })
        renderSection()

        expect(await screen.findByText(/não está na hierarquia carregada/i)).toBeInTheDocument()
    })
})
