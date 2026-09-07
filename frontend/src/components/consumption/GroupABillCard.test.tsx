import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GroupABillCard } from "@/components/consumption/GroupABillCard"
import type { ConsumptionBucket } from "@/types/consumption.types"

// Exemplo 6 do documento de referência (metalúrgica A4 Verde) — mesmo
// oráculo usado nos testes de backend do TariffService/ConsumptionService.
const mockBucket: ConsumptionBucket = {
    bucketStart: "2026-08-01T03:00:00.000Z",
    kwhConsumed: 28_800,
    costBrl: 22_464.07,
    avgPowerW: 100_000,
    groupA: {
        contractedDemandKw: 200,
        demandBrl: 3600,
        energyByPost: [
            { post: "PEAK", kwhConsumed: 800, brl: 1040 },
            { post: "OFF_PEAK", kwhConsumed: 28_000, brl: 11_200 },
        ],
        flagBrl: 542.88,
        taxesBrl: 5831.87,
        publicLightingFeeBrl: 250,
    },
}

describe("GroupABillCard", () => {
    it("mostra a demanda contratada, a parcela de demanda, a bandeira e o total", () => {
        render(<GroupABillCard bucket={mockBucket} />)

        expect(screen.getByText("200 kW")).toBeInTheDocument()
        expect(screen.getByText(/R\$\s*3\.600,00/)).toBeInTheDocument() // demandBrl
        expect(screen.getByText(/R\$\s*542,88/)).toBeInTheDocument() // flagBrl
        expect(screen.getByText(/R\$\s*22\.464,07/)).toBeInTheDocument() // costBrl total
    })

    it("lista os dois postos na tabela com kWh e custo", () => {
        render(<GroupABillCard bucket={mockBucket} />)

        const table = screen.getByTestId("group-a-post-table")
        expect(table).toHaveTextContent("Ponta")
        expect(table).toHaveTextContent("800")
        expect(table).toHaveTextContent("Fora de ponta")
        expect(table).toHaveTextContent("28.000")
    })

    it("não renderiza nada quando o bucket não tem groupA", () => {
        const { container } = render(
            <GroupABillCard bucket={{ ...mockBucket, groupA: undefined }} />,
        )

        expect(container).toBeEmptyDOMElement()
    })
})
