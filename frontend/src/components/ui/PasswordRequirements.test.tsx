import { describe, it, expect } from "vitest"
import { render, screen } from "@/tests/test-utils"
import { PasswordRequirements } from "@/components/ui/PasswordRequirements"

describe("PasswordRequirements", () => {
    it("renderiza todos os 5 requisitos", () => {
        render(<PasswordRequirements password="" />)

        expect(screen.getByText(/pelo menos 8 caracteres/i)).toBeInTheDocument()
        expect(screen.getByText(/uma letra maiúscula/i)).toBeInTheDocument()
        expect(screen.getByText(/uma letra minúscula/i)).toBeInTheDocument()
        expect(screen.getByText(/um número/i)).toBeInTheDocument()
        expect(screen.getByText(/um caractere especial/i)).toBeInTheDocument()
    })

    it("com senha vazia, todos os requisitos ficam não-atendidos", () => {
        render(<PasswordRequirements password="" />)

        const icons = screen
            .getAllByRole("listitem")
            .map((li) => li.querySelector("[data-met]")?.getAttribute("data-met"))

        expect(icons).toEqual(["false", "false", "false", "false", "false"])
    })

    it("marca tamanho como atendido quando >= 8 caracteres", () => {
        render(<PasswordRequirements password="abcdefgh" />)

        const tamanhoItem = screen.getByText(/pelo menos 8 caracteres/i).closest("li")!
        const icon = tamanhoItem.querySelector("[data-met]")
        expect(icon).toHaveAttribute("data-met", "true")
    })

    it("marca cada critério individualmente conforme satisfeito", () => {
        // Senha atende: tamanho ✓ minúscula ✓ — falta maiúscula, número e especial
        render(<PasswordRequirements password="abcdefgh" />)

        const items = screen.getAllByRole("listitem")
        const metFlags = items.map((li) => li.querySelector("[data-met]")?.getAttribute("data-met"))

        // Ordem: tamanho, maiúscula, minúscula, número, especial
        expect(metFlags).toEqual(["true", "false", "true", "false", "false"])
    })

    it("com senha forte, todos os requisitos ficam atendidos", () => {
        render(<PasswordRequirements password="Senha@123" />)

        const items = screen.getAllByRole("listitem")
        const metFlags = items.map((li) => li.querySelector("[data-met]")?.getAttribute("data-met"))

        expect(metFlags).toEqual(["true", "true", "true", "true", "true"])
    })
})
