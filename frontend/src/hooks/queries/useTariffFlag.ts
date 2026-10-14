import { useQuery } from "@tanstack/react-query"
import { tariffFlagService } from "@/services/tariff-flag.service"
import { queryKeys } from "@/lib/queryClient"

/** Bandeira tarifária vigente — config global, sem parâmetros. */
export const useTariffFlag = () =>
    useQuery({
        queryKey: queryKeys.tariffFlag.current(),
        queryFn: tariffFlagService.get,
        // A bandeira muda uma vez por mês.
        staleTime: 60 * 60 * 1000,
    })
