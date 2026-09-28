import type { TargetType } from "@/types/meter.types"
import type { MeterReadingSeriesMetric } from "@/types/meterReadingSeries.types"
import type { PropertyTree } from "@/types/property.types"

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

const formatDays = (days: number): string => `${days} ${days === 1 ? "dia" : "dias"}`

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
