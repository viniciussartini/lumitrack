const MINUTE_MS = 60_000

// Brasil aboliu o horário de verão em 2019 — America/Sao_Paulo é UTC-3 fixo,
// sem variação sazonal. Um deslocamento constante é seguro (não precisa de
// Intl/tzdata pra isso).
const SAO_PAULO_UTC_OFFSET_MS = 3 * 60 * 60 * 1000

// O backend (`meter-reading.repository.ts::findAggregated`, via `localTsExpr()`)
// agrega em America/Sao_Paulo mas devolve o resultado com os dígitos de SP
// "rotulados" como UTC (`AT TIME ZONE` dupla, depois lido como se fosse UTC) —
// ex.: uma leitura às 14:10 UTC (11:10 SP) vira o balde
// "2026-01-15T11:00:00.000Z": a hora "11" é a hora de SP, o "Z" é só rótulo.
// Pra alinhar os baldes do backend com os baldes computados aqui (que usam o
// epoch verdadeiro de "agora"), as duas pontas operam no mesmo "espaço
// mascarado" — depois de gerar os baldes, o `bucketStart` devolvido é
// desmascarado de volta pro epoch real, pra continuar funcionando com
// `Intl.DateTimeFormat` local (RealtimePowerChart) sem mudança nenhuma lá.
function toMaskedEpoch(trueEpochMs: number): number {
    return trueEpochMs - SAO_PAULO_UTC_OFFSET_MS
}

function fromMaskedEpoch(maskedEpochMs: number): number {
    return maskedEpochMs + SAO_PAULO_UTC_OFFSET_MS
}

function floorToStep(t: number, stepMs: number): number {
    return Math.floor(t / stepMs) * stepMs
}

/**
 * Início da hora corrente em horário de São Paulo, devolvido como epoch
 * verdadeiro — usado pelo hook de busca (`useMeterReadingHistory`) para
 * montar o `from` da requisição a `/api/meter-readings`. Independente do
 * fuso configurado no navegador de quem acessa (não usa `Date.setHours`
 * local — só o deslocamento fixo de SP).
 */
export function startOfSaoPauloPeriod(now: number): number {
    const periodStart = new Date(toMaskedEpoch(now))
    periodStart.setUTCMinutes(0, 0, 0)
    return fromMaskedEpoch(periodStart.getTime())
}

export interface SparsePowerBucket {
    /** Epoch verdadeiro (`new Date(iso).getTime()` da resposta da API — já
     * no "espaço mascarado" descrito acima, sem conversão adicional aqui). */
    bucketStart: number
    avgPowerW: number
}

export interface PowerBucket {
    /** Epoch verdadeiro (desmascarado) — pronto pra `new Date(...)`/`Intl`. */
    bucketStart: number
    kw: number
}

/**
 * Monta a série densa que o gráfico "Consumo em tempo real" plota, alinhada
 * ao relógio local — não é janela deslizante: baldes de 1 minuto, do minuto
 * 00 da hora corrente até o último minuto já fechado. Ex.: agora 19:45,
 * mostra 19:00–19:44; o balde de 19:45 só aparece quando o relógio vira
 * 19:46.
 *
 * O balde em curso nunca aparece — seu agregado ainda não existe no banco
 * (só minutos já fechados são persistidos). Balde sem nenhuma leitura vira
 * `kw: 0` (zerado, não omitido — issue #211: ausência de dado é consumo
 * zero, não "sem informação").
 *
 * `now` é sempre o epoch verdadeiro de quando os dados foram buscados
 * (`Date.now()` no `queryFn` do hook, nunca no corpo de render).
 */
export function buildDenseWindowBuckets(
    sparseBuckets: readonly SparsePowerBucket[],
    now: number,
): PowerBucket[] {
    const stepMs = MINUTE_MS
    const maskedNow = toMaskedEpoch(now)

    const periodStartMasked = toMaskedEpoch(startOfSaoPauloPeriod(now))
    const currentBucketStartMasked = floorToStep(maskedNow, stepMs)

    const avgPowerWByStart = new Map<number, number>()
    for (const bucket of sparseBuckets) {
        if (
            bucket.bucketStart < periodStartMasked ||
            bucket.bucketStart >= currentBucketStartMasked
        )
            continue
        avgPowerWByStart.set(bucket.bucketStart, bucket.avgPowerW)
    }

    const buckets: PowerBucket[] = []
    for (let tMasked = periodStartMasked; tMasked < currentBucketStartMasked; tMasked += stepMs) {
        const avgPowerW = avgPowerWByStart.get(tMasked) ?? 0
        buckets.push({ bucketStart: fromMaskedEpoch(tMasked), kw: avgPowerW / 1000 })
    }
    return buckets
}
