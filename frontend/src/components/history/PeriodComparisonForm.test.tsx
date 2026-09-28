import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PeriodComparisonForm } from "@/components/history/PeriodComparisonForm"
import type { CompareTargetGroup } from "@/lib/periodComparison"

const GROUPS: CompareTargetGroup[] = [
    {
        label: "Propriedades",
        options: [
            { key: "PROPERTY:prop-1", targetType: "PROPERTY", targetId: "prop-1", label: "Casa" },
        ],
    },
    {
        label: "Áreas",
        options: [
            { key: "AREA:area-1", targetType: "AREA", targetId: "area-1", label: "Casa · Sala" },
        ],
    },
]

const fillPeriods = async (
    user: ReturnType<typeof userEvent.setup>,
    dates: { aStart: string; aEnd: string; bStart: string; bEnd: string },
) => {
    const groupA = screen.getByRole("group", { name: "Período A" })
    const groupB = screen.getByRole("group", { name: "Período B" })
    await user.type(within(groupA).getByLabelText("Início"), dates.aStart)
    await user.type(within(groupA).getByLabelText("Fim"), dates.aEnd)
    await user.type(within(groupB).getByLabelText("Início"), dates.bStart)
    await user.type(within(groupB).getByLabelText("Fim"), dates.bEnd)
}

describe("PeriodComparisonForm", () => {
    it("lista os alvos agrupados e as 9 grandezas elétricas", () => {
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={vi.fn()} />)

        const target = screen.getByLabelText("Alvo")
        expect(within(target).getByRole("group", { name: "Propriedades" })).toBeInTheDocument()
        expect(within(target).getByRole("group", { name: "Áreas" })).toBeInTheDocument()
        expect(within(target).getByRole("option", { name: "Casa · Sala" })).toBeInTheDocument()
        expect(
            within(screen.getByLabelText("Grandeza medida")).getAllByRole("option"),
        ).toHaveLength(9)
    })

    it("começa no primeiro alvo e na primeira grandeza", () => {
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={vi.fn()} />)

        expect(screen.getByLabelText("Alvo")).toHaveValue("PROPERTY:prop-1")
        expect(screen.getByLabelText("Grandeza medida")).toHaveValue("tensao")
    })

    it("não submete com datas vazias", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={onSubmit} />)

        await user.click(screen.getByRole("button", { name: /Criar comparação/i }))

        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("submete o run com alvo, grandeza e as quatro datas", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={onSubmit} />)

        await user.selectOptions(screen.getByLabelText("Alvo"), "AREA:area-1")
        await user.selectOptions(screen.getByLabelText("Grandeza medida"), "fp")
        await fillPeriods(user, {
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-07",
        })
        await user.click(screen.getByRole("button", { name: /Criar comparação/i }))

        expect(onSubmit).toHaveBeenCalledWith({
            target: GROUPS[1]!.options[0],
            metric: "fp",
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-07",
        })
    })

    it("mostra o texto de apoio da regra enquanto não há conflito", () => {
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={vi.fn()} />)

        expect(screen.getByText("Os dois períodos devem ter a mesma duração.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Criar comparação/i })).toBeEnabled()
    })

    it("durações diferentes: explica o motivo, desabilita o botão e não submete", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={onSubmit} />)

        await fillPeriods(user, {
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-10",
        })

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Os dois períodos devem ter a mesma duração (A: 7 dias, B: 10 dias).",
        )
        expect(screen.getByRole("button", { name: /Criar comparação/i })).toBeDisabled()
        await user.click(screen.getByRole("button", { name: /Criar comparação/i }))
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("durações diferentes ligam os campos de data à mensagem (aria-invalid e aria-describedby)", async () => {
        const user = userEvent.setup()
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={vi.fn()} />)

        const endB = within(screen.getByRole("group", { name: "Período B" })).getByLabelText("Fim")
        expect(endB).toHaveAttribute("aria-invalid", "false")

        await fillPeriods(user, {
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-10",
        })

        const message = screen.getByRole("alert")
        expect(endB).toHaveAttribute("aria-invalid", "true")
        expect(endB).toHaveAttribute("aria-describedby", message.id)
    })

    it("alvo escolhido que some da lista (árvore recarregada) volta para a primeira opção e ainda submete", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        const { rerender } = render(<PeriodComparisonForm groups={GROUPS} onSubmit={onSubmit} />)
        await user.selectOptions(screen.getByLabelText("Alvo"), "AREA:area-1")

        rerender(<PeriodComparisonForm groups={[GROUPS[0]!]} onSubmit={onSubmit} />)
        expect(screen.getByLabelText("Alvo")).toHaveValue("PROPERTY:prop-1")

        await fillPeriods(user, {
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-07",
        })
        await user.click(screen.getByRole("button", { name: /Criar comparação/i }))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ target: GROUPS[0]!.options[0] }),
        )
    })

    it("corrigir a duração reabilita o botão e some com o alerta", async () => {
        const user = userEvent.setup()
        render(<PeriodComparisonForm groups={GROUPS} onSubmit={vi.fn()} />)
        await fillPeriods(user, {
            aStart: "2026-01-01",
            aEnd: "2026-01-07",
            bStart: "2026-02-01",
            bEnd: "2026-02-10",
        })

        const endB = within(screen.getByRole("group", { name: "Período B" })).getByLabelText("Fim")
        await user.clear(endB)
        await user.type(endB, "2026-02-07")

        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Criar comparação/i })).toBeEnabled()
    })
})
