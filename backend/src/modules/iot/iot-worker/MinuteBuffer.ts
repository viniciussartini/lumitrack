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

export interface MinuteSample {
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
}

export interface MinuteBucketSnapshot {
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
    }
}

function toSnapshot(meterId: string, bucket: MinuteBucket): MinuteBucketSnapshot {
    // Se nenhuma amostra teve deltaSeconds > 0 (ex.: balde com uma única
    // amostra, sempre a "primeira" após um gap), não há peso para calcular
    // médias — usamos 0 como fallback neutro em vez de dividir por zero.
    const hasWeight = bucket.totalDt > 0

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
     * `add`, que trata cada chamada como uma única amostra nova.
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
