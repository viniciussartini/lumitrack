import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { Sidebar } from "@/components/layout/Sidebar"
import { NAV_ITEMS } from "@/config/navigation"
import { authService } from "@/services/auth.service"
import type { User } from "@/types/auth.types"

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

const mockUser: User = {
    id: "user-123",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    mfaEnabled: false,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser)
})

describe("Sidebar — renderização", () => {
    it("renderiza o logo e o nome do produto", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        expect(screen.getByTestId("lumitrack-wordmark")).toHaveTextContent("LumiTrack")
    })

    it("renderiza um link para cada item de navegação", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        NAV_ITEMS.forEach((item) => {
            const link = screen.getByRole("link", { name: new RegExp(item.label, "i") })
            expect(link).toBeInTheDocument()
            expect(link).toHaveAttribute("href", item.to)
        })
    })

    // Issue #216: "Segurança" duplicado — já existe no menu do usuário
    // (UserMenu.tsx, role="menuitem", não "link"), não precisa também estar
    // na navegação principal da sidebar.
    it("não tem link para /seguranca na navegação — já existe no menu do usuário", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        expect(screen.queryByRole("link", { name: /segurança/i })).not.toBeInTheDocument()
    })

    it("marca o link da rota atual com aria-current='page'", () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />, {
            initialEntries: ["/distribuidoras"],
        })

        const activeLink = screen.getByRole("link", { name: /distribuidoras/i })
        expect(activeLink).toHaveAttribute("aria-current", "page")

        // Outros links NÃO devem estar marcados
        const painelLink = screen.getByRole("link", { name: /painel/i })
        expect(painelLink).not.toHaveAttribute("aria-current", "page")
    })

    it("renderiza o rodapé de identidade (nome, tipo de conta) e o alternador de tema", async () => {
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)

        expect(await screen.findByText("João Silva")).toBeInTheDocument()
        expect(screen.getByText("Pessoa Física")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /tema atual/i })).toBeInTheDocument()
    })

    it("abre o menu do usuário ao clicar no bloco de identidade do rodapé", async () => {
        const user = userEvent.setup()
        renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />)
        await screen.findByText("João Silva")

        await user.click(screen.getByRole("button", { name: /menu do usuário/i }))

        expect(screen.getByRole("menu")).toBeInTheDocument()
        expect(screen.getByRole("menuitem", { name: /sair/i })).toBeInTheDocument()
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
