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
        demandByPost: [
            {
                post: null,
                contractedDemandKw: 200,
                measuredDemandKw: 190,
                demandBrl: 3600,
                ultrapassagemBrl: 0,
            },
        ],
        demandBrl: 3600,
        ultrapassagemBrl: 0,
        energyByPost: [
            { post: "PEAK", kwhConsumed: 800, brl: 1040 },
            { post: "OFF_PEAK", kwhConsumed: 28_000, brl: 11_200 },
        ],
        ereByWindow: [],
        ereBrl: 0,
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

    it("não mostra as linhas de ultrapassagem e ERE quando os valores são zero", () => {
        render(<GroupABillCard bucket={mockBucket} />)

        expect(screen.queryByText(/ultrapassagem de demanda/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/energia reativa excedente/i)).not.toBeInTheDocument()
    })

    it("mostra a linha de ultrapassagem de demanda quando houver valor a cobrar", () => {
        const bucketWithUltrapassagem: ConsumptionBucket = {
            ...mockBucket,
            groupA: { ...mockBucket.groupA!, ultrapassagemBrl: 187.5 },
        }

        render(<GroupABillCard bucket={bucketWithUltrapassagem} />)

        expect(screen.getByText(/ultrapassagem de demanda/i)).toBeInTheDocument()
        expect(screen.getByText(/R\$\s*187,50/)).toBeInTheDocument()
    })

    it("mostra a linha de energia reativa excedente quando houver valor a cobrar", () => {
        const bucketWithEre: ConsumptionBucket = {
            ...mockBucket,
            groupA: { ...mockBucket.groupA!, ereBrl: 772.14 },
        }

        render(<GroupABillCard bucket={bucketWithEre} />)

        expect(screen.getByText(/energia reativa excedente/i)).toBeInTheDocument()
        expect(screen.getByText(/R\$\s*772,14/)).toBeInTheDocument()
    })
})
