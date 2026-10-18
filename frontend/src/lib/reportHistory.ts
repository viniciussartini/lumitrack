import { REPORT_TYPE_LABELS, usesMonthPeriod } from "@/lib/reportForm"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import type { Report, ReportOrigin } from "@/types/report.types"

const SAO_PAULO_TZ = "America/Sao_Paulo"

const ORIGIN_LABELS: Record<ReportOrigin, string> = {
    MANUAL: "Geração manual",
    SCHEDULED: "Envio agendado",
}

/** Rótulo do alvo quando ele já não existe no cadastro (relatório é imutável, o alvo não). */
export const REMOVED_TARGET_LABEL = "Alvo removido"

const formatDay = (instant: Date): string =>
    instant.toLocaleDateString("pt-BR", { timeZone: SAO_PAULO_TZ })

/**
 * Período do relatório para exibição: os de mês (mensal e demanda) mostram o
 * mês ("julho de 2026"), os demais mostram o intervalo. O fim do banco é exclusivo, então
 * o último dia é o instante anterior.
 */
export function formatReportPeriod(report: Pick<Report, "type" | "periodStart" | "periodEnd">) {
    const start = new Date(report.periodStart)
    if (usesMonthPeriod(report.type)) {
        return start.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: SAO_PAULO_TZ,
        })
    }
    const lastDay = new Date(new Date(report.periodEnd).getTime() - 1)
    return `${formatDay(start)} a ${formatDay(lastDay)}`
}

/** Chave `TIPO:id` que liga um relatório ao alvo listado no cadastro. */
const targetKey = (report: Pick<Report, "targetType" | "targetId">): string =>
    `${report.targetType}:${report.targetId}`

/** Índice alvo → rótulo, a partir das opções já carregadas do cadastro. */
export function buildTargetLabelIndex(groups: CompareTargetGroup[]): Map<string, string> {
    return new Map(groups.flatMap((group) => group.options.map((o) => [o.key, o.label])))
}

export interface ReportRowView {
    title: string
    subtitle: string
    createdAt: string
}

/**
 * Textos de uma linha do histórico. O relatório guarda só o id do alvo (sem
 * chave estrangeira), então o nome vem do cadastro atual.
 *
 * @param report - Metadados do relatório.
 * @param targetLabels - Índice de {@link buildTargetLabelIndex}.
 */
export function describeReport(report: Report, targetLabels: Map<string, string>): ReportRowView {
    const target = targetLabels.get(targetKey(report)) ?? REMOVED_TARGET_LABEL
    return {
        title: `${REPORT_TYPE_LABELS[report.type]} · ${target} · ${formatReportPeriod(report)}`,
        subtitle: `${ORIGIN_LABELS[report.origin]} · ${report.format}`,
        createdAt: new Date(report.createdAt).toLocaleString("pt-BR", { timeZone: SAO_PAULO_TZ }),
    }
}
