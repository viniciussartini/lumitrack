import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { PrivacyPolicyPage } from "@/pages/legal/PrivacyPolicyPage"

describe("PrivacyPolicyPage", () => {
    it("renderiza o conteúdo da política a partir do markdown canônico", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        expect(
            await screen.findByRole("heading", { name: /política de privacidade do lumitrack/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { name: /quais dados coletamos/i }),
        ).toBeInTheDocument()
    })

    it("define o título da aba do navegador", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        await screen.findByRole("heading", { name: /política de privacidade/i })
        expect(document.title).toBe("Política de Privacidade — LumiTrack")
    })

    it("não tem mais o link 'Voltar ao cadastro' — a página abre em aba nova, sem destino de volta", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        await screen.findByRole("heading", { name: /política de privacidade/i })
        expect(screen.queryByRole("link", { name: /voltar ao cadastro/i })).not.toBeInTheDocument()
    })

    it("mostra o logo real do LumiTrack no cabeçalho, não o ícone genérico", async () => {
        renderWithProviders(<PrivacyPolicyPage />)

        await screen.findByRole("heading", { name: /política de privacidade/i })
        expect(screen.getByTestId("lumitrack-wordmark")).toBeInTheDocument()
    })
})
