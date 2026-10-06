import type { GroupABreakdown } from "@/types/consumption.types"

/**
 * Texto da janela de ponta da distribuidora: as horas vêm da configuração dela,
 * e a ponta só vale em dia útil (sábado, domingo e feriado contam como fora de
 * ponta). Nulo quando a distribuidora não tem janela configurada.
 */
export const describePeakWindow = (
    startHour: number | null,
    endHour: number | null,
): string | null =>
    startHour === null || endHour === null
        ? null
        : `Seg a sex, ${startHour}h–${endHour}h · excluídos sábados, domingos e feriados`

/**
 * Participação da ponta no consumo do mês, em %: o kWh de ponta sobre o kWh de
 * todos os postos, da mesma conta do Grupo A que gera a fatura.
 *
 * @param groupA - Decomposição da conta do mês; ausente fora do Grupo A.
 * @returns Nulo sem consumo no mês ou sem decomposição, nunca 0% por falta de dado.
 */
export const peakShareOfMonth = (groupA: GroupABreakdown | undefined): number | null => {
    if (!groupA) return null
    const total = groupA.energyByPost.reduce((sum, entry) => sum + entry.kwhConsumed, 0)
    if (total <= 0) return null
    const peak = groupA.energyByPost.find((entry) => entry.post === "PEAK")?.kwhConsumed ?? 0
    return (peak / total) * 100
}
