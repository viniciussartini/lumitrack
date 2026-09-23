import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TargetKpiCards } from "@/components/consumption/TargetKpiCards"

describe("TargetKpiCards", () => {
    it("mostra o consumo de hoje e o custo do mês", () => {
        render(
            <TargetKpiCards
                kpis={{ isLoading: false, todayKwh: 12.5, month: { kwh: 200, costBrl: 160 } }}
            />,
        )

        expect(screen.getByText("Consumo hoje")).toBeInTheDocument()
        expect(screen.getByText("12,50")).toBeInTheDocument()
        expect(screen.getByText("kWh")).toBeInTheDocument()
        expect(screen.getByText("Custo do mês")).toBeInTheDocument()
        expect(screen.getByText(/R\$\s?160,00/)).toBeInTheDocument()
    })

    it("consumo zero de hoje é 0, não traço", () => {
        render(
            <TargetKpiCards
                kpis={{ isLoading: false, todayKwh: 0, month: { kwh: 0, costBrl: 0 } }}
            />,
        )

        expect(screen.getByText("0,00")).toBeInTheDocument()
        expect(screen.getByText(/R\$\s?0,00/)).toBeInTheDocument()
    })

    it("sem leitura ainda, os dois valores são traço, sem explicação de tarifa", () => {
        render(<TargetKpiCards kpis={{ isLoading: false, todayKwh: null, month: null }} />)

        expect(screen.getAllByText("—")).toHaveLength(2)
        expect(screen.queryByText(/indisponível/i)).not.toBeInTheDocument()
    })

    it("custo não calculável aparece como traço explicado, nunca como zero", () => {
        render(
            <TargetKpiCards
                kpis={{ isLoading: false, todayKwh: 5, month: { kwh: 90, costBrl: null } }}
            />,
        )

        expect(screen.getByText("5,00")).toBeInTheDocument()
        expect(screen.getByText("—")).toBeInTheDocument()
        expect(screen.getByText("Custo indisponível para esta tarifa.")).toBeInTheDocument()
        expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
    })

    it("enquanto carrega, mostra um placeholder e não o traço de 'sem leitura'", () => {
        render(<TargetKpiCards kpis={{ isLoading: true, todayKwh: null, month: null }} />)

        expect(screen.getAllByLabelText("Carregando")).toHaveLength(2)
        expect(screen.queryByText("—")).not.toBeInTheDocument()
    })
})
