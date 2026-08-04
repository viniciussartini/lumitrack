import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { TermsOfUsePage } from "@/pages/legal/TermsOfUsePage"

describe("TermsOfUsePage", () => {
    it("renderiza o conteúdo dos termos a partir do markdown canônico", async () => {
        renderWithProviders(<TermsOfUsePage />)

        expect(
            await screen.findByRole("heading", { name: /termos de uso do lumitrack/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { name: /uso aceitável/i }),
        ).toBeInTheDocument()
    })

    it("define o título da aba do navegador", async () => {
        renderWithProviders(<TermsOfUsePage />)

        await screen.findByRole("heading", { name: /termos de uso/i })
        expect(document.title).toBe("Termos de Uso — LumiTrack")
    })

    it("tem link para voltar ao cadastro", async () => {
        renderWithProviders(<TermsOfUsePage />)

        const backLink = await screen.findByRole("link", { name: /voltar ao cadastro/i })
        expect(backLink).toHaveAttribute("href", "/registro")
    })
})
