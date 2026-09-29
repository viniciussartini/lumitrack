import type { ReportType } from "@/modules/report/report.schema.js"

export interface ReportDailyRow {
    /** Dia local de São Paulo, lido pelos getters UTC (convenção dos baldes de consumo). */
    day: Date
    kwhConsumed: number
    avgPowerW: number
}

export interface ReportChildRow {
    name: string
    /** `null` quando o filho não tem medidor vinculado — ausência, não zero. */
    kwhConsumed: number | null
    /** Participação no total do alvo, em %; `null` quando não calculável. */
    sharePercent: number | null
}

export interface ReportKpis {
    totalKwh: number
    /** Total dividido pelos dias já transcorridos do período. */
    averageDailyKwh: number
    peakDay: { day: Date; kwhConsumed: number } | null
}

/** Só existe no relatório mensal. */
export interface ReportMonthlyExtras {
    /** `null` quando o custo não é calculável para o alvo (ex.: sub-nível do Grupo A). */
    costBrl: number | null
    previousMonthKwh: number
    /** Variação sobre o mês anterior, em %; `null` quando o mês anterior não tem consumo. */
    variationPercent: number | null
}

/**
 * Tudo que um gerador precisa para desenhar o arquivo — já agregado e
 * resolvido, para os geradores serem funções puras (sem banco).
 */
export interface ReportData {
    type: ReportType
    generatedAt: Date
    target: { kind: "Propriedade" | "Área" | "Dispositivo"; name: string }
    property: { name: string; distributorName: string | null; tariffLabel: string }
    period: { from: Date; to: Date }
    kpis: ReportKpis
    daily: ReportDailyRow[]
    children: { kind: "Ambientes" | "Dispositivos"; rows: ReportChildRow[] } | null
    monthly: ReportMonthlyExtras | null
}
