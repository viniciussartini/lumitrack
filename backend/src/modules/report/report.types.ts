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

/** Cabeçalho comum a todos os relatórios: o que foi pedido, para quem e quando. */
export interface ReportBase {
    type: ReportType
    generatedAt: Date
    target: { kind: "Propriedade" | "Área" | "Dispositivo"; name: string }
    property: { name: string; distributorName: string | null; tariffLabel: string }
    period: { from: Date; to: Date }
}

/**
 * Tudo que um gerador precisa para desenhar o relatório de consumo ou o
 * mensal — já agregado e resolvido, para os geradores serem funções puras
 * (sem banco).
 */
export interface ReportData extends ReportBase {
    kpis: ReportKpis
    daily: ReportDailyRow[]
    children: { kind: "Ambientes" | "Dispositivos"; rows: ReportChildRow[] } | null
    monthly: ReportMonthlyExtras | null
}

/** Coluna de uma tabela de {@link ReportDocument}. */
export interface ReportTableColumn {
    header: string
    align: "left" | "right"
}

/** Número com as casas decimais de exibição; o PDF formata, o CSV leva o valor cru. */
export interface ReportNumber {
    value: number | null
    digits: number
}

/** Célula: texto já formatado, número ou ausência (`null`, `-` tanto no PDF quanto no CSV). */
export type ReportCell = string | number | ReportNumber | null

export interface ReportTable {
    title: string
    columns: ReportTableColumn[]
    rows: ReportCell[][]
    /** Texto quando não há linhas. */
    emptyNote: string
}

/** Linha de resumo (rótulo e valor) de um {@link ReportDocument}. */
export interface ReportSummaryLine {
    label: string
    value: ReportCell
}

/**
 * Relatório genérico de resumo mais tabelas — o formato dos tipos alertas,
 * qualidade de energia e demanda, que não têm os indicadores de consumo.
 */
export interface ReportDocument extends ReportBase {
    summary: ReportSummaryLine[]
    tables: ReportTable[]
    /** Observações de leitura do relatório, ao final. */
    notes: string[]
}

/** Qualquer coisa que os geradores de PDF e CSV sabem desenhar. */
export type ReportContent = ReportData | ReportDocument

export function isReportDocument(content: ReportContent): content is ReportDocument {
    return "tables" in content
}
