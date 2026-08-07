import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { AboutPage } from "@/pages/about/AboutPage"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"

describe("AboutPage", () => {
    it("renderiza o conteúdo a partir do markdown canônico", async () => {
        renderWithProviders(<AboutPage />)

        expect(await screen.findByRole("heading", { name: /o que é/i })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: /o problema/i })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: /para quem é/i })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: /motivação e objetivos/i })).toBeInTheDocument()
    })

    it("não renderiza um h1 local — o título vem do Header contextual", async () => {
        renderWithProviders(<AboutPage />)

        await screen.findByRole("heading", { name: /o que é/i })
        expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    })

    it("tem link para o repositório no GitHub, seguro e acessível", async () => {
        renderWithProviders(<AboutPage />)

        const repoLink = await screen.findByRole("link", { name: /ver o repositório.*github/i })
        expect(repoLink).toHaveAttribute("href", "https://github.com/viniciussartini/lumitrack")
        expect(repoLink).toHaveAttribute("target", "_blank")
        expect(repoLink).toHaveAttribute("rel", "noopener noreferrer")
    })

    // Canal de comunicação com o titular (LGPD Art. 18, issue #155) — precisa
    // estar visível dentro do shell autenticado, não só no rodapé público.
    it("publica o canal de privacidade e linka para o Perfil", async () => {
        renderWithProviders(<AboutPage />)

        const privacyLink = await screen.findByRole("link", {
            name: new RegExp(PRIVACY_CONTACT_EMAIL),
        })
        expect(privacyLink).toHaveAttribute("href", `mailto:${PRIVACY_CONTACT_EMAIL}`)
        expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/perfil")
    })
})
