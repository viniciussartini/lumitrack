import { POWER_QUALITY_QUANTITIES, type PowerQualityStats } from "@/modules/meter/meter-quality.js"
import type { ReportBase, ReportDocument } from "@/modules/report/report.types.js"
import { formatLocalDay } from "@/modules/report/generators/format.js"

const PHASE_LABELS = ["A", "B", "C"] as const

const quantityHeader = (label: string, unit: string): string =>
    unit === "" ? label : `${label} (${unit})`

/**
 * Relatório de qualidade de energia: mínimo, média e máximo de cada grandeza
 * por fase no período, e a média diária de cada grandeza. Grandeza que o
 * medidor não fornece aparece como ausente, nunca como zero.
 *
 * @param base - Cabeçalho comum do relatório.
 * @param stats - Estatísticas do período e médias diárias.
 */
export function buildPowerQualityDocument(
    base: ReportBase,
    stats: PowerQualityStats,
): ReportDocument {
    const periodRows = POWER_QUALITY_QUANTITIES.flatMap((quantity) =>
        quantity.columns.map((name, i) => {
            const stat = stats.period[name]
            const digits = quantity.fractionDigits
            return [
                quantityHeader(quantity.label, quantity.unit),
                quantity.columns.length === 1 ? "-" : (PHASE_LABELS[i] ?? "-"),
                { value: stat?.min ?? null, digits },
                { value: stat?.avg ?? null, digits },
                { value: stat?.max ?? null, digits },
            ]
        }),
    )

    return {
        ...base,
        summary: [{ label: "Dias com leituras", value: stats.daily.length }],
        tables: [
            {
                title: "Resumo do período por fase",
                columns: [
                    { header: "Grandeza", align: "left" },
                    { header: "Fase", align: "left" },
                    { header: "Mínimo", align: "right" },
                    { header: "Média", align: "right" },
                    { header: "Máximo", align: "right" },
                ],
                rows: periodRows,
                emptyNote: "Sem leituras no período.",
            },
            {
                title: "Média diária",
                columns: [
                    { header: "Dia", align: "left" },
                    ...POWER_QUALITY_QUANTITIES.map((quantity) => ({
                        header: quantityHeader(quantity.label, quantity.unit),
                        align: "right" as const,
                    })),
                ],
                rows: stats.daily.map((row) => [
                    formatLocalDay(row.day),
                    ...POWER_QUALITY_QUANTITIES.map((quantity) => ({
                        value: row.averages[quantity.key] ?? null,
                        digits: quantity.fractionDigits,
                    })),
                ]),
                emptyNote: "Sem leituras no período.",
            },
        ],
        notes: [
            "Médias ponderadas pelo tempo coberto por cada leitura de minuto; na tabela diária, cada grandeza trifásica é a média das fases com dado.",
            "O traço (-) indica grandeza que o medidor não fornece.",
        ],
    }
}
