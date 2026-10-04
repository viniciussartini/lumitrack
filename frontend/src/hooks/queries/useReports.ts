import { useQuery } from "@tanstack/react-query"
import { reportService } from "@/services/report.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"

/** Histórico paginado de relatórios emitidos pelo usuário. */
export const useReports = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.reports.list(page, pageSize),
        queryFn: () => reportService.list({ page, pageSize }),
    })
