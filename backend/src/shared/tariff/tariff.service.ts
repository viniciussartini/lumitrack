import type { ElectricalSystemType } from "@/generated/prisma/client.js"

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

export class TariffService {
    // Cálculo "por dentro": os tributos incidem sobre o próprio preço final,
    // não sobre a base antes deles — é assim que a conta de energia
    // brasileira funciona (ICMS/PIS/COFINS por dentro).
    //   total = (energia + bandeira) / (1 − (icms + pis + cofins))
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
        const taxRateSum = icmsRate + pisRate + cofinsRate
        const totalBeforeTaxes = energyBrl + flagBrl
        const totalWithTaxes = totalBeforeTaxes / (1 - taxRateSum)
        const taxesBrl = totalWithTaxes - totalBeforeTaxes

        return { energyBrl, flagBrl, taxesBrl, totalWithTaxes }
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
