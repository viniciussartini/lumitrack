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
})
