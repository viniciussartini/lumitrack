import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { TariffFlagListCard } from "@/components/dashboard/TariffFlagListCard"
import { tariffFlagService } from "@/services/tariff-flag.service"
import type { TariffFlagConfig } from "@/types/tariff-flag.types"

vi.mock("@/services/tariff-flag.service", () => ({
    tariffFlagService: { get: vi.fn() },
}))

const mockConfig: TariffFlagConfig = {
    currentFlag: "RED_P1",
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.88,
    redP1Per100Kwh: 4.46,
    redP2Per100Kwh: 7.87,
    updatedAt: new Date().toISOString(),
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderCard = () => {
    const queryClient = createTestQueryClient()
    return render(<TariffFlagListCard />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("TariffFlagListCard — loading/erro", () => {
    it("exibe skeleton enquanto carrega", () => {
        vi.mocked(tariffFlagService.get).mockReturnValue(new Promise(() => {}))

        renderCard()

        expect(screen.getByLabelText(/carregando bandeiras tarifárias/i)).toBeInTheDocument()
    })

    it("exibe erro com botão de tentar novamente", async () => {
        vi.mocked(tariffFlagService.get).mockRejectedValue(new Error("Falha de rede"))

        renderCard()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText(/falha de rede/i)).toBeInTheDocument()

        vi.mocked(tariffFlagService.get).mockResolvedValue(mockConfig)
        const user = userEvent.setup()
        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        expect(await screen.findByTestId("tariff-flag-row-RED_P1")).toBeInTheDocument()
    })
})

describe("TariffFlagListCard — sucesso", () => {
    it("sempre lista as 4 bandeiras, na ordem verde→amarela→vermelha P1→P2", async () => {
        vi.mocked(tariffFlagService.get).mockResolvedValue(mockConfig)

        renderCard()

        await screen.findByTestId("tariff-flag-row-GREEN")
        const rows = screen.getAllByTestId(/^tariff-flag-row-/)
        expect(rows.map((r) => r.dataset.testid)).toEqual([
            "tariff-flag-row-GREEN",
            "tariff-flag-row-YELLOW",
            "tariff-flag-row-RED_P1",
            "tariff-flag-row-RED_P2",
        ])
    })

    it("destaca a bandeira vigente com o badge 'Vigente' e data-current", async () => {
        vi.mocked(tariffFlagService.get).mockResolvedValue(mockConfig)

        renderCard()

        const currentRow = await screen.findByTestId("tariff-flag-row-RED_P1")
        expect(currentRow).toHaveAttribute("data-current", "true")
        expect(currentRow).toHaveTextContent("Vigente")

        const otherRow = screen.getByTestId("tariff-flag-row-GREEN")
        expect(otherRow).toHaveAttribute("data-current", "false")
        expect(otherRow).not.toHaveTextContent("Vigente")
    })

    it("mostra 'sem acréscimo' para a bandeira verde (valor zero) e o valor formatado pras demais", async () => {
        vi.mocked(tariffFlagService.get).mockResolvedValue(mockConfig)

        renderCard()

        const greenRow = await screen.findByTestId("tariff-flag-row-GREEN")
        expect(greenRow).toHaveTextContent("sem acréscimo")

        const yellowRow = screen.getByTestId("tariff-flag-row-YELLOW")
        expect(yellowRow).toHaveTextContent(/\+ R\$\s?1,88 \/ 100 kWh/)

        const redP2Row = screen.getByTestId("tariff-flag-row-RED_P2")
        expect(redP2Row).toHaveTextContent(/\+ R\$\s?7,87 \/ 100 kWh/)
    })
})
