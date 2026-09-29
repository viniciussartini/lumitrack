import { api } from "@/services/api"
import type { Paginated, PaginationParams } from "@/types/pagination.types"
import type { ReportSchedule, ReportScheduleInput } from "@/types/report.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/** Camada de acesso a `/api/report-schedules` — configurações de envio automático de relatório. */
export const reportScheduleService = {
    /**
     * Configurações do usuário, mais antigas primeiro.
     *
     * @param params - Página e tamanho da página.
     * @returns A página de configurações, cada uma com a próxima execução.
     */
    list: async (params: PaginationParams): Promise<Paginated<ReportSchedule>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<ReportSchedule>>>(
            "/report-schedules",
            { params },
        )
        return data.data
    },

    /**
     * Cria uma configuração.
     *
     * @param input - Corpo da configuração.
     * @returns A configuração criada.
     */
    create: async (input: ReportScheduleInput): Promise<ReportSchedule> => {
        const { data } = await api.post<ApiEnvelope<ReportSchedule>>("/report-schedules", input)
        return data.data
    },

    /**
     * Substitui uma configuração inteira.
     *
     * @param id - Id da configuração.
     * @param input - Novo corpo, completo.
     * @returns A configuração atualizada.
     */
    update: async (id: string, input: ReportScheduleInput): Promise<ReportSchedule> => {
        const { data } = await api.put<ApiEnvelope<ReportSchedule>>(
            `/report-schedules/${id}`,
            input,
        )
        return data.data
    },

    /**
     * Exclui uma configuração.
     *
     * @param id - Id da configuração.
     */
    remove: async (id: string): Promise<void> => {
        await api.delete(`/report-schedules/${id}`)
    },
}
