import { useMutation } from "@tanstack/react-query"
import { reportService } from "@/services/report.service"
import type { CreateReportInput, Report, ReportFile } from "@/types/report.types"

/**
 * Mutations de relatório. Sem toast nem invalidação de cache aqui: a página
 * decide o feedback (e o histórico, que ainda não existe, é quem vai
 * precisar invalidar a lista).
 */

export const useGenerateReport = () =>
    useMutation<Report, Error, CreateReportInput>({
        mutationFn: (input) => reportService.create(input),
    })

export const useDownloadReport = () =>
    useMutation<ReportFile, Error, Pick<Report, "id" | "fileName">>({
        mutationFn: (report) => reportService.download(report),
    })
