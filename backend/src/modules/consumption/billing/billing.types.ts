import type { TariffPost } from "@/generated/prisma/client.js"
import type { GroupADemandPostResult } from "@/shared/tariff/tariff.service.js"

// Decomposição da conta binômia do Grupo A — presente só no bucket
// mensal de uma Propriedade Grupo A; ausente (undefined) para Grupo B e para
// qualquer outra combinação de granularidade/alvo, sem mudar o contrato de
// quem já consome `costBrl` sozinho.
export type GroupABreakdown = {
    contractedDemandKw: number
    demandByPost: GroupADemandPostResult[]
    demandBrl: number
    ultrapassagemBrl: number
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    ereByWindow: { window: "INDUCTIVE" | "CAPACITIVE"; excessKvarh: number; ereBrl: number }[]
    ereBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

// Decomposição da conta da Tarifa Branca (Grupo B) — presente só no bucket
// mensal de uma Propriedade Grupo B com groupBModality WHITE; ausente para
// Convencional e para qualquer outra combinação de granularidade/alvo.
export type GroupBWhiteBreakdown = {
    belowAvailabilityFloor: boolean
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    energyBrl: number
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
}

// Retorno interno do cálculo de custo de um bucket — carrega a decomposição
// do Grupo A ou da Tarifa Branca só quando ela existe (mês + Propriedade);
// os demais caminhos (Grupo B Convencional, ano, Área/Aparelho) só populam
// `totalBrl`. `null` no lugar do resultado é o custo não calculável.
export type MonthCostResult = {
    totalBrl: number
    groupA?: GroupABreakdown
    groupBWhite?: GroupBWhiteBreakdown
}
