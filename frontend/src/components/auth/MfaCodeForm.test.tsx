import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@/tests/test-utils"
import { MfaCodeForm } from "@/components/auth/MfaCodeForm"

describe("MfaCodeForm — validação client-side", () => {
    it("mostra erro quando o código está vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<MfaCodeForm description="desc" submitLabel="Verificar" onSubmit={onSubmit} />)

        await user.click(screen.getByRole("button", { name: /verificar/i }))

        expect(await screen.findByText(/código é obrigatório/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})

describe("MfaCodeForm — submit", () => {
    it("chama onSubmit com o código digitado", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(<MfaCodeForm description="desc" submitLabel="Verificar" onSubmit={onSubmit} />)

        await user.type(screen.getByLabelText(/código de verificação/i), "123456")
        await user.click(screen.getByRole("button", { name: /verificar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("123456"))
    })

    it("exibe erro inline quando onSubmit rejeita", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockRejectedValue(new Error("Código inválido"))
        render(<MfaCodeForm description="desc" submitLabel="Verificar" onSubmit={onSubmit} />)

        await user.type(screen.getByLabelText(/código de verificação/i), "000000")
        await user.click(screen.getByRole("button", { name: /verificar/i }))

        expect(await screen.findByText(/código inválido/i)).toBeInTheDocument()
    })
})

describe("MfaCodeForm — cancelamento", () => {
    it("não renderiza botão de cancelar quando onCancel não é passado", () => {
        render(<MfaCodeForm description="desc" submitLabel="Verificar" onSubmit={vi.fn()} />)

        expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument()
    })

    it("chama onCancel ao clicar no botão de cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        render(
            <MfaCodeForm
                description="desc"
                submitLabel="Verificar"
                onSubmit={vi.fn()}
                onCancel={onCancel}
                cancelLabel="Voltar"
            />,
        )

        await user.click(screen.getByRole("button", { name: /voltar/i }))

        expect(onCancel).toHaveBeenCalled()
    })
})
