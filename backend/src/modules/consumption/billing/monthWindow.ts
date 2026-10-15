import type { AclContractResponse } from "@/modules/acl-contract/acl-contract.repository.js"
import { getNationalHolidaysInRange } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"

/**
 * Janela de consulta de uma lista de meses. `monthStarts` vêm de
 * `date_trunc('month', localTsExpr())`: os campos de calendário (ano/mês) já
 * são os locais corretos, só rotulados como UTC (mesmo truque de
 * `consumption.repository.ts`); `fromSaoPauloLocal` converte para o instante
 * UTC real que `findKwhByPostGroupedByMonth` espera. Compartilhada pelo lote
 * mensal do Grupo A e da Branca; `periodStarts` só interessa ao Grupo A
 * (demanda contratada), mas calculá-lo aqui é mais barato que duplicar a
 * função por um campo que o outro chamador ignora.
 *
 * @param monthStarts - Inícios dos meses, na convenção "hora local nos getters UTC".
 * @returns O primeiro mês, o fim do último, a janela em instantes UTC reais, os feriados dela e o início de cada mês como instante UTC real.
 */
export function resolveMonthWindow(monthStarts: Date[]): {
    minMonthStart: Date
    maxMonthEnd: Date
    from: Date
    to: Date
    holidays: Date[]
    periodStarts: Date[]
} {
    const monthMs = monthStarts.map((d) => d.getTime())
    const minMonthStart = new Date(Math.min(...monthMs))
    const maxMonthStart = new Date(Math.max(...monthMs))
    const maxMonthEnd = new Date(
        Date.UTC(maxMonthStart.getUTCFullYear(), maxMonthStart.getUTCMonth() + 1, 1),
    )
    const from = fromSaoPauloLocal(minMonthStart)
    const to = fromSaoPauloLocal(maxMonthEnd)
    const holidays = getNationalHolidaysInRange(from, to)

    // MeterDemandRollup.periodStart é o instante UTC real do início do
    // mês local (mesma conversão que DemandRollupScheduler usa para
    // escrever), não o valor "rotulado como UTC" de `monthStarts" — daí
    // o `fromSaoPauloLocal` por mês, igual ao par `from`/`to` acima.
    const periodStarts = monthStarts.map((d) => fromSaoPauloLocal(d))

    return { minMonthStart, maxMonthEnd, from, to, holidays, periodStarts }
}

/**
 * Agrupa uma lista de linhas por um instante (em ms) — o mesmo formato de
 * consulta usado para o kWh por posto × mês, para não repetir o laço a cada
 * fonte de dado agregada por mês (demanda medida, energia reativa).
 *
 * @param rows - Linhas a agrupar.
 * @param getMs - Instante da linha, em ms.
 * @returns As linhas de cada instante, na ordem recebida.
 */
export function groupRowsByMs<T>(rows: T[], getMs: (row: T) => number): Map<number, T[]> {
    const map = new Map<number, T[]>()
    for (const row of rows) {
        const ms = getMs(row)
        const bucket = map.get(ms) ?? []
        bucket.push(row)
        map.set(ms, bucket)
    }
    return map
}

/**
 * Contrato ACL vigente num mês: entre os contratos sobrepostos da propriedade
 * (já ordenados por `validFrom` decrescente, ver
 * `AclContractRepository.findOverlappingForProperty`), o primeiro cuja vigência
 * cobre o mês; havendo sobreposição (não impedida no cadastro), o contrato mais
 * recente prevalece.
 *
 * Devolve `undefined`, e não lança: um mês sem contrato vigente (histórico
 * anterior a `validFrom`, ou um buraco entre dois contratos) não é erro do
 * pedido inteiro. Quem chama decide: o Grupo A degrada aquele mês para o
 * catálogo regulado, e a comparação ACR × ACL o deixa de fora.
 *
 * @param contracts - Contratos sobrepostos da propriedade.
 * @param monthStart - Início do mês, na convenção "hora local nos getters UTC".
 * @returns O contrato vigente no mês, ou `undefined`.
 */
export function resolveAclContractForMonth(
    contracts: AclContractResponse[],
    monthStart: Date,
): AclContractResponse | undefined {
    return contracts.find(
        (c) => c.validFrom <= monthStart && (c.validTo === null || c.validTo >= monthStart),
    )
}
