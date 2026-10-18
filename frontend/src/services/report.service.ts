import { api } from "@/services/api"
import type { Paginated, PaginationParams } from "@/types/pagination.types"
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
     * Histórico de relatórios do usuário, mais recentes primeiro.
     *
     * @param params - Página e tamanho da página.
     * @returns A página de metadados (sem o conteúdo dos arquivos).
     */
    list: async (params: PaginationParams): Promise<Paginated<Report>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<Report>>>("/reports", { params })
        return data.data
    },

    /**
     * Exclui um relatório, junto com o arquivo.
     *
     * @param id - Id do relatório.
     */
    remove: async (id: string): Promise<void> => {
        await api.delete(`/reports/${id}`)
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
