import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

describe("ConfirmDialog — renderização", () => {
    it("não renderiza nada quando open=false", () => {
        render(
            <ConfirmDialog
                open={false}
                onOpenChange={vi.fn()}
                title="Confirmar"
                description="Tem certeza?"
                onConfirm={vi.fn()}
            />,
        )

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("renderiza título e descrição quando open=true", () => {
        render(
            <ConfirmDialog
                open={true}
                onOpenChange={vi.fn()}
                title="Excluir item"
                description="Esta ação não pode ser desfeita."
                onConfirm={vi.fn()}
            />,
        )

        expect(
            screen.getByRole("heading", { name: /excluir item/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/esta ação não pode ser desfeita/i),
        ).toBeInTheDocument()
    })

    it("usa labels customizados", () => {
        render(
            <ConfirmDialog
                open={true}
                onOpenChange={vi.fn()}
                title="X"
                description="Y"
                confirmLabel="Excluir"
                cancelLabel="Voltar"
                onConfirm={vi.fn()}
            />,
        )

        expect(
            screen.getByRole("button", { name: /excluir/i }),
        ).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /voltar/i })).toBeInTheDocument()
    })
})

describe("ConfirmDialog — interação", () => {
    it("chama onConfirm ao clicar no botão de confirmar", async () => {
        const onConfirm = vi.fn()
        const user = userEvent.setup()

        render(
            <ConfirmDialog
                open={true}
                onOpenChange={vi.fn()}
                title="X"
                description="Y"
                confirmLabel="Sim"
                onConfirm={onConfirm}
            />,
        )

        await user.click(screen.getByRole("button", { name: /sim/i }))

        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it("chama onOpenChange(false) ao clicar em cancelar", async () => {
        const onOpenChange = vi.fn()
        const user = userEvent.setup()

        render(
            <ConfirmDialog
                open={true}
                onOpenChange={onOpenChange}
                title="X"
                description="Y"
                onConfirm={vi.fn()}
            />,
        )

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("desabilita botão de cancelar enquanto isLoading", () => {
        render(
            <ConfirmDialog
                open={true}
                onOpenChange={vi.fn()}
                title="X"
                description="Y"
                isLoading={true}
                onConfirm={vi.fn()}
            />,
        )

        expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled()
    })
})