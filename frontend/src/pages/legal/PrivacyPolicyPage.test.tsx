import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { PrivacyPolicyPage } from "@/pages/legal/PrivacyPolicyPage"

describe("PrivacyPolicyPage", () => {
    it("renderiza o conteúdo da política a partir do markdown canônico", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        expect(
            await screen.findByRole("heading", { name: /política de privacidade do lumitrack/i }),
        ).toBeInTheDocument()
        expect(screen.getByText(/quais dados coletamos/i)).toBeInTheDocument()
    })

    it("define o título da aba do navegador", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        await screen.findByRole("heading", { name: /política de privacidade/i })
        expect(document.title).toBe("Política de Privacidade — LumiTrack")
    })

    it("tem link para voltar ao cadastro", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        const backLink = await screen.findByRole("link", { name: /voltar ao cadastro/i })
        expect(backLink).toHaveAttribute("href", "/registro")
    })
})
