import { cloneElement, type ReactElement } from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { GoalProgressChart } from "@/components/goal/GoalProgressChart"
import type { GoalProgressMonth } from "@/types/goal.types"

// O jsdom não mede o contêiner e o ResponsiveContainer não desenha nada; com um
// tamanho fixo o svg real do gráfico aparece e dá para checar o foco dele.
vi.mock("recharts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("recharts")>()
    return {
        ...actual,
        ResponsiveContainer: ({
            children,
        }: {
            children: ReactElement<{ width?: number; height?: number }>
        }) => cloneElement(children, { width: 600, height: 256 }),
    }
})

const months = (realized: (number | null)[]): GoalProgressMonth[] =>
    Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 400,
        realized: realized[i] ?? null,
    }))

describe("GoalProgressChart", () => {
    it("renderiza sem quebrar com meses sem leitura (vazio, não barra em 0)", () => {
        render(<GoalProgressChart months={months([350, null, 420])} unit="KWH" />)

        expect(screen.getByTestId("goal-progress-chart")).toBeInTheDocument()
    })

    it("renderiza com todos os meses sem leitura", () => {
        render(<GoalProgressChart months={months([])} unit="KWH" />)

        expect(screen.getByTestId("goal-progress-chart")).toBeInTheDocument()
    })

    it("a mesma informação do gráfico está numa tabela, para teclado e leitor de tela", () => {
        render(<GoalProgressChart months={months([350, null, 420])} unit="KWH" />)

        const table = screen.getByRole("table", { name: /meta e realizado por mês/i })
        const rows = within(table).getAllByRole("row")
        expect(rows).toHaveLength(13)
        expect(
            within(rows[1]!)
                .getAllByRole("cell")
                .map((c) => c.textContent),
        ).toEqual(["400 kWh", "350 kWh"])
        expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("jan")
    })

    it("mês sem leitura aparece como traço na tabela, nunca como zero", () => {
        render(<GoalProgressChart months={months([350])} unit="KWH" />)

        const rows = within(screen.getByRole("table")).getAllByRole("row")

        expect(within(rows[2]!).getAllByRole("cell")[1]).toHaveTextContent("-")
    })

    it("a tabela usa a unidade da meta", () => {
        render(<GoalProgressChart months={months([190])} unit="KW" />)

        const rows = within(screen.getByRole("table")).getAllByRole("row")

        expect(
            within(rows[1]!)
                .getAllByRole("cell")
                .map((c) => c.textContent),
        ).toEqual(["400 kW", "190 kW"])
    })

    it("o desenho do gráfico fica fora da árvore de acessibilidade, para não duplicar a tabela", () => {
        render(<GoalProgressChart months={months([350])} unit="KWH" />)

        expect(screen.getByTestId("goal-progress-chart-graphic")).toHaveAttribute(
            "aria-hidden",
            "true",
        )
    })

    it("o desenho oculto não recebe foco do teclado: nenhum elemento focável dentro dele", () => {
        render(<GoalProgressChart months={months([350])} unit="KWH" />)

        const graphic = screen.getByTestId("goal-progress-chart-graphic")

        expect(graphic.querySelector("svg")).not.toBeNull()
        expect(graphic.querySelector('[tabindex="0"]')).toBeNull()
    })
})
