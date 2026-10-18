import type { ReportBase, ReportDocument } from "@/modules/report/report.types.js"
import {
    formatDuration,
    formatInstantDateTime,
    formatNumber,
} from "@/modules/report/generators/format.js"

/** Um episódio de disparo de alerta, já com os dados do alerta que o originou. */
export interface AlertEpisode {
    alertName: string
    referencePowerKw: number
    tolerancePercent: number
    startedAt: Date
    endedAt: Date
    durationSeconds: number
    minPowerW: number
    avgPowerW: number
    maxPowerW: number
}

/**
 * Relatório de alertas: resumo do período e uma linha por episódio de disparo.
 *
 * @param base - Cabeçalho comum do relatório.
 * @param episodes - Episódios iniciados no período, do mais antigo ao mais recente.
 */
export function buildAlertsDocument(base: ReportBase, episodes: AlertEpisode[]): ReportDocument {
    const totalSeconds = episodes.reduce((sum, episode) => sum + episode.durationSeconds, 0)
    const peakW = episodes.reduce<number | null>(
        (best, episode) => (best === null || episode.maxPowerW > best ? episode.maxPowerW : best),
        null,
    )

    return {
        ...base,
        summary: [
            { label: "Episódios de disparo", value: episodes.length },
            {
                label: "Tempo total em disparo",
                value: episodes.length === 0 ? null : formatDuration(totalSeconds),
            },
            { label: "Maior potência registrada (W)", value: { value: peakW, digits: 0 } },
        ],
        tables: [
            {
                title: "Episódios de disparo",
                columns: [
                    { header: "Alerta", align: "left" },
                    { header: "Faixa de referência", align: "left" },
                    { header: "Início", align: "left" },
                    { header: "Fim", align: "left" },
                    { header: "Duração", align: "right" },
                    { header: "Mín (W)", align: "right" },
                    { header: "Média (W)", align: "right" },
                    { header: "Máx (W)", align: "right" },
                ],
                rows: episodes.map((episode) => [
                    episode.alertName,
                    `${formatNumber(episode.referencePowerKw, 2)} kW ± ${formatNumber(episode.tolerancePercent, 1)}%`,
                    formatInstantDateTime(episode.startedAt),
                    formatInstantDateTime(episode.endedAt),
                    formatDuration(episode.durationSeconds),
                    { value: episode.minPowerW, digits: 0 },
                    { value: episode.avgPowerW, digits: 0 },
                    { value: episode.maxPowerW, digits: 0 },
                ]),
                emptyNote: "Nenhum episódio de disparo no período.",
            },
        ],
        notes: [
            "Inclui os episódios que começaram no período e já terminaram; um disparo em andamento na hora da emissão aparece só depois de encerrado.",
        ],
    }
}
