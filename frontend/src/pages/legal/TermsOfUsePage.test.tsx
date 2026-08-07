import { describe, it, expect } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { TermsOfUsePage } from "@/pages/legal/TermsOfUsePage"

describe("TermsOfUsePage", () => {
    it("renderiza o conteúdo dos termos a partir do markdown canônico", async () => {
        renderWithProviders(<TermsOfUsePage />)

        expect(
            await screen.findByRole("heading", { name: /termos de uso do lumitrack/i }),
        ).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: /uso aceitável/i })).toBeInTheDocument()
    })

    it("define o título da aba do navegador", async () => {
        renderWithProviders(<TermsOfUsePage />)

        await screen.findByRole("heading", { name: /termos de uso/i })
        expect(document.title).toBe("Termos de Uso — LumiTrack")
    })

    it("não tem mais o link 'Voltar ao cadastro' — a página abre em aba nova, sem destino de volta", async () => {
        renderWithProviders(<TermsOfUsePage />)

        await screen.findByRole("heading", { name: /termos de uso/i })
        expect(screen.queryByRole("link", { name: /voltar ao cadastro/i })).not.toBeInTheDocument()
    })

    it("mostra o logo real do LumiTrack no cabeçalho, não o ícone genérico", async () => {
        renderWithProviders(<TermsOfUsePage />)

        await screen.findByRole("heading", { name: /termos de uso/i })
        expect(screen.getByTestId("lumitrack-wordmark")).toBeInTheDocument()
    })
})
