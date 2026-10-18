import { useQuery } from "@tanstack/react-query"
import { meterReadingService } from "@/services/meterReading.service"
import { queryKeys } from "@/lib/queryClient"
import { buildComparePeriodsParams, type PeriodComparisonRun } from "@/lib/periodComparison"

/**
 * Busca `/api/meter-readings/compare-periods` para uma comparação já
 * submetida pelo formulário do Histórico — `undefined` mantém a query
 * desabilitada (estado de espera, antes do primeiro "Criar comparação").
 */
export const useMeterReadingComparePeriods = (run: PeriodComparisonRun | undefined) =>
    useQuery({
        queryKey: queryKeys.meterReadings.comparePeriods(run),
        // `enabled` só liga a query quando `run` está definido — nunca
        // undefined quando isto executa.
        queryFn: () => meterReadingService.comparePeriods(buildComparePeriodsParams(run!)),
        enabled: run !== undefined,
    })
