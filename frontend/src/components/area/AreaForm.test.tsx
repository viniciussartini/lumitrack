import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { AreaForm } from "@/components/area/AreaForm"
import type { AreaFormData } from "@/schemas/area.schema"
import type { Area } from "@/types/area.types"

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface RenderOptions {
    initialData?: Area
    onSubmit?: (data: AreaFormData) => Promise<void>
    onCancel?: () => void
    submitLabel?: string
}

const renderForm = ({
    initialData,
    onSubmit = vi.fn().mockResolvedValue(undefined),
    onCancel = vi.fn(),
    submitLabel,
}: RenderOptions = {}) =>
    render(
        <AreaForm
            initialData={initialData}
            onSubmit={onSubmit}
            onCancel={onCancel}
            submitLabel={submitLabel}
        />,
    )

// ─────────────────────────────────────────────────────────────────────────────
// Modo criação
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaForm — modo criação", () => {
    it("renderiza os dois campos (nome obrigatório, descrição opcional)", () => {
        renderForm()

        expect(screen.getByLabelText(/nome da área/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/descrição/i)).toBeInTheDocument()
    })

    it("começa com defaults vazios", () => {
        renderForm()

        expect(screen.getByLabelText(/nome da área/i)).toHaveValue("")
        expect(screen.getByLabelText(/descrição/i)).toHaveValue("")
    })

    it("usa label de submit customizado quando passado", () => {
        renderForm({ submitLabel: "Criar área" })

        expect(screen.getByRole("button", { name: /criar área/i })).toBeInTheDocument()
    })

    it("usa label 'Salvar' por default", () => {
        renderForm()

        expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaForm — modo edição", () => {
    it("preenche todos os campos com os dados iniciais", () => {
        renderForm({ initialData: mockArea })

        expect(screen.getByLabelText(/nome da área/i)).toHaveValue("Sala")
        expect(screen.getByLabelText(/descrição/i)).toHaveValue("Área principal de convivência")
    })

    it("converte description=null em string vazia sem quebrar", () => {
        renderForm({ initialData: { ...mockArea, description: null } })

        expect(screen.getByLabelText(/descrição/i)).toHaveValue("")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaForm — validação", () => {
    it("exige nome ao tentar submeter vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita nome com mais de 200 caracteres", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        // Usa fireEvent equivalente via paste pra ser rápido (201 chars)
        const longName = "a".repeat(201)
        const nameInput = screen.getByLabelText(/nome da área/i)
        await user.click(nameInput)
        await user.paste(longName)
        await user.tab() // dispara onBlur

        expect(await screen.findByText(/nome muito longo/i)).toBeInTheDocument()
    })

    it("rejeita descrição com mais de 1000 caracteres", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome da área/i), "Sala")

        const longDescription = "a".repeat(1001)
        const descInput = screen.getByLabelText(/descrição/i)
        await user.click(descInput)
        await user.paste(longDescription)
        await user.tab()

        expect(await screen.findByText(/descrição muito longa/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaForm — submit", () => {
    it("submete payload com name e description=undefined quando descrição vazia", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome da área/i), "Sala")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            { name: "Sala", description: undefined },
            expect.anything(), // SyntheticEvent
        )
    })

    it("submete payload com name e description quando ambos preenchidos", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome da área/i), "Sala")
        await user.type(screen.getByLabelText(/descrição/i), "Área de convivência")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            { name: "Sala", description: "Área de convivência" },
            expect.anything(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaForm — cancelar", () => {
    it("chama onCancel ao clicar em Cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
