import type { ElectricalSystemType, TariffPost } from "@/generated/prisma/client.js"

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

// Consumo por posto tarifário (RN24) com a tarifa de energia do catálogo do
// Grupo A já resolvida — ver TariffCatalogRepository.
export type GroupAEnergyPostInput = {
    post: TariffPost
    kwhConsumed: number
    tusdPerKwh: number
    tePerKwh: number
}

export type GroupATariffInput = {
    contractedDemandKw: number
    tusdPerKw: number
    energyByPost: GroupAEnergyPostInput[]
    icmsRate: number
    pisRate: number
    cofinsRate: number
    flagPer100Kwh: number
    publicLightingFeeBrl: number | null
}

export type GroupATariffResult = {
    demandBrl: number // demanda contratada × TUSD demanda (RN18, Verde)
    energyByPost: { post: TariffPost; kwhConsumed: number; brl: number }[]
    energyBrl: number // soma dos postos, sem tributos
    flagBrl: number
    taxesBrl: number
    publicLightingFeeBrl: number
    totalBrl: number
}

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

    /**
     * Conta binômia do Grupo A, modalidade Horária Verde (RN17/RN18/RN22/RN23):
     * demanda contratada + consumo por posto + bandeira (só sobre o consumo,
     * nunca sobre a demanda) + tributos por dentro + CIP. ERE e ultrapassagem
     * (RN20/RN21) não são modelados aqui — Fase 20.
     *
     * @param input - Demanda contratada e tarifa de demanda, consumo e tarifa de cada posto, tributos, bandeira vigente e CIP.
     * @returns A decomposição completa da conta (RN15-equivalente para o Grupo A) e o total.
     */
    calculateForGroupA(input: GroupATariffInput): GroupATariffResult {
        const demandBrl = input.contractedDemandKw * input.tusdPerKw

        const energyByPost = input.energyByPost.map((p) => ({
            post: p.post,
            kwhConsumed: p.kwhConsumed,
            brl: p.kwhConsumed * (p.tusdPerKwh + p.tePerKwh),
        }))
        const energyBrl = energyByPost.reduce((sum, p) => sum + p.brl, 0)

        const totalKwhConsumed = input.energyByPost.reduce((sum, p) => sum + p.kwhConsumed, 0)
        const flagBrl = totalKwhConsumed * (input.flagPer100Kwh / 100)

        const totalBeforeTaxes = demandBrl + energyBrl + flagBrl
        const { taxesBrl, totalWithTaxes } = this.applyTaxesByDentro(
            totalBeforeTaxes,
            input.icmsRate,
            input.pisRate,
            input.cofinsRate,
        )

        const publicLightingFeeBrl = input.publicLightingFeeBrl ?? 0

        return {
            demandBrl,
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
