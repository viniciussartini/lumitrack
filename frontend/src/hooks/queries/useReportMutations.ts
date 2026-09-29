import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { downloadFile } from "@/lib/download/downloadFile"
import { queryKeys } from "@/lib/queryClient"
import { extractErrorMessage } from "@/services/api"
import { reportService } from "@/services/report.service"
import type { CreateReportInput, Report } from "@/types/report.types"

/**
 * Mutations de relatório. Emitir e excluir invalidam o histórico; o download
 * dispara o arquivo no navegador e avisa quando falha, para os dois pontos de
 * download (relatório recém-gerado e histórico) se comportarem igual.
 */

export const useGenerateReport = () => {
    const queryClient = useQueryClient()

    return useMutation<Report, Error, CreateReportInput>({
        mutationFn: (input) => reportService.create(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all })
        },
    })
}

export const useDownloadReport = () =>
    useMutation<
        Awaited<ReturnType<typeof reportService.download>>,
        Error,
        Pick<Report, "id" | "fileName">
    >({
        mutationFn: (report) => reportService.download(report),
        onSuccess: ({ fileName, blob }) => downloadFile(fileName, blob.type, blob),
        onError: (error) =>
            toast.error("Não foi possível baixar o relatório", {
                description: extractErrorMessage(error),
            }),
    })

export const useDeleteReport = () => {
    const queryClient = useQueryClient()

    return useMutation<void, Error, string>({
        mutationFn: (id) => reportService.remove(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all })
            toast.success("Relatório excluído")
        },
    })
}
