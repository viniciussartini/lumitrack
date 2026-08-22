import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@/tests/test-utils"
import { Pagination } from "@/components/ui/Pagination"

const renderPagination = (page: number, total: number, pageSize = 30) => {
    const onPageChange = vi.fn()
    render(<Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />)
    return { onPageChange }
}

describe("Pagination — renderização", () => {
    it("não renderiza nada quando tudo cabe em uma página", () => {
        renderPagination(1, 20)

        expect(screen.queryByTestId("pagination")).not.toBeInTheDocument()
    })

    it("mostra o resumo de itens e a página corrente", () => {
        renderPagination(2, 90)

        expect(screen.getByTestId("pagination")).toHaveTextContent("90 itens · página 2 de 3")
    })

    it("marca a página corrente com aria-current", () => {
        renderPagination(2, 90)

        expect(screen.getByRole("button", { name: "Página 2" })).toHaveAttribute(
            "aria-current",
            "page",
        )
        expect(screen.getByRole("button", { name: "Página 1" })).not.toHaveAttribute("aria-current")
    })

    it("corta o excesso com elipse, mantendo primeira e última alcançáveis", () => {
        // 600 itens / 30 por página = 20 páginas.
        renderPagination(10, 600)

        expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Página 20" })).toBeInTheDocument()
        expect(screen.getAllByTestId("pagination-ellipsis")).toHaveLength(2)
        // A elipse é decorativa — o leitor de tela não anuncia "reticências".
        expect(screen.getAllByTestId("pagination-ellipsis")[0]).toHaveAttribute(
            "aria-hidden",
            "true",
        )
    })
})

describe("Pagination — navegação", () => {
    it("primeira e última página são alcançáveis em um clique", async () => {
        const user = userEvent.setup()
        const { onPageChange } = renderPagination(10, 600)

        await user.click(screen.getByTestId("pagination-last"))
        expect(onPageChange).toHaveBeenCalledWith(20)

        await user.click(screen.getByTestId("pagination-first"))
        expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it("clicar num número navega para aquela página", async () => {
        const user = userEvent.setup()
        const { onPageChange } = renderPagination(10, 600)

        await user.click(screen.getByRole("button", { name: "Página 11" }))

        expect(onPageChange).toHaveBeenCalledWith(11)
    })

    it("desabilita primeira/anterior na página 1", () => {
        renderPagination(1, 600)

        expect(screen.getByTestId("pagination-first")).toBeDisabled()
        expect(screen.getByTestId("pagination-prev")).toBeDisabled()
        expect(screen.getByTestId("pagination-next")).toBeEnabled()
        expect(screen.getByTestId("pagination-last")).toBeEnabled()
    })

    it("desabilita próxima/última na última página", () => {
        renderPagination(20, 600)

        expect(screen.getByTestId("pagination-next")).toBeDisabled()
        expect(screen.getByTestId("pagination-last")).toBeDisabled()
        expect(screen.getByTestId("pagination-prev")).toBeEnabled()
        expect(screen.getByTestId("pagination-first")).toBeEnabled()
    })

    it("a página corrente não dispara navegação redundante", async () => {
        const user = userEvent.setup()
        const { onPageChange } = renderPagination(2, 90)

        await user.click(screen.getByRole("button", { name: "Página 2" }))

        expect(onPageChange).not.toHaveBeenCalled()
    })
})
