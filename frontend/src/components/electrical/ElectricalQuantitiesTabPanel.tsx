import { SeriesAnalysisSection } from "@/components/analysis/SeriesAnalysisSection"
import { ElectricalQuantitiesGrid } from "@/components/electrical/ElectricalQuantitiesGrid"
import { ANALYSIS_SECTION_PANEL_IDS, ANALYSIS_SECTION_TAB_IDS } from "@/lib/analysisSection"
import type { TargetType } from "@/types/meter.types"

interface ElectricalQuantitiesTabPanelProps {
    targetType: TargetType
    targetId: string
    targetName: string
    meterId: string | undefined
    isMeterLoading: boolean
    isMeterError: boolean
}

/**
 * Conteúdo inteiro da aba "Grandezas Elétricas" (`role="tabpanel"` +
 * `ElectricalQuantitiesGrid` + `SeriesAnalysisSection`) — idêntico nas 3
 * details pages de Análise (Propriedade/Área/Dispositivo), variando só o
 * alvo; extraído para não triplicar o mesmo bloco. A área de análise só
 * aparece com medidor vinculado (sem ele, o endpoint sempre devolveria 404).
 */
export const ElectricalQuantitiesTabPanel = ({
    targetType,
    targetId,
    targetName,
    meterId,
    isMeterLoading,
    isMeterError,
}: ElectricalQuantitiesTabPanelProps) => (
    <div
        role="tabpanel"
        id={ANALYSIS_SECTION_PANEL_IDS.grandezas}
        aria-labelledby={ANALYSIS_SECTION_TAB_IDS.grandezas}
        className="flex flex-col gap-5"
    >
        <ElectricalQuantitiesGrid
            meterId={meterId}
            isMeterLoading={isMeterLoading}
            isMeterError={isMeterError}
        />
        {meterId && (
            <SeriesAnalysisSection
                targetType={targetType}
                targetId={targetId}
                targetName={targetName}
            />
        )}
    </div>
)
