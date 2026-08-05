import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { LandingPage } from "@/pages/landing/LandingPage"

describe("LandingPage — rodapé", () => {
    it("tem link para o repositório no GitHub, seguro e acessível", async () => {
        renderWithProviders(<LandingPage />)

        const repoLink = await screen.findByRole("link", {
            name: /ver o repositório do lumitrack no github/i,
        })
        expect(repoLink).toHaveAttribute("href", "https://github.com/viniciussartini/lumitrack")
        expect(repoLink).toHaveAttribute("target", "_blank")
        expect(repoLink).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("abre os links legais (Termos, Política de Privacidade, LGPD) em aba nova", async () => {
        renderWithProviders(<LandingPage />)

        const legalLabels = [/^termos de uso$/i, /^política de privacidade$/i, /^lgpd$/i]
        for (const name of legalLabels) {
            const link = await screen.findByRole("link", { name })
            expect(link).toHaveAttribute("target", "_blank")
            expect(link).toHaveAttribute("rel", "noopener noreferrer")
        }
    })

    it("não abre os links de conta (Entrar, Criar conta, Recuperar senha) em aba nova", async () => {
        renderWithProviders(<LandingPage />)

        const accountLabels = [/^entrar$/i, /^criar conta$/i, /^recuperar senha$/i]
        for (const name of accountLabels) {
            const link = await screen.findAllByRole("link", { name })
            expect(link.at(-1)).not.toHaveAttribute("target")
        }
    })
})
