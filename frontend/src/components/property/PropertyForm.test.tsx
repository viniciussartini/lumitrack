import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyForm } from "@/components/property/PropertyForm"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

const mockDistributor1: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockDistributor2: Distributor = {
    ...mockDistributor1,
    id: "dist-2",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderForm = (
    props: Partial<React.ComponentProps<typeof PropertyForm>> = {},
) =>
    render(
        <PropertyForm
            distributors={[mockDistributor1, mockDistributor2]}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
            {...props}
        />,
    )

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Renderização básica
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — renderização", () => {
    it("renderiza as três seções com headings", () => {
        renderForm()

        expect(
            screen.getByRole("heading", { level: 2, name: /identificação/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { level: 2, name: /distribuidora/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { level: 2, name: /endereço/i }),
        ).toBeInTheDocument()
    })

    it("renderiza todos os campos do form", () => {
        renderForm()

        expect(screen.getByLabelText(/nome da propriedade/i)).toBeInTheDocument()
        expect(
            screen.getByLabelText(/distribuidora vinculada/i),
        ).toBeInTheDocument()
        expect(screen.getByLabelText(/logradouro/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cep/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cidade/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/uf/i)).toBeInTheDocument()
    })

    it("popula o select de distribuidora com as opções recebidas", () => {
        renderForm()

        expect(
            screen.getByRole("option", { name: /cemig distribuição s\.a\./i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("option", { name: /enel são paulo/i }),
        ).toBeInTheDocument()
    })

    it("usa label de submit customizado quando passado", () => {
        renderForm({ submitLabel: "Criar propriedade" })

        expect(
            screen.getByRole("button", { name: /criar propriedade/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição (com initialData)
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — modo edição", () => {
    it("preenche todos os campos com os dados iniciais", () => {
        renderForm({ initialData: mockProperty })

        expect(screen.getByLabelText(/nome/i)).toHaveValue("Casa Principal")
        expect(screen.getByLabelText(/logradouro/i)).toHaveValue(
            "Rua das Flores, 100",
        )
        expect(screen.getByLabelText(/cep/i)).toHaveValue("30000-000")
        expect(screen.getByLabelText(/cidade/i)).toHaveValue("Belo Horizonte")
    })

    it("converte campos null em string vazia sem quebrar", () => {
        const propertyWithNulls: Property = {
            ...mockProperty,
            address: null,
            city: null,
            state: null,
            zipCode: null,
        }

        renderForm({ initialData: propertyWithNulls })

        expect(screen.getByLabelText(/logradouro/i)).toHaveValue("")
        expect(screen.getByLabelText(/cidade/i)).toHaveValue("")
        expect(screen.getByLabelText(/cep/i)).toHaveValue("")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — validação", () => {
    it("exige nome ao tentar submeter vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/nome é obrigatório/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("exige distribuidora ao tentar submeter sem selecionar", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/selecione uma distribuidora/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita CEP em formato inválido", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        const cepInput = screen.getByLabelText(/cep/i)
        await user.type(cepInput, "123") // 3 dígitos: sobrevive à máscara mas falha no regex 00000-000
        await user.tab() // dispara onBlur

        expect(
            await screen.findByText(/cep deve estar no formato/i),
        ).toBeInTheDocument()
    })

    it("rejeita CEP com sequência repetida (00000-000)", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        const cepInput = screen.getByLabelText(/cep/i)
        await user.type(cepInput, "00000000")
        await user.tab()

        expect(await screen.findByText(/cep inválido/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Máscara de CEP
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — máscara de CEP", () => {
    it("aplica máscara enquanto digita", async () => {
        const user = userEvent.setup()
        renderForm()

        const cepInput = screen.getByLabelText(/cep/i) as HTMLInputElement
        await user.type(cepInput, "30000000")

        expect(cepInput.value).toBe("30000-000")
    })

    it("ignora caracteres não numéricos", async () => {
        const user = userEvent.setup()
        renderForm()

        const cepInput = screen.getByLabelText(/cep/i) as HTMLInputElement
        await user.type(cepInput, "30abc000def000")

        expect(cepInput.value).toBe("30000-000")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit feliz
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — submit", () => {
    it("chama onSubmit com dados transformados (vazios viram undefined)", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa Principal")
        await user.selectOptions(
            screen.getByLabelText(/distribuidora/i),
            "dist-1",
        )

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Casa Principal",
                distributorId: "dist-1",
                address: undefined,
                city: undefined,
                state: undefined,
                zipCode: undefined,
            }),
            expect.anything(), // RHF passa o SyntheticEvent como 2º arg
        )
    })

    it("envia campos preenchidos corretamente", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa Principal")
        await user.selectOptions(
            screen.getByLabelText(/distribuidora/i),
            "dist-1",
        )
        await user.type(
            screen.getByLabelText(/logradouro/i),
            "Rua das Flores, 100",
        )
        await user.type(screen.getByLabelText(/cidade/i), "Belo Horizonte")
        await user.selectOptions(screen.getByLabelText(/uf/i), "MG")
        await user.type(screen.getByLabelText(/cep/i), "30000000")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            {
                name: "Casa Principal",
                distributorId: "dist-1",
                address: "Rua das Flores, 100",
                city: "Belo Horizonte",
                state: "MG",
                zipCode: "30000-000",
            },
            expect.anything(), // RHF passa o SyntheticEvent como 2º arg
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — cancelar", () => {
    it("chama onCancel ao clicar em Cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})