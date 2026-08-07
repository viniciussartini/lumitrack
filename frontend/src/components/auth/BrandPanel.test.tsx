import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { BrandPanel } from "@/components/auth/BrandPanel"

describe("BrandPanel — rodapé", () => {
    it("mostra o logo do GitHub com link acessível para o repositório", () => {
        renderWithProviders(<BrandPanel eyebrow="Acesso" headline="Título" />)

        const githubLink = screen.getByRole("link", {
            name: /ver o repositório do lumitrack no github/i,
        })
        expect(githubLink).toHaveAttribute("href", "https://github.com/viniciussartini/lumitrack")
        expect(githubLink).toHaveAttribute("target", "_blank")
        expect(githubLink).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("mantém as 3 posições do rodapé na ordem: copyright, crédito Magnific centralizado, GitHub", () => {
        renderWithProviders(<BrandPanel eyebrow="Acesso" headline="Título" />)

        const footer = screen.getByTestId("brand-panel-footer")
        const [copyright, credit, github] = Array.from(footer.children)

        expect(copyright.textContent).toContain("© 2026 LumiTrack")
        expect(credit.textContent).toContain("Magnific")
        expect(credit).toHaveClass("text-center")
        expect(github).toHaveAttribute(
            "aria-label",
            "Ver o repositório do LumiTrack no GitHub (abre em nova aba)",
        )
    })
})
