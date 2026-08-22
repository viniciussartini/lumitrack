import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { meterReadingService } from "@/services/meterReading.service"
import { queryKeys } from "@/lib/queryClient"
import {
    buildDenseWindowBuckets,
    startOfSaoPauloPeriod,
    type PowerBucket,
} from "@/lib/realtimePowerBuckets"
import type { TargetType } from "@/types/meter.types"

const REFETCH_INTERVAL_MS = 30_000

/** Acima disso, o retido é velho demais pra ainda cobrir uma virada de hora
 * normal (folga generosa sobre o pior caso de ~2-3 ciclos de
 * `refetchInterval` até o primeiro minuto da hora nova fechar) — cobre o
 * caso de a aba voltar de segundo plano bem no meio de uma virada, o que sem
 * este limite mostraria dado de minutos/horas atrás sem indicar que está
 * desatualizado. Contado a partir de quando o retido foi CAPTURADO (não do
 * `bucketStart` do balde mais novo nele) — o balde mais novo já nasce até
 * ~2min mais velho que `now` (só minutos já fechados existem), então medir a
 * partir dele deixaria a folga real bem menor que `RETENTION_MAX_AGE_MS` e
 * arriscaria descartar o retido ainda durante uma virada normal. */
const RETENTION_MAX_AGE_MS = 2 * 60_000

/**
 * Histórico do gráfico "Consumo em tempo real" — busca `/api/meter-readings`
 * (baldes já persistidos, não o buffer de SSE do navegador) e monta a série
 * densa/zero-preenchida via `buildDenseWindowBuckets`. `Date.now()` é lícito
 * aqui dentro do `queryFn` (não é corpo de render); `refetchInterval` é quem
 * mantém o gráfico atualizado quando um novo minuto fecha — não depende do
 * SSE pra saber que há dado novo.
 *
 * Sempre a hora corrente, granularidade de minuto — a janela era
 * configurável (1h/24h), mas a opção de 24h foi removida, então não sobra
 * nada pra alternar.
 *
 * `meterId` não entra na chamada (a API resolve o medidor por
 * targetType/targetId, igual `/api/consumption`) — só faz parte do gate de
 * `enabled`, pra não disparar a busca antes de o chamador confirmar que o
 * alvo tem medidor vinculado.
 *
 * Retém o último resultado não vazio: no primeiro minuto de cada hora,
 * `buildDenseWindowBuckets` devolve `[]` de propósito (a hora nova ainda não
 * fechou nenhum minuto) — sem isso, o gráfico piscava pro estado "Aguardando
 * leituras" por até ~1 min a cada virada de hora, mesmo com dado recente
 * disponível. O retido só é servido enquanto tiver sido capturado há menos
 * de `RETENTION_MAX_AGE_MS` — sem isso, um retorno de segundo plano bem na
 * virada de hora mostraria dado velho sem indicar que está desatualizado. O
 * retido é escopado por alvo (chave `targetType:targetId`, num `Map`
 * guardado num `ref`) — sem isso, trocar de propriedade/área/dispositivo no
 * meio da virada de hora herdaria os baldes do alvo anterior por engano.
 * Leitura e escrita do `ref` ficam só dentro do `queryFn` (nunca no corpo
 * síncrono do hook) — tocar `.current` durante o render é proibido pelas
 * regras do React Compiler.
 */
interface RetainedBuckets {
    buckets: PowerBucket[]
    retainedAt: number
}

export const useMeterReadingHistory = (
    targetType: TargetType,
    targetId: string | undefined,
    meterId: string | undefined,
) => {
    const retainedByTarget = useRef(new Map<string, RetainedBuckets>())

    return useQuery({
        queryKey: queryKeys.meterReadings.history(targetType, targetId ?? ""),
        queryFn: async (): Promise<PowerBucket[]> => {
            const targetKey = `${targetType}:${targetId}`
            const now = Date.now()
            const from = startOfSaoPauloPeriod(now)

            const { items } = await meterReadingService.list({
                targetType,
                targetId: targetId!,
                granularity: "minute",
                from: new Date(from).toISOString(),
                to: new Date(now).toISOString(),
            })

            const sparseBuckets = items.map((item) => ({
                bucketStart: new Date(item.bucketStart).getTime(),
                avgPowerW: item.avgPowerW,
            }))

            const buckets = buildDenseWindowBuckets(sparseBuckets, now)
            if (buckets.length > 0) {
                retainedByTarget.current.set(targetKey, { buckets, retainedAt: now })
                return buckets
            }

            const retained = retainedByTarget.current.get(targetKey)
            if (!retained || now - retained.retainedAt > RETENTION_MAX_AGE_MS) {
                return []
            }
            return retained.buckets
        },
        enabled: Boolean(targetId) && Boolean(meterId),
        refetchInterval: REFETCH_INTERVAL_MS,
    })
}
