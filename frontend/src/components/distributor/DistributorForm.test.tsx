import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { DistributorForm } from "@/components/distributor/DistributorForm"
import type { Distributor } from "@/types/distributor.types"

const mockDistributor: Distributor = {
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

describe("DistributorForm — modo criação", () => {
    it("renderiza com campos vazios", () => {
        render(
            <DistributorForm
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        )

        expect(screen.getByLabelText(/nome da distribuidora/i)).toHaveValue("")
        expect(screen.getByLabelText(/cnpj/i)).toHaveValue("")
        expect(screen.getByLabelText(/cnpj/i)).not.toBeDisabled()
    })

    it("aplica máscara de CNPJ conforme digita", async () => {
        const user = userEvent.setup()
        render(
            <DistributorForm onSubmit={vi.fn()} onCancel={vi.fn()} />,
        )

        const cnpjInput = screen.getByLabelText(/cnpj/i) as HTMLInputElement
        await user.type(cnpjInput, "06981180000116")

        expect(cnpjInput.value).toBe("06.981.180/0001-16")
    })

    it("submete dados quando preenchidos validamente", async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        const user = userEvent.setup()

        render(<DistributorForm onSubmit={onSubmit} onCancel={vi.fn()} />)

        await user.type(
            screen.getByLabelText(/nome da distribuidora/i),
            "Teste",
        )
        await user.type(screen.getByLabelText(/cnpj/i), "06981180000116")
        await user.selectOptions(
            screen.getByLabelText(/sistema elétrico/i),
            "TRIPHASIC",
        )
        await user.selectOptions(
            screen.getByLabelText(/tensão de trabalho/i),
            "220",
        )
        await user.type(screen.getByLabelText(/preço do kwh/i), "0.75")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledTimes(1)
        })

        const submittedData = onSubmit.mock.calls[0][0]
        expect(submittedData.name).toBe("Teste")
        expect(submittedData.cnpj).toBe("06.981.180/0001-16")
        expect(submittedData.electricalSystem).toBe("TRIPHASIC")
        expect(submittedData.workingVoltage).toBe(220)
        expect(submittedData.kwhPrice).toBe(0.75)
    })

    it("mostra erro de validação para CNPJ inválido", async () => {
        const onSubmit = vi.fn()
        const user = userEvent.setup()

        render(<DistributorForm onSubmit={onSubmit} onCancel={vi.fn()} />)

        await user.type(screen.getByLabelText(/nome/i), "X")
        await user.type(screen.getByLabelText(/cnpj/i), "11111111111111")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(await screen.findByText(/cnpj inválido/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})

describe("DistributorForm — modo edição", () => {
    it("preenche os campos com initialData", () => {
        render(
            <DistributorForm
                initialData={mockDistributor}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        )

        expect(screen.getByLabelText(/nome da distribuidora/i)).toHaveValue(
            "CEMIG Distribuição S.A.",
        )
        expect(screen.getByLabelText(/cnpj/i)).toHaveValue("06.981.180/0001-16")
        // taxRate convertido decimal → percentual: 0.12 → 12
        expect(screen.getByLabelText(/alíquota/i)).toHaveValue(12)
    })

    it("desabilita o campo CNPJ", () => {
        render(
            <DistributorForm
                initialData={mockDistributor}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        )

        expect(screen.getByLabelText(/cnpj/i)).toBeDisabled()
        expect(
            screen.getByText(/cnpj não pode ser alterado/i),
        ).toBeInTheDocument()
    })
})

describe("DistributorForm — cancelamento", () => {
    it("chama onCancel ao clicar no botão Cancelar", async () => {
        const onCancel = vi.fn()
        const user = userEvent.setup()

        render(<DistributorForm onSubmit={vi.fn()} onCancel={onCancel} />)

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})