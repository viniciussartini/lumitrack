import type { TargetType } from "@/types/meter.types"
import type {
    MeterReadingComparePeriodsParams,
    MeterReadingSeriesMetric,
} from "@/types/meterReadingSeries.types"
import type { PropertyTree, TariffGroup } from "@/types/property.types"

/** Teto de dias por período — mesmo limite que o backend aplica na comparação. */
export const COMPARE_PERIOD_MAX_DAYS = 92

const DAY_MS = 24 * 60 * 60 * 1000

/** Um alvo comparável (Propriedade, Área ou Dispositivo) como opção do seletor. */
export interface CompareTargetOption {
    /** Chave única entre tipos — ids de tipos diferentes nunca colidem no `<select>`. */
    key: string
    targetType: TargetType
    targetId: string
    label: string
    /** Só nas propriedades: o grupo tarifário decide, por exemplo, se há relatório de demanda. */
    tariffGroup?: TariffGroup
}

export interface CompareTargetGroup {
    label: string
    options: CompareTargetOption[]
}

/** As datas dos dois períodos como o formulário as guarda (`YYYY-MM-DD` ou vazio). */
export interface ComparePeriodsDates {
    aStart: string
    aEnd: string
    bStart: string
    bEnd: string
}

/**
 * Os parâmetros de uma comparação já submetida (distinto do rascunho do
 * formulário) — é o que dirige a busca e a legenda dos resultados.
 */
export interface PeriodComparisonRun extends ComparePeriodsDates {
    target: CompareTargetOption
    metric: MeterReadingSeriesMetric
}

const toUtcMidnight = (isoDate: string): number => {
    const [year, month, day] = isoDate.split("-").map(Number)
    return Date.UTC(year!, month! - 1, day!)
}

/**
 * Quantos dias o período cobre, contando início e fim (mesmo dia = 1). A
 * conta é feita em UTC de propósito: só o calendário importa, e assim o
 * fuso do navegador não altera o resultado.
 *
 * @param startIso - Primeiro dia do período (`YYYY-MM-DD`).
 * @param endIso - Último dia do período (`YYYY-MM-DD`).
 * @returns O número de dias, no mínimo 1 quando `endIso >= startIso`.
 */
export function countInclusiveDays(startIso: string, endIso: string): number {
    return Math.round((toUtcMidnight(endIso) - toUtcMidnight(startIso)) / DAY_MS) + 1
}

/**
 * Soma dias a uma data `YYYY-MM-DD` no calendário (em UTC, para o fuso do
 * navegador não interferir) e devolve o resultado no mesmo formato.
 *
 * @param isoDate - Data de partida (`YYYY-MM-DD`).
 * @param days - Quantidade de dias a somar (pode ser negativa).
 * @returns A data resultante (`YYYY-MM-DD`).
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
    return new Date(toUtcMidnight(isoDate) + days * DAY_MS).toISOString().slice(0, 10)
}

// O Brasil não tem horário de verão desde 2019: São Paulo é UTC-3 fixo, então
// "meia-noite de SP" é sempre o mesmo instante para uma data, sem depender do
// fuso do navegador. Deliberado e válido para datas de 2019 em diante — o
// backend usa o fuso nomeado America/Sao_Paulo, então um período anterior a
// 2019, ou a volta do horário de verão, deslocaria os limites em 1h; nesse
// caso, calcular o offset por data em vez de fixá-lo.
const SAO_PAULO_UTC_OFFSET = "-03:00"

export const startOfSaoPauloDay = (isoDate: string): string =>
    new Date(`${isoDate}T00:00:00${SAO_PAULO_UTC_OFFSET}`).toISOString()

/**
 * Traduz o run do formulário (dias inteiros) para os parâmetros da API
 * (instantes): cada período vai da meia-noite de São Paulo do primeiro dia
 * até a meia-noite do dia seguinte ao último — fim exclusivo, como o filtro
 * do backend. Dois períodos com o mesmo número de dias resultam em instantes
 * de mesma duração, que é o que o backend exige.
 *
 * @param run - A comparação submetida.
 * @returns Os parâmetros de `GET /api/meter-readings/compare-periods`.
 */
export function buildComparePeriodsParams(
    run: PeriodComparisonRun,
): MeterReadingComparePeriodsParams {
    return {
        targetType: run.target.targetType,
        targetId: run.target.targetId,
        metric: run.metric,
        fromA: startOfSaoPauloDay(run.aStart),
        toA: startOfSaoPauloDay(addDaysToIsoDate(run.aEnd, 1)),
        fromB: startOfSaoPauloDay(run.bStart),
        toB: startOfSaoPauloDay(addDaysToIsoDate(run.bEnd, 1)),
    }
}

/** `1 dia` / `7 dias`. */
export const formatDays = (days: number): string => `${days} ${days === 1 ? "dia" : "dias"}`

const hasEmptyDate = (dates: ComparePeriodsDates): boolean =>
    !dates.aStart || !dates.aEnd || !dates.bStart || !dates.bEnd

/**
 * Regras dos dois períodos que o backend também impõe — validadas aqui para
 * o usuário ver o motivo antes de enviar, não como um erro genérico depois.
 *
 * @param dates - As quatro datas do formulário.
 * @returns A mensagem do primeiro problema encontrado, ou `null` se válido
 *   (ou se ainda há campo vazio: o preenchimento é exigido pelo próprio
 *   formulário, não é uma regra de duração).
 */
export function validateComparePeriods(dates: ComparePeriodsDates): string | null {
    if (hasEmptyDate(dates)) return null

    if (dates.aEnd < dates.aStart) return "No período A, o fim não pode ser anterior ao início."
    if (dates.bEnd < dates.bStart) return "No período B, o fim não pode ser anterior ao início."

    const daysA = countInclusiveDays(dates.aStart, dates.aEnd)
    const daysB = countInclusiveDays(dates.bStart, dates.bEnd)

    if (daysA > COMPARE_PERIOD_MAX_DAYS || daysB > COMPARE_PERIOD_MAX_DAYS) {
        return `Cada período pode ter no máximo ${COMPARE_PERIOD_MAX_DAYS} dias.`
    }
    if (daysA !== daysB) {
        return `Os dois períodos devem ter a mesma duração (A: ${formatDays(daysA)}, B: ${formatDays(daysB)}).`
    }
    return null
}

/**
 * Opções do seletor "Alvo" a partir da árvore de cadastro, agrupadas como no
 * design (Propriedades · Áreas · Dispositivos). O rótulo de área leva o nome
 * da propriedade e o de dispositivo o da área, porque nomes como "Sala" ou
 * "Geladeira" se repetem entre propriedades. Grupo sem itens é omitido.
 *
 * @param tree - Árvore Propriedade → Área → Dispositivo do usuário.
 * @returns Os grupos não vazios, na ordem do design.
 */
export function buildCompareTargetGroups(tree: PropertyTree): CompareTargetGroup[] {
    const properties: CompareTargetOption[] = []
    const areas: CompareTargetOption[] = []
    const devices: CompareTargetOption[] = []

    for (const property of tree.items) {
        properties.push({
            key: `PROPERTY:${property.id}`,
            targetType: "PROPERTY",
            targetId: property.id,
            label: property.name,
            tariffGroup: property.tariffGroup,
        })
        for (const area of property.areas) {
            areas.push({
                key: `AREA:${area.id}`,
                targetType: "AREA",
                targetId: area.id,
                label: `${property.name} · ${area.name}`,
            })
            for (const device of area.devices) {
                devices.push({
                    key: `DEVICE:${device.id}`,
                    targetType: "DEVICE",
                    targetId: device.id,
                    label: `${area.name} · ${device.name}`,
                })
            }
        }
    }

    return [
        { label: "Propriedades", options: properties },
        { label: "Áreas", options: areas },
        { label: "Dispositivos", options: devices },
    ].filter((group) => group.options.length > 0)
}
