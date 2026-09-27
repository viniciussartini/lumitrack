import { LineChart, Zap } from "lucide-react"
import {
    ANALYSIS_SECTION_PANEL_IDS,
    ANALYSIS_SECTION_TAB_IDS,
    type AnalysisSection,
} from "@/lib/analysisSection"

const SECTIONS: { key: AnalysisSection; label: string; icon: typeof LineChart }[] = [
    { key: "consumo", label: "Consumo e Custos", icon: LineChart },
    { key: "grandezas", label: "Grandezas Elétricas", icon: Zap },
]

interface AnalysisSectionTabsProps {
    value: AnalysisSection
    onChange: (next: AnalysisSection) => void
}

/**
 * Seletor de seção nas details pages de Análise (LumiTrack Home v2.dc.html,
 * bloco `anTabsVisible`) — primeira aparição de abas de SEÇÃO no produto
 * (troca o conteúdo inteiro da página, não uma granularidade dentro dele
 * como `GranularityTabs`). Mesmo padrão visual/acessível (`role="tablist"`,
 * `lt-selbtn`, `data-on`), com o trio completo `role="tablist"`/`tab`/
 * `tabpanel`, que `GranularityTabs` não precisou até aqui.
 *
 * `aria-controls` só vai na aba ativa: quem renderiza o `tabpanel` monta só
 * o da seção corrente (a inativa não busca dado nem existe no DOM), então
 * apontar a aba inativa para um id inexistente violaria o próprio contrato
 * do atributo.
 */
export const AnalysisSectionTabs = ({ value, onChange }: AnalysisSectionTabsProps) => (
    <div role="tablist" aria-label="Modo de análise" className="flex flex-wrap gap-2">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
            const isActive = value === key
            return (
                <button
                    key={key}
                    type="button"
                    role="tab"
                    id={ANALYSIS_SECTION_TAB_IDS[key]}
                    aria-selected={isActive}
                    aria-controls={isActive ? ANALYSIS_SECTION_PANEL_IDS[key] : undefined}
                    data-on={isActive}
                    onClick={() => onChange(key)}
                    data-testid={`analysis-section-tab-${key}`}
                    className="lt-selbtn text-13 inline-flex min-h-10 items-center gap-2 px-4"
                >
                    <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    {label}
                </button>
            )
        })}
    </div>
)
