import type { AclContractResponse } from "@/modules/acl-contract/acl-contract.repository.js"
import { getNationalHolidaysInRange } from "@/shared/time/holidays.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"

// `monthStarts` vêm de date_trunc('month', localTsExpr()) — os campos de
// calendário (ano/mês) já são os locais corretos, só rotulados como UTC
// (mesmo truque de consumption.repository.ts). `fromSaoPauloLocal`
// converte para o instante UTC real que findKwhByPostGroupedByMonth
// espera (mesmo idioma do DemandRollupScheduler). Compartilhado pelo
// batching mensal do Grupo A e da Branca (Grupo B) — `periodStarts` só
// interessa ao Grupo A (demanda contratada), mas calculá-lo aqui é mais
// barato que duplicar a função por um campo que o outro chamador ignora.
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

// Agrupa uma lista de linhas por um instante (em ms) — mesmo formato de
// lookup usado para o kWh por posto×mês, extraído para não repetir o
// laço a cada nova fonte de dado agregada por mês (demanda medida,
// energia reativa).
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

// Entre os contratos sobrepostos da propriedade (ver
// AclContractRepository.findOverlappingForProperty, já ordenados por
// validFrom decrescente), o primeiro cuja vigência cobre o mês é o
// vigente — havendo sobreposição de vigências (não impedida no
// cadastro), o contrato mais recente prevalece.
//
// `undefined`, não exceção: um mês sem contrato vigente não é um erro do
// pedido inteiro — é um mês em que a propriedade (hoje ACL) ainda não
// tinha o contrato (ex.: histórico anterior a `validFrom`, ou um buraco
// entre dois contratos). `resolveGroupAMonthEntry` decide o que fazer
// com a ausência: degradar aquele mês para o tratamento do catálogo
// regulado, não derrubar `calculateMonthlyCosts` inteiro — antes
// disso, marcar uma propriedade Grupo A existente como ACL quebrava com
// 404 a consulta de consumo de qualquer mês anterior ao contrato.
export function resolveAclContractForMonth(
    contracts: AclContractResponse[],
    monthStart: Date,
): AclContractResponse | undefined {
    return contracts.find(
        (c) => c.validFrom <= monthStart && (c.validTo === null || c.validTo >= monthStart),
    )
}
