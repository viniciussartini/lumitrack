import type { TargetType } from "@/types/meter.types"

export type ReportType = "MONTHLY" | "CONSUMPTION"
export type ReportFormat = "PDF" | "CSV"
export type ReportOrigin = "MANUAL" | "SCHEDULED"

/** Metadados de um relatório emitido — o arquivo só sai pelo download. */
export interface Report {
    id: string
    targetType: TargetType
    targetId: string
    type: ReportType
    format: ReportFormat
    origin: ReportOrigin
    periodStart: string
    periodEnd: string
    fileName: string
    sizeBytes: number
    createdAt: string
}

interface CreateReportBase {
    targetType: TargetType
    targetId: string
    format: ReportFormat
}

/** Corpo de `POST /api/reports`: mensal pede o mês, consumo pede o intervalo. */
export type CreateReportInput =
    | (CreateReportBase & { type: "MONTHLY"; month: string })
    | (CreateReportBase & { type: "CONSUMPTION"; from: string; to: string })

export interface ReportFile {
    fileName: string
    blob: Blob
}

export type ReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL"

/** Configuração de envio automático de relatório. */
export interface ReportSchedule {
    id: string
    targetType: TargetType
    targetId: string
    type: ReportType
    format: ReportFormat
    frequency: ReportFrequency
    /** Nulo na frequência diária; 1–7 (segunda a domingo) na semanal; 1–31 nas demais. */
    sendDay: number | null
    recipients: string[]
    active: boolean
    /** Nulo quando a configuração está pausada. */
    nextRunAt: string | null
    createdAt: string
    updatedAt: string
}

/** Corpo de `POST`/`PUT /api/report-schedules` — o PUT substitui a configuração inteira. */
export interface ReportScheduleInput {
    targetType: TargetType
    targetId: string
    type: ReportType
    format: ReportFormat
    frequency: ReportFrequency
    sendDay: number | null
    recipients: string[]
    active: boolean
}
