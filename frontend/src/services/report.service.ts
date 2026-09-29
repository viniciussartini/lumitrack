import { api } from "@/services/api"
import type { CreateReportInput, Report, ReportFile } from "@/types/report.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/** Camada de acesso a `/api/reports` — emissão sob demanda e download. */
export const reportService = {
    create: async (input: CreateReportInput): Promise<Report> => {
        const { data } = await api.post<ApiEnvelope<Report>>("/reports", input)
        return data.data
    },

    /**
     * Baixa o arquivo de um relatório. O nome vem do relatório emitido
     * (gerado no servidor) — nunca é montado a partir de texto do usuário.
     *
     * @param report - Id e nome do arquivo do relatório a baixar.
     * @returns O nome do arquivo e seu conteúdo binário.
     */
    download: async (report: Pick<Report, "id" | "fileName">): Promise<ReportFile> => {
        const { data } = await api.get<Blob>(`/reports/${report.id}/download`, {
            responseType: "blob",
        })
        return { fileName: report.fileName, blob: data }
    },
}
