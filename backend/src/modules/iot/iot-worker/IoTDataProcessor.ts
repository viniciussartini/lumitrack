/**
 * IoTDataProcessor — orquestrador central do pipeline de dados IoT
 *
 * Este componente é o "intérprete" entre o mundo físico e o mundo da aplicação.
 * Ele vive entre o IoTConnectionManager (que fala com os medidores) e o
 * MinuteBuffer (que acumula os dados em memória).
 *
 * Fluxo de dados:
 *   Medidor → IConnection.onData → IoTConnectionManager.dataHandler
 *          → IoTDataProcessor.process → MinuteBuffer.add
 *          → listeners (SSE, AlertEvaluator)
 *
 * O payload é uma leitura elétrica instantânea (~1/s): `{ deviceTimestamp?,
 * voltage, current, powerW, powerFactor, ...grandezas por fase opcionais }`
 * — não um incremento de kWh pronto. A energia do intervalo é calculada aqui
 * no backend a partir da potência e do tempo decorrido desde a amostra
 * anterior — o timestamp OFICIAL da leitura é sempre o momento de
 * recebimento (`new Date()`), nunca o `deviceTimestamp` do payload, que é só
 * metadado de diagnóstico (log).
 *
 * Por que não lançar exceções aqui? Porque este código roda em um loop
 * assíncrono de background, fora do ciclo request/response do Express.
 * Uma exceção não capturada aqui derrubaria o processo inteiro.
 * A estratégia "log and discard" é a correta para workers de longa duração.
 */
import type { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import {
    MinuteBuffer,
    type OptionalElectricalFields,
} from "@/modules/iot/iot-worker/MinuteBuffer.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "IoTProcessor" })

// Δt (segundos entre duas amostras consecutivas do mesmo medidor) é limitado
// a este teto. Um gap maior indica medidor silencioso (reconexão, queda de
// rede) — nesse caso não "inventamos" energia para o período sem amostra;
// a amostra seguinte só reinicia o relógio (deltaSeconds = 0 nessa leitura).
const MAX_SAMPLE_INTERVAL_SECONDS = 5

export interface MeterReadingSample extends OptionalElectricalFields {
    meterId: string
    voltage: number
    current: number
    powerW: number
    powerFactor: number
    receivedAt: Date
}

// Listener genérico de amostras processadas. Usado pela rota SSE (evento
// "reading") e pelo AlertEvaluator, sem precisar mudar a API pública do
// processor.
export type SampleListener = (sample: MeterReadingSample) => void

// Campos brutos opcionais por fase (ADR-0022) — `voltageUnbalance` não entra
// aqui: é sempre calculado neste processor a partir das 3 fases de tensão da
// própria amostra, nunca aceito vindo do medidor.
type RawOptionalFields = Omit<OptionalElectricalFields, "voltageUnbalance">

interface RawReadingPayload extends RawOptionalFields, Record<string, unknown> {
    deviceTimestamp?: string
    voltage: number
    current: number
    powerW: number
    powerFactor: number
}

// Tetos de plausibilidade física — nenhum tem origem numa norma, são só uma
// margem generosa acima do maior valor esperado numa instalação
// residencial/comercial (Grupo B), para pegar erro grosseiro de leitura
// (unidade errada, overflow de registrador, ruído) sem rejeitar instalação
// legítima. Grupo A de grande porte (Fase 19+) pode exigir revisão.
const MAX_PLAUSIBLE_VOLTAGE = 500 // V — cobre 127/220/380V com margem
const MAX_PLAUSIBLE_CURRENT = 2000 // A
const MAX_PLAUSIBLE_POWER_W = 1_000_000 // 1 MW — também usado para var/VA por fase
const MAX_PLAUSIBLE_THD_PERCENT = 100 // % — THD acima disso é erro de leitura, não distorção real
const MIN_PLAUSIBLE_FREQUENCY_HZ = 45
const MAX_PLAUSIBLE_FREQUENCY_HZ = 65

// Agrupamento das grandezas por fase por faixa de plausibilidade — evita
// repetir a mesma checagem 15 vezes (3 fases × 5 grandezas com teto simples,
// fora frequência e fator de potência, que têm faixa própria).
const VOLTAGE_LIKE_FIELDS = ["voltagePhaseA", "voltagePhaseB", "voltagePhaseC"] as const
const CURRENT_LIKE_FIELDS = ["currentPhaseA", "currentPhaseB", "currentPhaseC"] as const
const POWER_LIKE_FIELDS = [
    "activePowerPhaseA",
    "activePowerPhaseB",
    "activePowerPhaseC",
    "reactivePowerVar",
    "apparentPowerVa",
] as const
const POWER_FACTOR_LIKE_FIELDS = [
    "powerFactorPhaseA",
    "powerFactorPhaseB",
    "powerFactorPhaseC",
] as const
const THD_LIKE_FIELDS = [
    "thdVoltagePhaseA",
    "thdVoltagePhaseB",
    "thdVoltagePhaseC",
    "thdCurrentPhaseA",
    "thdCurrentPhaseB",
    "thdCurrentPhaseC",
] as const

function isFiniteInRange(value: unknown, max: number): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max
}

// Campo ausente (undefined) é sempre válido — a grandeza opcional
// simplesmente não é reportada por este medidor, e o sistema aceita
// medidores que não medem todas as grandezas. Campo presente com valor
// implausível invalida a amostra inteira, mesmo tratamento já dado às 4
// grandezas obrigatórias.
function isFiniteInRangeOrAbsent(value: unknown, max: number): boolean {
    return value === undefined || isFiniteInRange(value, max)
}

function isPowerFactorOrAbsent(value: unknown): boolean {
    return value === undefined || (typeof value === "number" && value >= 0 && value <= 1)
}

function isFrequencyOrAbsent(value: unknown): boolean {
    return (
        value === undefined ||
        (typeof value === "number" &&
            Number.isFinite(value) &&
            value >= MIN_PLAUSIBLE_FREQUENCY_HZ &&
            value <= MAX_PLAUSIBLE_FREQUENCY_HZ)
    )
}

function isValidOptionalFields(raw: Record<string, unknown>): boolean {
    return (
        VOLTAGE_LIKE_FIELDS.every((f) => isFiniteInRangeOrAbsent(raw[f], MAX_PLAUSIBLE_VOLTAGE)) &&
        CURRENT_LIKE_FIELDS.every((f) => isFiniteInRangeOrAbsent(raw[f], MAX_PLAUSIBLE_CURRENT)) &&
        POWER_LIKE_FIELDS.every((f) => isFiniteInRangeOrAbsent(raw[f], MAX_PLAUSIBLE_POWER_W)) &&
        POWER_FACTOR_LIKE_FIELDS.every((f) => isPowerFactorOrAbsent(raw[f])) &&
        THD_LIKE_FIELDS.every((f) => isFiniteInRangeOrAbsent(raw[f], MAX_PLAUSIBLE_THD_PERCENT)) &&
        isFrequencyOrAbsent(raw.frequencyHz)
    )
}

function isValidPayload(raw: Record<string, unknown>): raw is RawReadingPayload {
    const { voltage, current, powerW, powerFactor } = raw

    return (
        isFiniteInRange(voltage, MAX_PLAUSIBLE_VOLTAGE) &&
        isFiniteInRange(current, MAX_PLAUSIBLE_CURRENT) &&
        isFiniteInRange(powerW, MAX_PLAUSIBLE_POWER_W) &&
        typeof powerFactor === "number" &&
        Number.isFinite(powerFactor) &&
        powerFactor >= 0 &&
        powerFactor <= 1 &&
        isValidOptionalFields(raw)
    )
}

/**
 * Desequilíbrio de tensão (%) pela definição NEMA — maior desvio de uma fase
 * em relação à média das três, dividido pela própria média. Só calculável
 * com as 3 fases simultaneamente na mesma amostra (ADR-0022); qualquer fase
 * ausente deixa o desequilíbrio ausente também, em vez de estimado com dado
 * parcial.
 *
 * @returns O desequilíbrio em percentual, ou `undefined` se faltar alguma fase.
 */
function computeVoltageUnbalance(
    phaseA: number | undefined,
    phaseB: number | undefined,
    phaseC: number | undefined,
): number | undefined {
    if (phaseA === undefined || phaseB === undefined || phaseC === undefined) return undefined

    const average = (phaseA + phaseB + phaseC) / 3
    if (average === 0) return 0

    const maxDeviation = Math.max(
        Math.abs(phaseA - average),
        Math.abs(phaseB - average),
        Math.abs(phaseC - average),
    )
    return (maxDeviation / average) * 100
}

export class IoTDataProcessor {
    // Buffer compartilhado — singleton por natureza, pois o processor também é
    // instanciado uma única vez no server.ts.
    readonly buffer = new MinuteBuffer()

    // Instante da última amostra válida recebida de cada medidor — usado para
    // calcular Δt. Ausência de entrada = primeira amostra (ou o medidor não
    // reporta há tempo suficiente para ter sido limpo — não há necessidade de
    // limpar essa Map explicitamente: o volume é limitado ao nº de medidores
    // ativos, não ao nº de leituras).
    private readonly lastSampleAt = new Map<string, Date>()

    // Listeners de amostras processadas — cada cliente SSE conectado a
    // GET /api/iot/stream adiciona um listener aqui.
    private readonly listeners = new Set<SampleListener>()

    constructor(private readonly manager: IoTConnectionManager) {}

    /**
     * Registra o processor no manager e começa a receber dados.
     * Deve ser chamado uma única vez no boot do servidor, após o manager
     * ter restaurado as conexões do banco.
     */
    start(): void {
        this.manager.onData((meterId, rawData) => {
            this.process(meterId, rawData)
        })
    }

    /**
     * Processa um payload bruto recebido de qualquer protocolo.
     * Valida os campos elétricos, calcula a energia do intervalo, atualiza o
     * buffer e notifica os listeners registrados.
     */
    private process(meterId: string, rawData: Record<string, unknown>): void {
        if (!isValidPayload(rawData)) {
            log.warn({ meterId, payload: rawData }, "Leitura inválida descartada")
            return
        }

        const { voltage, current, powerW, powerFactor, deviceTimestamp, ...optionalRaw } = rawData
        const receivedAt = new Date()

        const lastAt = this.lastSampleAt.get(meterId)
        this.lastSampleAt.set(meterId, receivedAt)

        // Sem amostra anterior (primeira leitura deste medidor, ou após um
        // gap silencioso) — não há Δt confiável, então não acumulamos
        // energia; esta leitura só inicializa o relógio para a próxima.
        let deltaSeconds = 0
        let energyKwh = 0

        if (lastAt) {
            const rawDeltaSeconds = (receivedAt.getTime() - lastAt.getTime()) / 1000
            deltaSeconds = Math.max(0, Math.min(rawDeltaSeconds, MAX_SAMPLE_INTERVAL_SECONDS))
            energyKwh = (powerW * deltaSeconds) / 3_600_000
        }

        const voltageUnbalance = computeVoltageUnbalance(
            optionalRaw.voltagePhaseA,
            optionalRaw.voltagePhaseB,
            optionalRaw.voltagePhaseC,
        )

        this.buffer.add(meterId, {
            energyKwh,
            voltage,
            current,
            powerW,
            powerFactor,
            deltaSeconds,
            ...optionalRaw,
            voltageUnbalance,
        })

        if (deviceTimestamp !== undefined) {
            log.debug({ meterId, deviceTimestamp, receivedAt }, "Leitura recebida")
        }

        const sample: MeterReadingSample = {
            meterId,
            voltage,
            current,
            powerW,
            powerFactor,
            receivedAt,
            ...optionalRaw,
            voltageUnbalance,
        }

        // Iterar sobre um Set é seguro mesmo se um listener for removido
        // durante a iteração — o Set cria um snapshot estável.
        for (const listener of this.listeners) {
            try {
                listener(sample)
            } catch (err) {
                // Um listener quebrado não deve interromper os demais.
                log.error({ err }, "Erro em listener de leitura")
            }
        }
    }

    /**
     * Adiciona um listener de amostras processadas. Retorna uma função de
     * cleanup para remover o listener (ex.: ao desconectar o cliente SSE).
     *    const unsubscribe = processor.addSampleListener(handler)
     *    req.on("close", unsubscribe)
     */
    addSampleListener(listener: SampleListener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    activeListenerCount(): number {
        return this.listeners.size
    }
}
