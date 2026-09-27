/**
 * MinuteBuffer — buffer em memória por medidor, agregando amostras elétricas
 * (~1/s) em baldes de 1 minuto (substitui o antigo ReadingBuffer, que
 * acumulava kWh por hora e por device).
 *
 * Cada amostra chega com seu próprio Δt (segundos desde a amostra anterior,
 * já com clamp aplicado pelo IoTDataProcessor). As médias de tensão/corrente/
 * potência/fator de potência são ponderadas por esse Δt — uma leitura que
 * ficou "vigente" por 3s pesa 3x mais que uma que durou 1s antes da próxima
 * chegar. `secondsCovered` acumula o total de Δt do balde e é o que permite
 * o merge idempotente no upsert do banco (ver MeterReadingRepository):
 * duas médias ponderadas se combinam somando (média × peso) e dividindo pela
 * soma dos pesos.
 */

// Cada grandeza por fase (ADR-0022) é opcional na amostra — nem todo medidor
// a reporta, e a ausência precisa ser distinguível de zero — e ganha um nome
// diferente ao virar média persistida
// (prefixo "avg", espelhando o par voltage/avgVoltage já existente). Esta
// tabela é a única fonte de verdade dessa renomeação: usada tanto para
// acumular o balde quanto para o merge SQL do repository, em vez de repetir
// os 22 pares manualmente em cada lugar.
export const OPTIONAL_ELECTRICAL_FIELD_MAP = [
    ["voltagePhaseA", "avgVoltagePhaseA"],
    ["voltagePhaseB", "avgVoltagePhaseB"],
    ["voltagePhaseC", "avgVoltagePhaseC"],
    ["voltageUnbalance", "avgVoltageUnbalance"],
    ["currentPhaseA", "avgCurrentPhaseA"],
    ["currentPhaseB", "avgCurrentPhaseB"],
    ["currentPhaseC", "avgCurrentPhaseC"],
    ["activePowerPhaseA", "avgActivePowerPhaseA"],
    ["activePowerPhaseB", "avgActivePowerPhaseB"],
    ["activePowerPhaseC", "avgActivePowerPhaseC"],
    ["reactivePowerVar", "avgReactivePowerVar"],
    ["apparentPowerVa", "avgApparentPowerVa"],
    ["frequencyHz", "avgFrequencyHz"],
    ["powerFactorPhaseA", "avgPowerFactorPhaseA"],
    ["powerFactorPhaseB", "avgPowerFactorPhaseB"],
    ["powerFactorPhaseC", "avgPowerFactorPhaseC"],
    ["thdVoltagePhaseA", "avgThdVoltagePhaseA"],
    ["thdVoltagePhaseB", "avgThdVoltagePhaseB"],
    ["thdVoltagePhaseC", "avgThdVoltagePhaseC"],
    ["thdCurrentPhaseA", "avgThdCurrentPhaseA"],
    ["thdCurrentPhaseB", "avgThdCurrentPhaseB"],
    ["thdCurrentPhaseC", "avgThdCurrentPhaseC"],
] as const

export type OptionalSampleField = (typeof OPTIONAL_ELECTRICAL_FIELD_MAP)[number][0]
export type OptionalAvgField = (typeof OPTIONAL_ELECTRICAL_FIELD_MAP)[number][1]

// `?: number | undefined` (em vez de `Partial<Record<..., number>>`) porque o
// projeto compila com `exactOptionalPropertyTypes` — sem o `| undefined`
// explícito, atribuir `undefined` a um campo ausente (ex.: o resultado de
// `computeVoltageUnbalance` quando faltam fases) seria erro de tipo, mesmo a
// propriedade sendo opcional.
export type OptionalElectricalFields = { [K in OptionalSampleField]?: number | undefined }

export interface MinuteSample extends OptionalElectricalFields {
    energyKwh: number
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    deltaSeconds: number
}

interface MinuteBucket {
    minuteStart: Date
    energyKwh: number
    sumVoltageDt: number
    sumCurrentDt: number
    sumPowerDt: number
    sumPfDt: number
    totalDt: number
    sampleCount: number
    // Soma ponderada por Δt de cada grandeza opcional já vista neste balde —
    // uma chave só existe aqui se ao menos uma amostra trouxe aquele campo,
    // o que distingue "nunca reportado" (ausente do objeto) de "reportado,
    // mas ainda com peso zero" (só a 1ª amostra do medidor, deltaSeconds=0).
    optionalSums: Partial<Record<OptionalSampleField, number>>
}

export type MinuteBucketSnapshot = Record<OptionalAvgField, number | null> & {
    meterId: string
    minuteStart: Date
    energyKwh: number
    avgVoltage: number
    avgCurrent: number
    avgPowerW: number
    avgPowerFactor: number
    sampleCount: number
    secondsCovered: number
}

/**
 * As 22 grandezas por fase, todas `null` — a base para montar um
 * `MeterReading` sem nenhuma delas (medidor legado, ou teste que não é sobre
 * elas). `MinuteBucketSnapshot` exige as 22 chaves mesmo quando ausentes
 * (nulas), então qualquer código que monte um snapshot fora de `toSnapshot`
 * parte daqui em vez de listar as 22 à mão.
 */
export function emptyOptionalAvgFields(): Record<OptionalAvgField, null> {
    const result = {} as Record<OptionalAvgField, null>
    for (const [, avgField] of OPTIONAL_ELECTRICAL_FIELD_MAP) {
        result[avgField] = null
    }
    return result
}

export interface LatestReading {
    meterId: string
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    receivedAt: Date
}

function emptyBucket(minuteStart: Date): MinuteBucket {
    return {
        minuteStart,
        energyKwh: 0,
        sumVoltageDt: 0,
        sumCurrentDt: 0,
        sumPowerDt: 0,
        sumPfDt: 0,
        totalDt: 0,
        sampleCount: 0,
        optionalSums: {},
    }
}

function toSnapshot(meterId: string, bucket: MinuteBucket): MinuteBucketSnapshot {
    // Se nenhuma amostra teve deltaSeconds > 0 (ex.: balde com uma única
    // amostra, sempre a "primeira" após um gap), não há peso para calcular
    // médias — usamos 0 como fallback neutro em vez de dividir por zero.
    const hasWeight = bucket.totalDt > 0

    const optionalAverages = {} as Record<OptionalAvgField, number | null>
    for (const [sampleField, avgField] of OPTIONAL_ELECTRICAL_FIELD_MAP) {
        const sum = bucket.optionalSums[sampleField]
        optionalAverages[avgField] = sum === undefined ? null : hasWeight ? sum / bucket.totalDt : 0
    }

    return {
        meterId,
        minuteStart: bucket.minuteStart,
        energyKwh: bucket.energyKwh,
        avgVoltage: hasWeight ? bucket.sumVoltageDt / bucket.totalDt : 0,
        avgCurrent: hasWeight ? bucket.sumCurrentDt / bucket.totalDt : 0,
        avgPowerW: hasWeight ? bucket.sumPowerDt / bucket.totalDt : 0,
        avgPowerFactor: hasWeight ? bucket.sumPfDt / bucket.totalDt : 0,
        sampleCount: bucket.sampleCount,
        secondsCovered: bucket.totalDt,
        ...optionalAverages,
    }
}

export class MinuteBuffer {
    // meterId → minuteStart(ms) → balde. Um medidor normalmente tem só o
    // balde do minuto em curso, mas o Map por minuteStart permite que um
    // balde ainda não drenado (ex.: scheduler atrasado, ou merge de retry)
    // conviva com o balde do minuto seguinte sem perder dados.
    private readonly buckets = new Map<string, Map<number, MinuteBucket>>()
    private readonly latest = new Map<string, LatestReading>()

    /** Adiciona uma amostra ao balde do minuto corrente e atualiza `latest`. */
    add(meterId: string, sample: MinuteSample, at: Date = new Date()): void {
        const minuteStart = this.truncateToMinute(at)
        const key = minuteStart.getTime()

        let meterBuckets = this.buckets.get(meterId)
        if (!meterBuckets) {
            meterBuckets = new Map()
            this.buckets.set(meterId, meterBuckets)
        }

        let bucket = meterBuckets.get(key)
        if (!bucket) {
            bucket = emptyBucket(minuteStart)
            meterBuckets.set(key, bucket)
        }

        bucket.energyKwh += sample.energyKwh
        bucket.sumVoltageDt += sample.voltage * sample.deltaSeconds
        bucket.sumCurrentDt += sample.current * sample.deltaSeconds
        bucket.sumPowerDt += sample.powerW * sample.deltaSeconds
        bucket.sumPfDt += sample.powerFactor * sample.deltaSeconds
        bucket.totalDt += sample.deltaSeconds
        bucket.sampleCount += 1

        for (const [sampleField] of OPTIONAL_ELECTRICAL_FIELD_MAP) {
            const value = sample[sampleField]
            if (value === undefined) continue
            bucket.optionalSums[sampleField] =
                (bucket.optionalSums[sampleField] ?? 0) + value * sample.deltaSeconds
        }

        this.latest.set(meterId, {
            meterId,
            voltage: sample.voltage,
            current: sample.current,
            powerW: sample.powerW,
            powerFactor: sample.powerFactor,
            receivedAt: at,
        })
    }

    /**
     * Reinsere um snapshot completo já agregado (ex.: um balde cujo upsert no
     * banco falhou) sem perder sampleCount/secondsCovered — diferente de
     * `add`, que trata cada chamada como uma única amostra nova. As
     * grandezas opcionais usam o mesmo peso agregado (`secondsCovered`) do
     * snapshot inteiro, não um peso por campo — mesma simplificação do merge
     * SQL do repository (ver `MeterReadingRepository.upsertMinute`): um
     * medidor reporta (ou não) uma grandeza de forma consistente entre
     * flushes, então um peso único por snapshot não introduz distorção
     * prática.
     */
    merge(snapshot: MinuteBucketSnapshot): void {
        const key = snapshot.minuteStart.getTime()

        let meterBuckets = this.buckets.get(snapshot.meterId)
        if (!meterBuckets) {
            meterBuckets = new Map()
            this.buckets.set(snapshot.meterId, meterBuckets)
        }

        let bucket = meterBuckets.get(key)
        if (!bucket) {
            bucket = emptyBucket(snapshot.minuteStart)
            meterBuckets.set(key, bucket)
        }

        bucket.energyKwh += snapshot.energyKwh
        bucket.sumVoltageDt += snapshot.avgVoltage * snapshot.secondsCovered
        bucket.sumCurrentDt += snapshot.avgCurrent * snapshot.secondsCovered
        bucket.sumPowerDt += snapshot.avgPowerW * snapshot.secondsCovered
        bucket.sumPfDt += snapshot.avgPowerFactor * snapshot.secondsCovered
        bucket.totalDt += snapshot.secondsCovered
        bucket.sampleCount += snapshot.sampleCount

        for (const [sampleField, avgField] of OPTIONAL_ELECTRICAL_FIELD_MAP) {
            const value = snapshot[avgField]
            if (value === null) continue
            bucket.optionalSums[sampleField] =
                (bucket.optionalSums[sampleField] ?? 0) + value * snapshot.secondsCovered
        }
    }

    /**
     * Drena todos os baldes cujo minuto já terminou (minuteStart < minuto
     * corrente). Chamado a cada 60s pelo MinuteRollupScheduler — o balde do
     * minuto em curso permanece no buffer até terminar.
     */
    drainCompletedBuckets(now: Date = new Date()): MinuteBucketSnapshot[] {
        const currentMinuteStart = this.truncateToMinute(now).getTime()
        const snapshots: MinuteBucketSnapshot[] = []

        for (const [meterId, meterBuckets] of this.buckets.entries()) {
            for (const [key, bucket] of meterBuckets.entries()) {
                if (key >= currentMinuteStart) continue

                snapshots.push(toSnapshot(meterId, bucket))
                meterBuckets.delete(key)
            }

            if (meterBuckets.size === 0) {
                this.buckets.delete(meterId)
            }
        }

        return snapshots
    }

    /** Drena TODOS os baldes, incluindo o minuto em curso — usado no shutdown. */
    drainAll(): MinuteBucketSnapshot[] {
        const snapshots: MinuteBucketSnapshot[] = []

        for (const [meterId, meterBuckets] of this.buckets.entries()) {
            for (const bucket of meterBuckets.values()) {
                snapshots.push(toSnapshot(meterId, bucket))
            }
        }

        this.buckets.clear()
        return snapshots
    }

    getLatest(meterId: string): LatestReading | null {
        return this.latest.get(meterId) ?? null
    }

    getAllLatest(): LatestReading[] {
        return [...this.latest.values()]
    }

    activeMeterCount(): number {
        return this.buckets.size
    }

    private truncateToMinute(date: Date): Date {
        const d = new Date(date)
        d.setSeconds(0, 0)
        return d
    }
}
