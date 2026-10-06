import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryClient"
import { demandService } from "@/services/demand.service"

/** A janela de demanda fecha a cada minuto; reler a cada 60 s mantém o "atual" em dia. */
const REFRESH_INTERVAL_MS = 60_000

/**
 * Demanda atual, máxima do mês e curva do dia da propriedade do Grupo A.
 * Passe `propertyId` indefinido para não consultar (propriedade que não é do Grupo A).
 */
export const useDemandOverview = (propertyId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.demand.overview(propertyId ?? ""),
        queryFn: () => demandService.overview(propertyId!),
        enabled: Boolean(propertyId),
        refetchInterval: REFRESH_INTERVAL_MS,
    })
