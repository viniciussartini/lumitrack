import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/queryClient"
import { reportScheduleService } from "@/services/report-schedule.service"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { ReportSchedule, ReportScheduleInput } from "@/types/report.types"

/** Configurações de envio automático do usuário, paginadas. */
export const useReportSchedules = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.reportSchedules.list(page, pageSize),
        queryFn: () => reportScheduleService.list({ page, pageSize }),
    })

/**
 * Mutations das configurações de envio. Todas invalidam a lista (a próxima
 * execução é calculada no servidor) e avisam o sucesso; o erro fica com a
 * página, que decide a mensagem.
 */

export const useCreateReportSchedule = () => {
    const queryClient = useQueryClient()

    return useMutation<ReportSchedule, Error, ReportScheduleInput>({
        mutationFn: (input) => reportScheduleService.create(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reportSchedules.all })
            toast.success("Configuração salva")
        },
    })
}

interface UpdateVariables {
    id: string
    input: ReportScheduleInput
}

export const useUpdateReportSchedule = () => {
    const queryClient = useQueryClient()

    return useMutation<ReportSchedule, Error, UpdateVariables>({
        mutationFn: ({ id, input }) => reportScheduleService.update(id, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reportSchedules.all })
            toast.success("Configuração atualizada")
        },
    })
}

export const useDeleteReportSchedule = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => reportScheduleService.remove(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reportSchedules.all })
            toast.success("Configuração excluída")
        },
    })
}
