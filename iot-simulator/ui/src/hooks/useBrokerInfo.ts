import { useQuery } from "@tanstack/react-query"
import { api } from "@/services/api"

/**
 * Busca host/porta do broker MQTT embutido — nunca muda em runtime.
 *
 * @returns O resultado da query (host/porta do broker).
 */
export function useBrokerInfo() {
    return useQuery({
        queryKey: ["broker-info"],
        queryFn: api.getBrokerInfo,
        staleTime: Infinity, // host:port não muda em runtime
    })
}
