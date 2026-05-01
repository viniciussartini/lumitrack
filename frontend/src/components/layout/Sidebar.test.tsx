import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { Sidebar } from "@/components/layout/Sidebar"
import { NAV_ITEMS } from "@/config/navigation"

describe("Sidebar — renderização", () => {
    it("renderiza o logo e o nome do produto", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        expect(screen.getByText("LumiTrack")).toBeInTheDocument()
    })

    it("renderiza um link para cada item de navegação", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        NAV_ITEMS.forEach((item) => {
            const link = screen.getByRole("link", { name: new RegExp(item.label, "i") })
            expect(link).toBeInTheDocument()
            expect(link).toHaveAttribute("href", item.to)
        })
    })

    it("marca o link da rota atual com aria-current='page'", () => {
        renderWithProviders(
            <Sidebar isOpen={false} onClose={vi.fn()} />,
            { initialEntries: ["/distribuidoras"] },
        )

        const activeLink = screen.getByRole("link", { name: /distribuidoras/i })
        expect(activeLink).toHaveAttribute("aria-current", "page")

        // Outros links NÃO devem estar marcados
        const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
        expect(dashboardLink).not.toHaveAttribute("aria-current", "page")
    })
})

describe("Sidebar — interação mobile", () => {
    it("chama onClose ao clicar no botão de fechar", async () => {
        const onClose = vi.fn()
        const user = userEvent.setup()

        renderWithProviders(<Sidebar isOpen={true} onClose={onClose} />)

        await user.click(screen.getByRole("button", { name: /fechar menu/i }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("chama onClose ao clicar no backdrop", async () => {
        const onClose = vi.fn()
        const user = userEvent.setup()

        renderWithProviders(<Sidebar isOpen={true} onClose={onClose} />)

        await user.click(screen.getByTestId("sidebar-backdrop"))

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})