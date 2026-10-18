export type AnalysisSection = "consumo" | "grandezas"

/**
 * Ids compartilhados entre `AnalysisSectionTabs` e os `tabpanel`s que cada
 * aba controla — estáticos porque cada details page (Propriedade/Área/
 * Dispositivo) monta no máximo uma instância do seletor por vez, então não
 * há risco de colisão que exigisse `useId()`.
 */
export const ANALYSIS_SECTION_TAB_IDS: Record<AnalysisSection, string> = {
    consumo: "analysis-tab-consumo",
    grandezas: "analysis-tab-grandezas",
}

export const ANALYSIS_SECTION_PANEL_IDS: Record<AnalysisSection, string> = {
    consumo: "analysis-tabpanel-consumo",
    grandezas: "analysis-tabpanel-grandezas",
}
