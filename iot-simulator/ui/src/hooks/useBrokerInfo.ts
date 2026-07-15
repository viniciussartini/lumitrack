import { useQuery } from "@tanstack/react-query"
import { api } from "@/services/api"

export function useBrokerInfo() {
    return useQuery({
        queryKey: ["broker-info"],
        queryFn: api.getBrokerInfo,
        staleTime: Infinity, // host:port não muda em runtime
    })
}
