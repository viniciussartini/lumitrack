import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { FormDialog } from "@/components/ui/FormDialog"

describe("FormDialog", () => {
    it("não renderiza o conteúdo quando open=false", () => {
        render(
            <FormDialog open={false} onOpenChange={vi.fn()} kicker="Área" title="Nova área">
                <p>Conteúdo do form</p>
            </FormDialog>,
        )

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("renderiza kicker, título e o conteúdo quando open=true", () => {
        render(
            <FormDialog open onOpenChange={vi.fn()} kicker="Área" title="Nova área">
                <p>Conteúdo do form</p>
            </FormDialog>,
        )

        const dialog = screen.getByRole("dialog", { name: /nova área/i })
        expect(dialog).toBeInTheDocument()
        expect(screen.getByText("Área")).toBeInTheDocument()
        expect(screen.getByText("Conteúdo do form")).toBeInTheDocument()
    })

    it("chama onOpenChange(false) ao clicar no botão de fechar", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()

        render(
            <FormDialog open onOpenChange={onOpenChange} kicker="Área" title="Nova área">
                <p>Conteúdo do form</p>
            </FormDialog>,
        )

        await user.click(screen.getByRole("button", { name: /fechar/i }))

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })
})
