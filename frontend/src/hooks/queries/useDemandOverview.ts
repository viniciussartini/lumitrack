import { skipToken, useQuery, type Query } from "@tanstack/react-query"
import axios from "axios"
import { queryKeys } from "@/lib/queryClient"
import { demandService } from "@/services/demand.service"

/** A janela de demanda fecha a cada minuto; reler a cada 60 s mantém o "atual" em dia. */
const REFRESH_INTERVAL_MS = 60_000

/**
 * Para de reler depois de um erro: sem medidor (404) e contrato sem apuração
 * (422) não mudam sozinhos, e reler a cada minuto só repetiria a falha.
 */
export const demandRefetchInterval = (
    query: Pick<Query, "state"> | { state: { status: string } },
) => (query.state.status === "error" ? false : REFRESH_INTERVAL_MS)

/** Repete uma vez a falha de rede ou de servidor; resposta 4xx não muda e não é repetida. */
export const demandRetry = (failureCount: number, error: unknown): boolean => {
    if (axios.isAxiosError(error) && (error.response?.status ?? 500) < 500) return false
    return failureCount < 1
}

/**
 * Demanda atual, máxima do mês e curva do dia da propriedade do Grupo A.
 * Passe `propertyId` indefinido para não consultar (propriedade que não é do Grupo A).
 */
export const useDemandOverview = (propertyId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.demand.overview(propertyId ?? ""),
        queryFn: propertyId ? () => demandService.overview(propertyId) : skipToken,
        refetchInterval: demandRefetchInterval,
        retry: demandRetry,
    })
