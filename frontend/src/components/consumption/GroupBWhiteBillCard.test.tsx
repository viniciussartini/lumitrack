import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GroupBWhiteBillCard } from "@/components/consumption/GroupBWhiteBillCard"
import type { ConsumptionBucket } from "@/types/consumption.types"

// Exemplo 3 do documento de referência (João, casa trifásica em Belo
// Horizonte/Cemig) — mesmo oráculo usado nos testes de backend do
// TariffService/ConsumptionService (359,5567, não 359,55 — ver comentário
// lá sobre o arredondamento manual do documento).
const mockBucket: ConsumptionBucket = {
    bucketStart: "2026-08-01T03:00:00.000Z",
    kwhConsumed: 450,
    costBrl: 359.5567,
    avgPowerW: 10_000,
    groupBWhite: {
        belowAvailabilityFloor: false,
        energyByPost: [
            { post: "PEAK", kwhConsumed: 30, brl: 36 },
            { post: "INTERMEDIATE", kwhConsumed: 50, brl: 37.5 },
            { post: "OFF_PEAK", kwhConsumed: 370, brl: 166.5 },
        ],
        energyBrl: 240,
        flagBrl: 8.4825,
        taxesBrl: 101.0742,
        publicLightingFeeBrl: 18,
    },
}

describe("GroupBWhiteBillCard", () => {
    it("mostra energia, bandeira, CIP e o total", () => {
        render(<GroupBWhiteBillCard bucket={mockBucket} />)

        expect(screen.getByText(/R\$\s*240,00/)).toBeInTheDocument() // energyBrl
        expect(screen.getByText(/R\$\s*8,48/)).toBeInTheDocument() // flagBrl
        expect(screen.getByText(/R\$\s*18,00/)).toBeInTheDocument() // publicLightingFeeBrl
        expect(screen.getByText(/R\$\s*359,56/)).toBeInTheDocument() // costBrl total
    })

    it("não mostra a linha de CIP quando publicLightingFeeBrl é zero", () => {
        render(
            <GroupBWhiteBillCard
                bucket={{
                    ...mockBucket,
                    groupBWhite: { ...mockBucket.groupBWhite!, publicLightingFeeBrl: 0 },
                }}
            />,
        )

        expect(screen.queryByText(/iluminação pública/i)).not.toBeInTheDocument()
    })

    it("lista os três postos na tabela com kWh e custo", () => {
        render(<GroupBWhiteBillCard bucket={mockBucket} />)

        const table = screen.getByTestId("group-b-white-post-table")
        expect(table).toHaveTextContent("Ponta")
        expect(table).toHaveTextContent("30")
        expect(table).toHaveTextContent("Intermediário")
        expect(table).toHaveTextContent("50")
        expect(table).toHaveTextContent("Fora de ponta")
        expect(table).toHaveTextContent("370")
    })

    it("não renderiza nada quando o bucket não tem groupBWhite", () => {
        const { container } = render(
            <GroupBWhiteBillCard bucket={{ ...mockBucket, groupBWhite: undefined }} />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it("não mostra o aviso de piso de disponibilidade quando o consumo está acima dele", () => {
        render(<GroupBWhiteBillCard bucket={mockBucket} />)

        expect(screen.queryByTestId("group-b-white-floor-notice")).not.toBeInTheDocument()
    })

    describe("abaixo do piso de disponibilidade", () => {
        const belowFloorBucket: ConsumptionBucket = {
            ...mockBucket,
            kwhConsumed: 80,
            costBrl: 91.23,
            groupBWhite: {
                belowAvailabilityFloor: true,
                energyByPost: [],
                energyBrl: 60,
                flagBrl: 1.885,
                taxesBrl: 12.35,
                publicLightingFeeBrl: 18,
            },
        }

        it("mostra o aviso e não mostra a tabela/gráfico por posto", () => {
            render(<GroupBWhiteBillCard bucket={belowFloorBucket} />)

            expect(screen.getByTestId("group-b-white-floor-notice")).toBeInTheDocument()
            expect(screen.queryByTestId("group-b-white-post-table")).not.toBeInTheDocument()
        })

        it("mostra a energia calculada pela Convencional mesmo sem decomposição por posto", () => {
            render(<GroupBWhiteBillCard bucket={belowFloorBucket} />)

            expect(screen.getByText(/R\$\s*60,00/)).toBeInTheDocument()
        })
    })
})
