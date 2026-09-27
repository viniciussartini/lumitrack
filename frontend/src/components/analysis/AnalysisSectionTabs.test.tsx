import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AnalysisSectionTabs } from "@/components/analysis/AnalysisSectionTabs"
import { ANALYSIS_SECTION_PANEL_IDS, ANALYSIS_SECTION_TAB_IDS } from "@/lib/analysisSection"

describe("AnalysisSectionTabs", () => {
    it("expõe role=tablist com as duas abas, cada uma role=tab", () => {
        render(<AnalysisSectionTabs value="consumo" onChange={vi.fn()} />)

        expect(screen.getByRole("tablist", { name: "Modo de análise" })).toBeInTheDocument()
        const tabs = screen.getAllByRole("tab")
        expect(tabs).toHaveLength(2)
        expect(screen.getByRole("tab", { name: /Consumo e Custos/i })).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: /Grandezas Elétricas/i })).toBeInTheDocument()
    })

    it("marca a aba ativa com aria-selected e liga só ela ao seu tabpanel via aria-controls", () => {
        render(<AnalysisSectionTabs value="grandezas" onChange={vi.fn()} />)

        const consumoTab = screen.getByRole("tab", { name: /Consumo e Custos/i })
        const grandezasTab = screen.getByRole("tab", { name: /Grandezas Elétricas/i })

        expect(consumoTab).toHaveAttribute("aria-selected", "false")
        expect(grandezasTab).toHaveAttribute("aria-selected", "true")
        // Só a aba ativa aponta para um tabpanel — o da inativa não está no
        // DOM (quem renderiza monta só a seção corrente).
        expect(consumoTab).not.toHaveAttribute("aria-controls")
        expect(grandezasTab).toHaveAttribute("aria-controls", ANALYSIS_SECTION_PANEL_IDS.grandezas)
        expect(consumoTab.id).toBe(ANALYSIS_SECTION_TAB_IDS.consumo)
    })

    it("navegável por teclado: Tab + Enter aciona a troca de seção", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AnalysisSectionTabs value="consumo" onChange={onChange} />)

        await user.tab()
        expect(screen.getByRole("tab", { name: /Consumo e Custos/i })).toHaveFocus()
        await user.tab()
        expect(screen.getByRole("tab", { name: /Grandezas Elétricas/i })).toHaveFocus()
        await user.keyboard("{Enter}")

        expect(onChange).toHaveBeenCalledWith("grandezas")
    })

    it("clicar na aba inativa chama onChange com a chave certa", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AnalysisSectionTabs value="consumo" onChange={onChange} />)

        await user.click(screen.getByRole("tab", { name: /Grandezas Elétricas/i }))

        expect(onChange).toHaveBeenCalledWith("grandezas")
    })
})
