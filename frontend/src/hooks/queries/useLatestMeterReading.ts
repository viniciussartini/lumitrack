import { useQuery } from "@tanstack/react-query"
import { meterReadingService } from "@/services/meterReading.service"
import { queryKeys } from "@/lib/queryClient"
import type { TargetType } from "@/types/meter.types"

const FALLBACK_WINDOW_MS = 15 * 60_000
const REFETCH_INTERVAL_MS = 30_000

/**
 * Potência do balde por minuto mais recente já persistido — fallback para
 * quando o SSE ainda não entregou nenhuma leitura deste alvo (aba recém-
 * aberta, medidor que demora a reportar). Só a potência: tensão, corrente e
 * fator de potência existem apenas na amostra instantânea do SSE, nunca no
 * agregado por minuto.
 */
export const useLatestMeterReading = (
    targetType: TargetType,
    targetId: string | undefined,
    enabled: boolean,
) =>
    useQuery({
        queryKey: queryKeys.meterReadings.latest(targetType, targetId ?? ""),
        queryFn: async (): Promise<number | undefined> => {
            const now = Date.now()
            const { items } = await meterReadingService.list({
                targetType,
                targetId: targetId!,
                granularity: "minute",
                from: new Date(now - FALLBACK_WINDOW_MS).toISOString(),
                to: new Date(now).toISOString(),
            })

            if (items.length === 0) return undefined

            const mostRecent = items.reduce((latest, item) =>
                new Date(item.bucketStart) > new Date(latest.bucketStart) ? item : latest,
            )
            return mostRecent.avgPowerW
        },
        enabled: enabled && Boolean(targetId),
        refetchInterval: REFETCH_INTERVAL_MS,
    })
