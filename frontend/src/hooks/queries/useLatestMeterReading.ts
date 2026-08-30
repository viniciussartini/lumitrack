import { skipToken, useQuery } from "@tanstack/react-query"
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
 * agregado por minuto. Exige `meterId` mesmo sem usá-lo na chamada (a API
 * resolve o medidor por `targetType`/`targetId`) — sem essa exigência, um
 * alvo sem NENHUM medidor vinculado ficaria fazendo poll deste endpoint
 * indefinidamente a cada 30s, já que a ausência de leitura SSE também conta
 * como "obsoleto" e habilitaria o fallback pra sempre.
 */
export const useLatestMeterReading = (
    targetType: TargetType,
    targetId: string | undefined,
    meterId: string | undefined,
    enabled: boolean,
) =>
    useQuery({
        queryKey: queryKeys.meterReadings.latest(targetType, targetId ?? ""),
        // `null`, não `undefined`: o TanStack Query trata `undefined` vindo
        // do `queryFn` como erro de contrato (query nunca "resolve" um
        // resultado válido) — `null` é o jeito correto de dizer "busquei e
        // não achei nada".
        // `skipToken` em vez de uma flag `enabled` separada: a checagem de
        // `targetId`/`meterId` acontece uma única vez, aqui, e o TypeScript
        // já sabe dentro deste branch que os dois são `string` — sem isso,
        // a chamada abaixo precisaria de `targetId!` (asserção manual,
        // silenciosamente errada se a condição de habilitação um dia
        // divergir da checagem de tipo).
        queryFn:
            enabled && targetId && meterId
                ? async (): Promise<number | null> => {
                      const now = Date.now()
                      const { items } = await meterReadingService.list({
                          targetType,
                          targetId,
                          granularity: "minute",
                          from: new Date(now - FALLBACK_WINDOW_MS).toISOString(),
                          to: new Date(now).toISOString(),
                      })

                      if (items.length === 0) return null

                      const mostRecent = items.reduce((latest, item) =>
                          new Date(item.bucketStart) > new Date(latest.bucketStart) ? item : latest,
                      )
                      return mostRecent.avgPowerW
                  }
                : skipToken,
        // Sem teto de tentativas: um alvo com medidor vinculado mas sem
        // NENHUM minuto persistido ainda faz poll indefinidamente. Aceito
        // por ora — o cenário mais comum de poll sem propósito (alvo sem
        // medidor nenhum) já é coberto pelo gate de `meterId` acima; medidor
        // vinculado que nunca reportou é mais raro e se resolve sozinho
        // assim que a primeira leitura for persistida.
        refetchInterval: REFETCH_INTERVAL_MS,
    })
