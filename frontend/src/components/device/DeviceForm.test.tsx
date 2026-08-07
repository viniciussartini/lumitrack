import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { DeviceForm } from "@/components/device/DeviceForm"
import type { DeviceFormData } from "@/schemas/device.schema"
import type { Device } from "@/types/device.types"

const mockDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface RenderOptions {
    initialData?: Device
    onSubmit?: (data: DeviceFormData) => Promise<void>
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
        <DeviceForm
            initialData={initialData}
            onSubmit={onSubmit}
            onCancel={onCancel}
            submitLabel={submitLabel}
        />,
    )

// ─────────────────────────────────────────────────────────────────────────────
// Modo criação
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceForm — modo criação", () => {
    it("renderiza os 4 campos", () => {
        renderForm()

        expect(screen.getByLabelText(/nome do dispositivo/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/modelo/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/potência \(w\)/i)).toBeInTheDocument()
    })

    it("começa com defaults vazios", () => {
        renderForm()

        expect(screen.getByLabelText(/nome do dispositivo/i)).toHaveValue("")
        expect(screen.getByLabelText(/marca/i)).toHaveValue("")
        expect(screen.getByLabelText(/modelo/i)).toHaveValue("")
        // Inputs type="number" expõem .valueAsNumber via toHaveValue(num);
        // pra string vazia o resultado é null em jsdom — checamos via getValue
        expect(screen.getByLabelText(/potência/i)).toHaveValue(null)
    })

    it("mostra helper text de potência típica", () => {
        renderForm()

        // O helper menciona pelo menos um exemplo conhecido
        expect(screen.getByText(/geladeira/i)).toBeInTheDocument()
    })

    it("usa label de submit customizado quando passado", () => {
        renderForm({ submitLabel: "Cadastrar dispositivo" })

        expect(screen.getByRole("button", { name: /cadastrar dispositivo/i })).toBeInTheDocument()
    })

    it("usa label 'Salvar' por default", () => {
        renderForm()

        expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceForm — modo edição", () => {
    it("preenche todos os campos com os dados iniciais", () => {
        renderForm({ initialData: mockDevice })

        expect(screen.getByLabelText(/nome do dispositivo/i)).toHaveValue("Ar-condicionado")
        expect(screen.getByLabelText(/marca/i)).toHaveValue("Daikin")
        expect(screen.getByLabelText(/modelo/i)).toHaveValue("Split 12000 BTU")
        expect(screen.getByLabelText(/potência/i)).toHaveValue(1200)
    })

    it("converte brand=null em string vazia sem quebrar", () => {
        renderForm({ initialData: { ...mockDevice, brand: null } })

        expect(screen.getByLabelText(/marca/i)).toHaveValue("")
    })

    it("converte model=null em string vazia sem quebrar", () => {
        renderForm({ initialData: { ...mockDevice, model: null } })

        expect(screen.getByLabelText(/modelo/i)).toHaveValue("")
    })

    it("converte powerWatts=null em string vazia sem warning de input", () => {
        renderForm({ initialData: { ...mockDevice, powerWatts: null } })

        expect(screen.getByLabelText(/potência/i)).toHaveValue(null)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceForm — validação", () => {
    it("exige nome ao tentar submeter vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita potência zero ou negativa", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Lâmpada")
        await user.type(screen.getByLabelText(/potência/i), "0")
        await user.tab()

        expect(await screen.findByText(/maior que zero/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita marca com mais de 100 caracteres", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Lâmpada")

        const longBrand = "a".repeat(101)
        const brandInput = screen.getByLabelText(/marca/i)
        await user.click(brandInput)
        await user.paste(longBrand)
        await user.tab()

        expect(await screen.findByText(/marca muito longa/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceForm — submit", () => {
    it("submete payload mínimo (só name) com opcionais como undefined", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Lâmpada")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            {
                name: "Lâmpada",
                brand: undefined,
                model: undefined,
                powerWatts: undefined,
            },
            expect.anything(),
        )
    })

    it("submete payload completo com todos os campos preenchidos", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Ar-condicionado")
        await user.type(screen.getByLabelText(/marca/i), "Daikin")
        await user.type(screen.getByLabelText(/modelo/i), "Split 12000 BTU")
        await user.type(screen.getByLabelText(/potência/i), "1200")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            {
                name: "Ar-condicionado",
                brand: "Daikin",
                model: "Split 12000 BTU",
                powerWatts: 1200,
            },
            expect.anything(),
        )
    })

    it("converte powerWatts para number antes de submeter", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Lâmpada")
        await user.type(screen.getByLabelText(/potência/i), "60")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        // powerWatts deve ser number 60, não a string "60"
        expect(onSubmit.mock.calls[0]?.[0].powerWatts).toBe(60)
        expect(typeof onSubmit.mock.calls[0]?.[0].powerWatts).toBe("number")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceForm — cancelar", () => {
    it("chama onCancel ao clicar em Cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
