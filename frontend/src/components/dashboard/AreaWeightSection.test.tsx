import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { AreaWeightSection } from "@/components/dashboard/AreaWeightSection"
import { consumptionService } from "@/services/consumption.service"
import { propertyService } from "@/services/property.service"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { PropertyTree, PropertyTreeNode } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))
vi.mock("@/services/consumption.service", () => ({
    consumptionService: { summary: vi.fn() },
}))

const NOW = new Date(2026, 9, 16, 12)

const tree = (property: PropertyTreeNode): PropertyTree => ({ items: [property], total: 1 })

const casa: PropertyTreeNode = {
    id: "prop-1",
    name: "Casa",
    tariffGroup: "GROUP_B",
    areas: [
        {
            id: "area-1",
            name: "Cozinha",
            devices: [{ id: "dev-1", name: "Forno", powerWatts: 1800 }],
        },
        { id: "area-2", name: "Sala", devices: [] },
        { id: "area-3", name: "Garagem", devices: [] },
        { id: "area-4", name: "Quintal", devices: [] },
    ],
}

const item = (id: string, kwhConsumed: number): ConsumptionSummaryItem => ({
    id,
    targetType: "AREA",
    bucketStart: "2026-10-01T00:00:00.000Z",
    kwhConsumed,
    avgPowerW: 0,
})

/** Quintal fica sem item: sem medidor ou sem leitura no mês. */
const MONTH = [item("area-1", 50), item("area-2", 30), item("area-3", 20)]

const mockSummary = (items: ConsumptionSummaryItem[]) =>
    vi.mocked(consumptionService.summary).mockImplementation(async ({ ids, targetType }) => ({
        items: items.filter((entry) => targetType === "AREA" && ids.includes(entry.id)),
    }))

const renderSection = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <AreaWeightSection propertyId="prop-1" propertyName="Casa" />
        </QueryClientProvider>,
    )
}

const trigger = () => screen.findByTestId("area-weight-menu-trigger")
const legendOf = (name: string) => screen.getByText(name, { selector: "li span" })

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.mocked(propertyService.getTree).mockResolvedValue(tree(casa))
    mockSummary(MONTH)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("AreaWeightSection — pizza", () => {
    it("mostra só as áreas com medidor, com o percentual de cada uma na legenda", async () => {
        renderSection()

        await trigger()

        expect(legendOf("Cozinha").parentElement).toHaveTextContent("50%")
        expect(legendOf("Sala").parentElement).toHaveTextContent("30%")
        expect(legendOf("Garagem").parentElement).toHaveTextContent("20%")
        expect(screen.queryByText("Quintal")).not.toBeInTheDocument()
    })

    it("mostra o total do mês no centro", async () => {
        renderSection()
        await trigger()

        const graphic = screen.getByTestId("area-weight-chart-graphic")
        expect(graphic).toHaveTextContent("100")
        expect(graphic).toHaveTextContent("kWh/mês")
    })

    it("pede só as áreas, em granularidade mês e na janela do mês corrente", async () => {
        renderSection()
        await trigger()

        const calls = vi.mocked(consumptionService.summary).mock.calls.map(([params]) => params)
        expect(calls).toHaveLength(1)
        expect(calls[0]).toMatchObject({
            targetType: "AREA",
            ids: ["area-1", "area-2", "area-3", "area-4"],
            granularity: "month",
            from: new Date(2026, 9, 1),
            to: new Date(2026, 10, 1),
        })
    })

    it("as cores vêm dos tokens da paleta, na ordem das áreas", async () => {
        renderSection()
        await trigger()

        const swatch = (id: string) => screen.getByTestId(`area-weight-swatch-${id}`)
        expect(swatch("area-1").style.backgroundColor).toBe("var(--color-chart-cat-1)")
        expect(swatch("area-2").style.backgroundColor).toBe("var(--color-chart-cat-2)")
        expect(swatch("area-3").style.backgroundColor).toBe("var(--color-chart-cat-3)")
    })

    it("a tabela sr-only traz nome, kWh e %, e o desenho e a legenda ficam fora da leitura", async () => {
        renderSection()
        await trigger()

        const table = screen.getByRole("table")
        expect(table).toHaveClass("sr-only")
        const rows = within(table).getAllByRole("row")
        expect(rows).toHaveLength(4)
        expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("Cozinha")
        expect(
            within(rows[1]!)
                .getAllByRole("cell")
                .map((cell) => cell.textContent),
        ).toEqual(["50,00 kWh", "50%"])
        expect(
            screen.getByTestId("area-weight-chart-graphic").closest("[aria-hidden]"),
        ).toHaveAttribute("aria-hidden", "true")
    })
})

describe("AreaWeightSection — seleção", () => {
    it("o menu diz quantas áreas estão selecionadas, de quantas têm medidor", async () => {
        renderSection()

        expect(await trigger()).toHaveTextContent("3 de 3 medidores")
    })

    it("desmarcar uma área refaz o percentual das outras e mantém a cor delas", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await trigger())

        await user.click(screen.getByRole("checkbox", { name: "Cozinha" }))

        expect(await trigger()).toHaveTextContent("2 de 3 medidores")
        expect(screen.queryByText("Cozinha", { selector: "li span" })).not.toBeInTheDocument()
        expect(legendOf("Sala").parentElement).toHaveTextContent("60%")
        expect(legendOf("Garagem").parentElement).toHaveTextContent("40%")
        expect(screen.getByTestId("area-weight-swatch-area-2").style.backgroundColor).toBe(
            "var(--color-chart-cat-2)",
        )
    })

    it("Limpar seleção deixa o aviso, e Selecionar todos devolve a pizza", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await trigger())

        await user.click(screen.getByRole("button", { name: "Limpar seleção" }))

        expect(screen.getByText("Selecione ao menos um medidor.")).toBeInTheDocument()
        expect(await trigger()).toHaveTextContent("0 de 3 medidores")
        expect(screen.queryByTestId("area-weight-chart")).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Selecionar todos" }))

        expect(screen.getByTestId("area-weight-chart")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Limpar seleção" })).toBeInTheDocument()
    })

    it("a lista do menu só tem as áreas com medidor", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await trigger())

        const boxes = within(screen.getByRole("group", { name: "Medidores" })).getAllByRole(
            "checkbox",
        )
        expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual([
            "Cozinha",
            "Sala",
            "Garagem",
        ])
    })

    it("Esc fecha o menu e devolve o foco ao botão", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await trigger())
        expect(screen.getByRole("group", { name: "Medidores" })).toBeInTheDocument()

        await user.keyboard("{Escape}")

        expect(screen.queryByRole("group", { name: "Medidores" })).not.toBeInTheDocument()
        expect(await trigger()).toHaveFocus()
    })

    it("clicar fora fecha o menu", async () => {
        renderSection()
        const user = userEvent.setup()
        await user.click(await trigger())

        await user.click(document.body)

        expect(screen.queryByRole("group", { name: "Medidores" })).not.toBeInTheDocument()
    })

    it("o botão avisa se o menu está aberto", async () => {
        renderSection()
        const user = userEvent.setup()

        expect(await trigger()).toHaveAttribute("aria-expanded", "false")
        await user.click(await trigger())
        expect(await trigger()).toHaveAttribute("aria-expanded", "true")
    })
})

describe("AreaWeightSection — ausência e estados", () => {
    it("sem área com medidor mostra o vazio dedicado e nenhum menu", async () => {
        mockSummary([])
        renderSection()

        expect(
            await screen.findByText(/nenhuma área com medidor e consumo neste mês/i),
        ).toBeInTheDocument()
        expect(screen.queryByTestId("area-weight-menu-trigger")).not.toBeInTheDocument()
    })

    it("propriedade sem áreas não faz pedido e mostra o vazio", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue(tree({ ...casa, areas: [] }))
        renderSection()

        expect(await screen.findByText(/nenhuma área com medidor/i)).toBeInTheDocument()
        expect(consumptionService.summary).not.toHaveBeenCalled()
    })

    it("áreas selecionadas sem consumo avisam em vez de dividir por zero", async () => {
        mockSummary([item("area-1", 0)])
        renderSection()

        expect(await screen.findByText(/sem consumo nas áreas selecionadas/i)).toBeInTheDocument()
        expect(screen.queryByTestId("area-weight-chart")).not.toBeInTheDocument()
    })

    it("mostra o skeleton enquanto a hierarquia ou o resumo carregam", async () => {
        vi.mocked(consumptionService.summary).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(await screen.findByLabelText("Carregando peso de cada medidor")).toBeInTheDocument()
    })

    it("erro no resumo mostra o alerta e tenta de novo", async () => {
        vi.mocked(consumptionService.summary).mockRejectedValue(new Error("falha"))
        renderSection()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("Não foi possível carregar o consumo do mês.")

        mockSummary(MONTH)
        await userEvent.setup().click(within(alert).getByRole("button", { name: /tentar/i }))

        expect(await trigger()).toBeInTheDocument()
    })

    it("erro na hierarquia mostra o alerta e não consulta o resumo", async () => {
        vi.mocked(propertyService.getTree).mockRejectedValue(new Error("falha"))
        renderSection()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar a hierarquia.",
        )
        expect(consumptionService.summary).not.toHaveBeenCalled()
    })

    it("o cabeçalho mantém o rótulo do design e diz 'áreas' no texto de apoio", async () => {
        renderSection()
        await trigger()

        expect(screen.getByText("Peso de cada medidor")).toBeInTheDocument()
        expect(screen.getByText(/participação das áreas no consumo do mês/)).toBeInTheDocument()
    })
})
