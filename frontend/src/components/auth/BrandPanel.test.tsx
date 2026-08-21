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
        if (!copyright || !credit || !github) {
            throw new Error("Rodapé do BrandPanel deveria ter exatamente 3 filhos")
        }

        expect(copyright.textContent).toContain("© 2026 LumiTrack")
        expect(credit.textContent).toContain("Magnific")
        expect(credit).toHaveClass("text-center")
        expect(github).toHaveAttribute(
            "aria-label",
            "Ver o repositório do LumiTrack no GitHub (abre em nova aba)",
        )
    })

    // Issue #214: sem isso, o painel esquerdo é um item de grid comum —
    // sua altura é a altura da linha do grid, que muda conforme o
    // conteúdo da coluna direita (ex.: Registro trocando Pessoa
    // Física/Jurídica). `self-start` tira o painel do stretch padrão do
    // grid e `h-screen` fixa sua altura na viewport, independente do
    // irmão; `sticky top-0` mantém essa altura fixa visível durante o
    // scroll se a coluna direita for mais alta que a tela.
    it("fixa a altura do painel na viewport, independente do conteúdo da coluna irmã", () => {
        renderWithProviders(<BrandPanel eyebrow="Acesso" headline="Título" />)

        const panel = screen.getByTestId("brand-panel-footer").closest("aside")
        expect(panel).toHaveClass("lg:sticky", "lg:top-0", "lg:h-screen", "lg:self-start")
    })
})
