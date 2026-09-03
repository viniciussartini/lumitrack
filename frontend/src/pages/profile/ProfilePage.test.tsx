import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProfilePage } from "@/pages/profile/ProfilePage"
import { authService } from "@/services/auth.service"
import { userService } from "@/services/user.service"
import { propertyService } from "@/services/property.service"
import { formatDate } from "@/lib/format"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"
import type { User } from "@/types/auth.types"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

const mockNavigate = vi.fn()
vi.mock("react-router", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router")>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
}))

vi.mock("@/services/user.service", () => ({
    userService: { update: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const paginatedProperties = (total: number): Paginated<Property> => ({
    items: [],
    total,
    page: 1,
    pageSize: 1,
})

const mockUserPF: User = {
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

const mockUserPJ: User = {
    id: "user-456",
    email: "contato@empresa.com",
    userType: "COMPANY",
    mfaEnabled: false,
    companyName: "Empresa Ltda",
    tradeName: "Empresa",
    cnpj: "11.222.333/0001-81",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderPage = (user: User = mockUserPF) => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user)
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AuthProvider>
                    <ProfilePage />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.list).mockResolvedValue(paginatedProperties(0))
})

describe("ProfilePage — modo leitura", () => {
    it("mostra nome, sobrenome, CPF mascarado, e-mail e tipo de conta (PF)", async () => {
        renderPage(mockUserPF)

        expect(await screen.findByRole("heading", { name: "João Silva" })).toBeInTheDocument()
        expect(screen.getByText("João")).toBeInTheDocument()
        expect(screen.getByText("Silva")).toBeInTheDocument()
        expect(screen.getByText("•••.•••.247-25")).toBeInTheDocument()
        expect(screen.getAllByText("joao@example.com").length).toBeGreaterThan(0)
        expect(screen.getAllByText("Pessoa Física").length).toBeGreaterThan(0)
    })

    it("mostra razão social, nome fantasia, CNPJ mascarado e tipo de conta (PJ)", async () => {
        renderPage(mockUserPJ)

        expect(await screen.findByRole("heading", { name: "Empresa" })).toBeInTheDocument()
        expect(screen.getByText("Empresa Ltda")).toBeInTheDocument()
        expect(screen.getByText("••.•••.•••/0001-81")).toBeInTheDocument()
        expect(screen.getAllByText("Pessoa Jurídica").length).toBeGreaterThan(0)
    })
})

describe("ProfilePage — edição", () => {
    // "Editar" passou a abrir um modal (FormDialog), não mais trocar o
    // conteúdo do card inline.
    it("abre um modal (dialog) ao clicar em Editar, com o formulário dentro", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))

        const dialog = await screen.findByRole("dialog", { name: /editar perfil/i })
        expect(within(dialog).getByLabelText("Nome")).toBeInTheDocument()
    })

    // Critério de aceite: ProfileReadView permanece a view padrão da
    // página, sem alternância de estado inline — os dados em modo leitura
    // continuam visíveis por trás do modal, não somem quando ele abre.
    it("mantém os dados em modo leitura visíveis por trás do modal", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        await screen.findByRole("dialog", { name: /editar perfil/i })

        expect(screen.getByText("•••.•••.247-25")).toBeInTheDocument()
    })

    it("Cancelar volta ao modo leitura sem salvar", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: /cancelar/i }))
        expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument()
        expect(userService.update).not.toHaveBeenCalled()
    })

    it("CPF/CNPJ sempre aparece desabilitado no form", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))

        expect(screen.getByLabelText("CPF")).toBeDisabled()
    })

    it("salva as alterações, sai do modo edição e atualiza o AuthContext", async () => {
        const updatedUser: User = { ...mockUserPF, firstName: "Joana" }
        vi.mocked(userService.update).mockResolvedValue(updatedUser)
        vi.mocked(authService.getCurrentUser)
            .mockResolvedValueOnce(mockUserPF)
            .mockResolvedValueOnce(updatedUser)

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        const firstNameInput = screen.getByLabelText("Nome")
        await user.clear(firstNameInput)
        await user.type(firstNameInput, "Joana")
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await waitFor(() => {
            expect(userService.update).toHaveBeenCalledWith("user-123", {
                firstName: "Joana",
                lastName: "Silva",
                email: "joao@example.com",
            })
        })
        expect(await screen.findByRole("heading", { name: "Joana Silva" })).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalled()
    })

    it("mostra erro e permanece em edição quando a mutation falha", async () => {
        vi.mocked(userService.update).mockRejectedValue(new Error("E-mail já cadastrado"))

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })
        expect(screen.getByRole("button", { name: /salvar alterações/i })).toBeInTheDocument()
    })
})

// Troca de e-mail exige senha atual + é confirmada por e-mail, não
// efetivada na hora.
describe("ProfilePage — troca de e-mail", () => {
    it("não mostra o campo de senha atual quando o e-mail não muda", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))

        expect(screen.queryByLabelText(/senha atual/i)).not.toBeInTheDocument()
    })

    it("mostra o campo de senha atual assim que o e-mail é editado", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        const emailInput = screen.getByLabelText("E-mail")
        await user.clear(emailInput)
        await user.type(emailInput, "novo@example.com")

        expect(await screen.findByLabelText(/senha atual/i)).toBeInTheDocument()
    })

    it("bloqueia o envio (client-side) sem a senha atual quando o e-mail muda", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        const emailInput = screen.getByLabelText("E-mail")
        await user.clear(emailInput)
        await user.type(emailInput, "novo@example.com")
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        expect(
            await screen.findByText(/senha atual é obrigatória para alterar o e-mail/i),
        ).toBeInTheDocument()
        expect(userService.update).not.toHaveBeenCalled()
    })

    it("envia currentPassword junto quando o e-mail muda, e mostra o toast de confirmação pendente", async () => {
        // A resposta continua trazendo o e-mail ANTIGO — a troca só vale
        // após confirmação pelo novo endereço.
        vi.mocked(userService.update).mockResolvedValue(mockUserPF)
        vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUserPF)

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /editar/i }))
        const emailInput = screen.getByLabelText("E-mail")
        await user.clear(emailInput)
        await user.type(emailInput, "novo@example.com")
        await user.type(await screen.findByLabelText(/senha atual/i), "Senha@123")
        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await waitFor(() => {
            expect(userService.update).toHaveBeenCalledWith("user-123", {
                firstName: "João",
                lastName: "Silva",
                email: "novo@example.com",
                currentPassword: "Senha@123",
            })
        })

        expect(toast.success).toHaveBeenCalledWith(
            expect.stringMatching(/confirme o novo e-mail/i),
            expect.anything(),
        )
    })
})

describe("ProfilePage — Conta", () => {
    it("mostra a data de entrada, a contagem de propriedades e 2FA ativado", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginatedProperties(3))

        renderPage({ ...mockUserPF, mfaEnabled: true })

        expect(await screen.findByText(formatDate(mockUserPF.createdAt))).toBeInTheDocument()
        expect(await screen.findByText("3 vinculadas")).toBeInTheDocument()
        expect(screen.getByText("Ativado")).toBeInTheDocument()
    })

    it("mostra 2FA desativado e '1 vinculada' no singular", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginatedProperties(1))

        renderPage({ ...mockUserPF, mfaEnabled: false })

        expect(await screen.findByText("1 vinculada")).toBeInTheDocument()
        expect(screen.getByText("Desativado")).toBeInTheDocument()
    })
})

describe("ProfilePage — Exercer meus direitos (Art. 18, issue #155)", () => {
    it("publica o canal de privacidade", async () => {
        renderPage(mockUserPF)

        const privacyLink = await screen.findByRole("link", {
            name: new RegExp(PRIVACY_CONTACT_EMAIL),
        })
        expect(privacyLink).toHaveAttribute("href", `mailto:${PRIVACY_CONTACT_EMAIL}`)
    })

    it("marca 'Acesso aos dados' como autoatendido e 'Revogação do consentimento' como pelo canal", async () => {
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        const accessRow = screen.getByText("Acesso aos dados").closest("li")
        expect(accessRow).not.toBeNull()
        expect(within(accessRow!).getByText("Autoatendido")).toBeInTheDocument()

        const revocationRow = screen.getByText("Revogação do consentimento").closest("li")
        expect(revocationRow).not.toBeNull()
        expect(within(revocationRow!).getByText("Pelo canal")).toBeInTheDocument()
    })
})

describe("ProfilePage — Privacidade & dados", () => {
    it("o link de exportar aponta pro endpoint de exportação (formato json)", async () => {
        renderPage(mockUserPF)

        const link = await screen.findByRole("link", { name: /exportar/i })
        expect(link).toHaveAttribute("href", "/api/users/me/data-export?format=json")
        expect(link).toHaveAttribute("download")
    })

    it("abre o dialog de confirmação ao clicar em Excluir conta", async () => {
        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /excluir conta/i }))

        expect(await screen.findByRole("dialog")).toBeInTheDocument()
        expect(screen.getByText(/excluir sua conta\?/i)).toBeInTheDocument()
    })

    it("confirma a exclusão: chama userService.remove, desloga e navega pra /login", async () => {
        vi.mocked(userService.remove).mockResolvedValue(undefined)
        vi.mocked(authService.logout).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /excluir conta/i }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: /excluir conta/i }))

        await waitFor(() => {
            expect(userService.remove).toHaveBeenCalledWith("user-123")
        })
        await waitFor(() => {
            expect(authService.logout).toHaveBeenCalled()
        })
        expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true })
    })

    it("mostra toast de erro e mantém o dialog aberto quando a exclusão falha", async () => {
        vi.mocked(userService.remove).mockRejectedValue(new Error("Falha de rede"))

        const user = userEvent.setup()
        renderPage(mockUserPF)
        await screen.findByRole("heading", { name: "João Silva" })

        await user.click(screen.getByRole("button", { name: /excluir conta/i }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: /excluir conta/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })
        expect(screen.getByRole("dialog")).toBeInTheDocument()
        expect(mockNavigate).not.toHaveBeenCalled()
    })
})
