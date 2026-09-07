import type { ElectricalSystemType, TariffPost } from "@/generated/prisma/client.js"
import { ValidationError } from "@/shared/errors/AppError.js"

// Piso de disponibilidade (Grupo B, REN 1.000/2021): custo mínimo faturável
// em kWh, cobrado mesmo quando o consumo real fica abaixo dele — o "custo de
// disponibilidade" da rede. Só se aplica ao alvo PROPERTY (a unidade
// consumidora inteira), nunca a AREA/DEVICE (recortes internos dela).
const AVAILABILITY_FLOOR_KWH: Record<ElectricalSystemType, number> = {
    MONOPHASIC: 30,
    BIPHASIC: 50,
    TRIPHASIC: 100,
}

export type PropertyTariffInput = {
    kwhConsumed: number
    electricalSystem: ElectricalSystemType
    publicLightingFeeBrl: number | null
    tusdPerKwh: number
    tePerKwh: number
    icmsRate: number
    pisRate: number
    cofinsRate: number
    flagPer100Kwh: number
}

export type SubTargetTariffInput = {
    kwhConsumed: number
    tusdPerKwh: number
    tePerKwh: number
    icmsRate: number
    pisRate: number
    cofinsRate: number
    flagPer100Kwh: number
}

export type TariffResult = {
    kwhBilled: number // kWh usado no cálculo (após piso, se PROPERTY)
    energyBrl: number // TUSD + TE, sem tributos
    flagBrl: number // acréscimo da bandeira vigente, sem tributos
    taxesBrl: number // ICMS + PIS + COFINS, calculados "por dentro"
    publicLightingFeeBrl: number // CIP — fora da base de tributos
    totalBrl: number
}

// Consumo por posto tarifário (ponta/fora de ponta) com a tarifa de energia
// do catálogo do Grupo A já resolvida — ver TariffCatalogRepository.
export type GroupAEnergyPostInput = {
    post: TariffPost
    kwhConsumed: number
    tusdPerKwh: number
    tePerKwh: number
}

// Uma demanda contratada do Grupo A, com a demanda medida do mesmo posto já
// resolvida (MeterDemandRollup) para apurar ultrapassagem (RN20). `post` é
// `null` para demanda única (Verde, Convencional Binômia — 1 entrada só);
// Azul passa 2 entradas, uma por posto (PEAK/OFF_PEAK).
export type GroupADemandPostInput = {
    post: TariffPost | null
    contractedDemandKw: number
    measuredDemandKw: number
    tusdPerKw: number
}

export type GroupADemandPostResult = {
    post: TariffPost | null
    contractedDemandKw: number
    measuredDemandKw: number
    demandBrl: number
    ultrapassagemBrl: number
}

export type GroupATariffInput = {
    demandPosts: GroupADemandPostInput[]
    energyByPost: GroupAEnergyPostInput[]
    icmsRate: number
    pisRate: number
    cofinsRate: number
    flagPer100Kwh: number
    publicLightingFeeBrl: number | null
}

export type GroupATariffResult = {
    demandByPost: GroupADemandPostResult[]
    demandBrl: number // soma dos postos — demanda contratada × TUSD demanda
    ultrapassagemBrl: number // soma dos postos — RN20, entra antes dos tributos
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    energyBrl: number // soma dos postos, sem tributos
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
    totalBrl: number
}

// RN20: acima de 5% de tolerância, o excedente é cobrado ao triplo da
// tarifa de demanda — mesma tarifa usada na parcela contratada, não uma
// tarifa própria de penalidade.
const DEMAND_OVERAGE_TOLERANCE = 1.05
const DEMAND_OVERAGE_MULTIPLIER = 3

export class TariffService {
    // Cálculo "por dentro": os tributos incidem sobre o próprio preço final,
    // não sobre a base antes deles — é assim que a conta de energia
    // brasileira funciona (ICMS/PIS/COFINS por dentro).
    //   total = base / (1 − (icms + pis + cofins))
    // Compartilhado entre o monômio (Grupo B) e o binômio (Grupo A) — a
    // única diferença entre os dois é o que compõe `baseBrl`.
    private applyTaxesByDentro(
        baseBrl: number,
        icmsRate: number,
        pisRate: number,
        cofinsRate: number,
    ): { taxesBrl: number; totalWithTaxes: number } {
        const taxRateSum = icmsRate + pisRate + cofinsRate
        if (taxRateSum >= 1) {
            throw new ValidationError(
                "Soma das alíquotas de ICMS/PIS/COFINS da distribuidora é inválida (≥ 100%)",
            )
        }
        const totalWithTaxes = baseBrl / (1 - taxRateSum)
        const taxesBrl = totalWithTaxes - baseBrl

        return { taxesBrl, totalWithTaxes }
    }

    private calculateCore(
        kwhBilled: number,
        tusdPerKwh: number,
        tePerKwh: number,
        icmsRate: number,
        pisRate: number,
        cofinsRate: number,
        flagPer100Kwh: number,
    ): { energyBrl: number; flagBrl: number; taxesBrl: number; totalWithTaxes: number } {
        const energyBrl = kwhBilled * (tusdPerKwh + tePerKwh)
        const flagBrl = kwhBilled * (flagPer100Kwh / 100)
        const totalBeforeTaxes = energyBrl + flagBrl
        const { taxesBrl, totalWithTaxes } = this.applyTaxesByDentro(
            totalBeforeTaxes,
            icmsRate,
            pisRate,
            cofinsRate,
        )

        return { energyBrl, flagBrl, taxesBrl, totalWithTaxes }
    }

    // Uma entrada de demanda: a parcela contratada (sempre cobrada) e a
    // ultrapassagem (RN20, só acima de 5% da contratada, ao triplo da
    // tarifa). Extraído para que `calculateForGroupA` some a lista em vez de
    // repetir a fórmula por entrada.
    private calculateDemandPost(input: GroupADemandPostInput): GroupADemandPostResult {
        const demandBrl = input.contractedDemandKw * input.tusdPerKw

        const exceedsThreshold =
            input.measuredDemandKw > DEMAND_OVERAGE_TOLERANCE * input.contractedDemandKw
        const ultrapassagemBrl = exceedsThreshold
            ? (input.measuredDemandKw - input.contractedDemandKw) *
              DEMAND_OVERAGE_MULTIPLIER *
              input.tusdPerKw
            : 0

        return {
            post: input.post,
            contractedDemandKw: input.contractedDemandKw,
            measuredDemandKw: input.measuredDemandKw,
            demandBrl,
            ultrapassagemBrl,
        }
    }

    /**
     * Conta binômia do Grupo A: demanda(s) contratada(s) + ultrapassagem
     * (RN20, quando a demanda medida excede em mais de 5% a contratada) +
     * consumo por posto + bandeira (só sobre o consumo, nunca sobre a
     * demanda) + tributos por dentro + CIP. `demandPosts` tem 1 entrada na
     * Horária Verde/Convencional Binômia e 2 na Azul (Fase 20). Energia
     * reativa excedente não é modelada aqui.
     *
     * @param input - Demanda(s) contratada(s)/medida(s) e tarifa de demanda por posto, consumo e tarifa de cada posto de energia, tributos, bandeira vigente e CIP.
     * @returns A decomposição completa da conta do Grupo A (demanda, ultrapassagem, consumo por posto, bandeira, tributos, CIP) e o total.
     */
    calculateForGroupA(input: GroupATariffInput): GroupATariffResult {
        const demandByPost = input.demandPosts.map((p) => this.calculateDemandPost(p))
        const demandBrl = demandByPost.reduce((sum, p) => sum + p.demandBrl, 0)
        const ultrapassagemBrl = demandByPost.reduce((sum, p) => sum + p.ultrapassagemBrl, 0)

        const energyByPost = input.energyByPost.map((p) => ({
            post: p.post,
            kwhConsumed: p.kwhConsumed,
            brl: p.kwhConsumed * (p.tusdPerKwh + p.tePerKwh),
        }))
        const energyBrl = energyByPost.reduce((sum, p) => sum + p.brl, 0)

        const totalKwhConsumed = input.energyByPost.reduce((sum, p) => sum + p.kwhConsumed, 0)
        const flagBrl = totalKwhConsumed * (input.flagPer100Kwh / 100)

        const totalBeforeTaxes = demandBrl + ultrapassagemBrl + energyBrl + flagBrl
        const { taxesBrl, totalWithTaxes } = this.applyTaxesByDentro(
            totalBeforeTaxes,
            input.icmsRate,
            input.pisRate,
            input.cofinsRate,
        )

        const publicLightingFeeBrl = input.publicLightingFeeBrl ?? 0

        return {
            demandByPost,
            demandBrl,
            ultrapassagemBrl,
            energyByPost,
            energyBrl,
            flagBrl,
            taxesBrl,
            publicLightingFeeBrl,
            totalBrl: totalWithTaxes + publicLightingFeeBrl,
        }
    }

    // Alvo PROPERTY: aplica o piso de disponibilidade (mínimo faturável) e
    // soma a CIP municipal FORA da base de tributos (é uma taxa fixa da
    // prefeitura, não energia elétrica).
    calculateForProperty(input: PropertyTariffInput): TariffResult {
        const floorKwh = AVAILABILITY_FLOOR_KWH[input.electricalSystem]
        const kwhBilled = Math.max(input.kwhConsumed, floorKwh)

        const core = this.calculateCore(
            kwhBilled,
            input.tusdPerKwh,
            input.tePerKwh,
            input.icmsRate,
            input.pisRate,
            input.cofinsRate,
            input.flagPer100Kwh,
        )

        const publicLightingFeeBrl = input.publicLightingFeeBrl ?? 0

        return {
            kwhBilled,
            energyBrl: core.energyBrl,
            flagBrl: core.flagBrl,
            taxesBrl: core.taxesBrl,
            publicLightingFeeBrl,
            totalBrl: core.totalWithTaxes + publicLightingFeeBrl,
        }
    }

    // Alvo AREA/DEVICE: só energia + bandeira + tributos sobre o consumo real
    // do submedidor — sem piso (não é a UC inteira) e sem CIP (cobrada uma
    // única vez na conta da UC, não pró-rata por área/dispositivo).
    calculateForSubTarget(input: SubTargetTariffInput): TariffResult {
        const core = this.calculateCore(
            input.kwhConsumed,
            input.tusdPerKwh,
            input.tePerKwh,
            input.icmsRate,
            input.pisRate,
            input.cofinsRate,
            input.flagPer100Kwh,
        )

        return {
            kwhBilled: input.kwhConsumed,
            energyBrl: core.energyBrl,
            flagBrl: core.flagBrl,
            taxesBrl: core.taxesBrl,
            publicLightingFeeBrl: 0,
            totalBrl: core.totalWithTaxes,
        }
    }
}
