import { useQuery } from "@tanstack/react-query"
import { meterReadingService } from "@/services/meterReading.service"
import { queryKeys } from "@/lib/queryClient"
import type { SeriesRun } from "@/lib/meterReadingSeries"
import type { TargetType } from "@/types/meter.types"

/**
 * Busca `/api/meter-readings/series` para um `run` já submetido pelo
 * formulário da área de análise — `undefined` mantém a query desabilitada
 * (estado "Defina os parâmetros e clique em Gerar análise", antes do
 * primeiro submit).
 */
export const useMeterReadingSeries = (
    targetType: TargetType,
    targetId: string,
    run: SeriesRun | undefined,
) =>
    useQuery({
        queryKey: queryKeys.meterReadings.series(targetType, targetId, run),
        queryFn: () => {
            // `enabled` só liga a query quando `run` está definido —
            // garantido pelo caller, nunca undefined quando isto executa.
            const currentRun = run!
            return meterReadingService.series({
                targetType,
                targetId,
                metric: currentRun.metric,
                window: currentRun.window,
                day: currentRun.day,
                hour: currentRun.window === "hora" ? currentRun.hour : undefined,
                aggregationMinutes:
                    currentRun.window === "hora" ? currentRun.aggregationMinutes : undefined,
            })
        },
        enabled: run !== undefined,
    })
