import { useQuery } from "@tanstack/react-query"
import { meterReadingService } from "@/services/meterReading.service"
import { queryKeys } from "@/lib/queryClient"
import {
    buildDenseWindowBuckets,
    startOfSaoPauloPeriod,
    type PowerBucket,
} from "@/lib/realtimePowerBuckets"
import type { RealtimeWindow } from "@/components/realtime/RealtimeWindowToggle"
import type { TargetType } from "@/types/meter.types"

const REFETCH_INTERVAL_MS = 30_000

const GRANULARITY_BY_WINDOW: Record<RealtimeWindow, "minute" | "hour"> = {
    "1h": "minute",
    "24h": "hour",
}

/**
 * Histórico do gráfico "Consumo em tempo real" (issue #211) — busca
 * `/api/meter-readings` (baldes já persistidos, não o buffer de SSE do
 * navegador) e monta a série densa/zero-preenchida via
 * `buildDenseWindowBuckets`. `Date.now()` é lícito aqui dentro do `queryFn`
 * (não é corpo de render); `refetchInterval` é quem mantém o gráfico
 * atualizado quando um novo minuto/hora fecha — não depende do SSE pra
 * saber que há dado novo.
 *
 * `meterId` não entra na chamada (a API resolve o medidor por
 * targetType/targetId, igual `/api/consumption`) — só faz parte do gate de
 * `enabled`, pra não disparar a busca antes de o chamador confirmar que o
 * alvo tem medidor vinculado.
 */
export const useMeterReadingHistory = (
    targetType: TargetType,
    targetId: string | undefined,
    meterId: string | undefined,
    window: RealtimeWindow,
) =>
    useQuery({
        queryKey: queryKeys.meterReadings.history(targetType, targetId ?? "", window),
        queryFn: async (): Promise<PowerBucket[]> => {
            const now = Date.now()
            const from = startOfSaoPauloPeriod(now, window)

            const { items } = await meterReadingService.list({
                targetType,
                targetId: targetId!,
                granularity: GRANULARITY_BY_WINDOW[window],
                from: new Date(from).toISOString(),
                to: new Date(now).toISOString(),
            })

            const sparseBuckets = items.map((item) => ({
                bucketStart: new Date(item.bucketStart).getTime(),
                avgPowerW: item.avgPowerW,
            }))

            return buildDenseWindowBuckets(sparseBuckets, window, now)
        },
        enabled: Boolean(targetId) && Boolean(meterId),
        refetchInterval: REFETCH_INTERVAL_MS,
    })
