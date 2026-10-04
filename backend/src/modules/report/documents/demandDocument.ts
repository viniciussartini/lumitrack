import type { ReportBase, ReportDocument } from "@/modules/report/report.types.js"
import { formatInstantDateTime, formatPeriodLabel } from "@/modules/report/generators/format.js"

/** Demanda de um posto tarifário no mês: contratada contra medida. */
export interface DemandRow {
    postLabel: string
    contractedKw: number
    /** `null` quando o mês não tem nenhuma janela completa medida para o posto. */
    measuredKw: number | null
    /** Fim da janela de 15 minutos do pico. */
    peakAt: Date | null
}

const round = (value: number, digits: number): number => {
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

/**
 * Relatório de demanda do mês: por posto, a demanda medida contra a
 * contratada, o percentual usado e se houve ultrapassagem.
 *
 * @param base - Cabeçalho comum do relatório.
 * @param modalityLabel - Modalidade tarifária (Verde ou Azul).
 * @param rows - Uma linha por demanda contratada.
 */
export function buildDemandDocument(
    base: ReportBase,
    modalityLabel: string,
    rows: DemandRow[],
): ReportDocument {
    const exceeded = rows.filter(
        (row) => row.measuredKw !== null && row.measuredKw > row.contractedKw,
    )

    return {
        ...base,
        summary: [
            {
                label: "Mês de referência",
                value: formatPeriodLabel(base.period.from, base.period.to),
            },
            { label: "Modalidade", value: modalityLabel },
            { label: "Postos com ultrapassagem", value: exceeded.length },
        ],
        tables: [
            {
                title: "Demanda contratada e medida",
                columns: [
                    { header: "Posto", align: "left" },
                    { header: "Contratada (kW)", align: "right" },
                    { header: "Medida (kW)", align: "right" },
                    { header: "Utilizado (%)", align: "right" },
                    { header: "Situação", align: "left" },
                    { header: "Pico em", align: "left" },
                ],
                rows: rows.map((row) => [
                    row.postLabel,
                    { value: row.contractedKw, digits: 1 },
                    { value: row.measuredKw === null ? null : round(row.measuredKw, 1), digits: 1 },
                    {
                        value:
                            row.measuredKw === null || row.contractedKw <= 0
                                ? null
                                : round((row.measuredKw / row.contractedKw) * 100, 1),
                        digits: 1,
                    },
                    row.measuredKw === null
                        ? null
                        : row.measuredKw > row.contractedKw
                          ? "Ultrapassou"
                          : "Dentro do contratado",
                    row.peakAt ? formatInstantDateTime(row.peakAt) : null,
                ]),
                emptyNote: "Nenhuma demanda contratada cadastrada.",
            },
        ],
        notes: [
            "A demanda medida é a maior potência média de uma janela de 15 minutos no mês, por posto.",
            "O traço (-) indica mês sem janela completa medida.",
        ],
    }
}
