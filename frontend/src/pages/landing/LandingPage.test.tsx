import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderWithProviders, screen } from "@/tests/test-utils"
import { LandingPage } from "@/pages/landing/LandingPage"
import { useTariffFlag } from "@/hooks/queries/useTariffFlag"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"
import type { TariffFlagConfig } from "@/types/tariff-flag.types"

const mockTariffFlagConfig: TariffFlagConfig = {
    currentFlag: "GREEN",
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.885,
    redP1Per100Kwh: 4.463,
    redP2Per100Kwh: 7.877,
    updatedAt: new Date().toISOString(),
}

// Bandeira vem de GET /api/tariff-flag (leitura pública) — mock no
// nível do hook evita precisar de um QueryClientProvider real neste teste.
vi.mock("@/hooks/queries/useTariffFlag", () => ({
    useTariffFlag: vi.fn(),
}))

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTariffFlag).mockReturnValue({
        data: mockTariffFlagConfig,
        isLoading: false,
        isError: false,
    } as ReturnType<typeof useTariffFlag>)
})

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

    // O ícone do GitHub vivia num bloco à parte (misturado com o link de
    // e-mail), fora do rodapé de crédito — inconsistente com BrandPanel.tsx
    // (Login/Registro), onde ele é a 3ª coluna da barra
    // "© ... · Logo desenhada por Magnific".
    it("mostra o ícone do GitHub na barra de crédito do rodapé, mesmo padrão do BrandPanel", async () => {
        renderWithProviders(<LandingPage />)

        const creditBar = await screen.findByTestId("landing-footer-credit")
        const repoLink = await screen.findByRole("link", {
            name: /ver o repositório do lumitrack no github/i,
        })
        expect(creditBar).toContainElement(repoLink)
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

    // Canal de comunicação com o titular (LGPD Art. 18) — precisa estar
    // visível a quem ainda não tem conta.
    it("publica o canal de privacidade (mailto)", async () => {
        renderWithProviders(<LandingPage />)

        const privacyLink = await screen.findByRole("link", { name: PRIVACY_CONTACT_EMAIL })
        expect(privacyLink).toHaveAttribute("href", `mailto:${PRIVACY_CONTACT_EMAIL}`)
    })
})

describe("LandingPage — bandeira tarifária vigente (#143)", () => {
    it("mostra a bandeira real vinda da API no painel ao vivo", async () => {
        renderWithProviders(<LandingPage />)

        expect(await screen.findByText("Bandeira Verde")).toBeInTheDocument()
        expect(screen.getByText("sem acréscimo")).toBeInTheDocument()
    })

    it("mostra o valor de acréscimo formatado quando a bandeira não é verde", async () => {
        vi.mocked(useTariffFlag).mockReturnValue({
            data: { ...mockTariffFlagConfig, currentFlag: "YELLOW" },
            isLoading: false,
            isError: false,
        } as ReturnType<typeof useTariffFlag>)

        renderWithProviders(<LandingPage />)

        expect(await screen.findByText("Bandeira Amarela")).toBeInTheDocument()
        expect(screen.getByText(/\+ R\$\s?1,89\s?\/ 100 kWh/)).toBeInTheDocument()
    })

    it("não mostra a tag de bandeira enquanto carrega ou em erro", async () => {
        vi.mocked(useTariffFlag).mockReturnValue({
            data: undefined,
            isLoading: false,
            isError: true,
        } as ReturnType<typeof useTariffFlag>)

        renderWithProviders(<LandingPage />)

        await screen.findByTestId("landing-live-panel")
        expect(screen.queryByText(/^Bandeira /)).not.toBeInTheDocument()
    })
})
