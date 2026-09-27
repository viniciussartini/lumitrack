import {
    formatApparentPowerKva,
    formatCurrentRms,
    formatElectricalPercent,
    formatFrequencyHz,
    formatPowerFactor,
    formatPowerKw,
    formatReactivePowerKvar,
    formatVoltageRms,
} from "@/lib/format"
import type { ReadingPayload } from "@/lib/sse/appStream"

/** Grandeza não fornecida pelo medidor aparece assim, nunca como 0. */
const ABSENT_VALUE = "-"

export interface ElectricalQuantityRow {
    label: string
    value: string
}

export interface ElectricalQuantityHero {
    label: string
    value: string
}

export type ElectricalQuantityKey = "voltage" | "current" | "power" | "powerFactor" | "thd"

export interface ElectricalQuantityCard {
    key: ElectricalQuantityKey
    title: string
    hero?: ElectricalQuantityHero
    rows: ElectricalQuantityRow[]
}

const fmt = (value: number | undefined, formatter: (v: number) => string): string =>
    value === undefined ? ABSENT_VALUE : formatter(value)

/**
 * Média das 3 fases, ou ausente se qualquer uma faltar — uma média parcial
 * de 2 fases não é uma grandeza real, então não é inventada.
 */
const meanOfPhases = (
    a: number | undefined,
    b: number | undefined,
    c: number | undefined,
): number | undefined =>
    a === undefined || b === undefined || c === undefined ? undefined : (a + b + c) / 3

const sumOfPhases = (
    a: number | undefined,
    b: number | undefined,
    c: number | undefined,
): number | undefined =>
    a === undefined || b === undefined || c === undefined ? undefined : a + b + c

function buildVoltageCard(reading: ReadingPayload): ElectricalQuantityCard {
    const { voltagePhaseA, voltagePhaseB, voltagePhaseC } = reading
    const average = meanOfPhases(voltagePhaseA, voltagePhaseB, voltagePhaseC)

    return {
        key: "voltage",
        title: "Tensão",
        rows: [
            { label: "Fase A", value: fmt(voltagePhaseA, formatVoltageRms) },
            { label: "Fase B", value: fmt(voltagePhaseB, formatVoltageRms) },
            { label: "Fase C", value: fmt(voltagePhaseC, formatVoltageRms) },
            { label: "Fase-neutro média", value: fmt(average, formatVoltageRms) },
            {
                label: "Desequilíbrio",
                value: fmt(reading.voltageUnbalance, formatElectricalPercent),
            },
        ],
    }
}

function buildCurrentCard(reading: ReadingPayload): ElectricalQuantityCard {
    const { currentPhaseA, currentPhaseB, currentPhaseC } = reading
    const average = meanOfPhases(currentPhaseA, currentPhaseB, currentPhaseC)

    return {
        key: "current",
        title: "Corrente",
        rows: [
            { label: "Fase A", value: fmt(currentPhaseA, formatCurrentRms) },
            { label: "Fase B", value: fmt(currentPhaseB, formatCurrentRms) },
            { label: "Fase C", value: fmt(currentPhaseC, formatCurrentRms) },
            // O medidor-alvo não mede nem permite derivar com confiança a
            // corrente de neutro — a linha nunca é uma derivação, é sempre
            // ausente.
            { label: "Neutro", value: ABSENT_VALUE },
            { label: "Média", value: fmt(average, formatCurrentRms) },
        ],
    }
}

function buildPowerCard(reading: ReadingPayload): ElectricalQuantityCard {
    const { activePowerPhaseA, activePowerPhaseB, activePowerPhaseC } = reading
    const total = sumOfPhases(activePowerPhaseA, activePowerPhaseB, activePowerPhaseC)

    return {
        key: "power",
        title: "Potência",
        hero: { label: "Ativa total (3 fases)", value: fmt(total, formatPowerKw) },
        rows: [
            { label: "Reativa", value: fmt(reading.reactivePowerVar, formatReactivePowerKvar) },
            { label: "Aparente", value: fmt(reading.apparentPowerVa, formatApparentPowerKva) },
            { label: "Ativa · fase A", value: fmt(activePowerPhaseA, formatPowerKw) },
            { label: "Ativa · fase B", value: fmt(activePowerPhaseB, formatPowerKw) },
            { label: "Ativa · fase C", value: fmt(activePowerPhaseC, formatPowerKw) },
            { label: "Frequência", value: fmt(reading.frequencyHz, formatFrequencyHz) },
        ],
    }
}

function buildPowerFactorCard(reading: ReadingPayload): ElectricalQuantityCard {
    const { powerFactorPhaseA, powerFactorPhaseB, powerFactorPhaseC } = reading
    const average = meanOfPhases(powerFactorPhaseA, powerFactorPhaseB, powerFactorPhaseC)

    return {
        key: "powerFactor",
        title: "Fator de potência",
        hero: { label: "Média", value: fmt(average, formatPowerFactor) },
        rows: [
            { label: "Fase A", value: fmt(powerFactorPhaseA, formatPowerFactor) },
            { label: "Fase B", value: fmt(powerFactorPhaseB, formatPowerFactor) },
            { label: "Fase C", value: fmt(powerFactorPhaseC, formatPowerFactor) },
        ],
    }
}

function buildThdCard(reading: ReadingPayload): ElectricalQuantityCard {
    return {
        key: "thd",
        title: "Distorção harmônica",
        rows: [
            {
                label: "THD tensão · fase A",
                value: fmt(reading.thdVoltagePhaseA, formatElectricalPercent),
            },
            {
                label: "THD tensão · fase B",
                value: fmt(reading.thdVoltagePhaseB, formatElectricalPercent),
            },
            {
                label: "THD tensão · fase C",
                value: fmt(reading.thdVoltagePhaseC, formatElectricalPercent),
            },
            {
                label: "THD corrente · fase A",
                value: fmt(reading.thdCurrentPhaseA, formatElectricalPercent),
            },
            {
                label: "THD corrente · fase B",
                value: fmt(reading.thdCurrentPhaseB, formatElectricalPercent),
            },
            {
                label: "THD corrente · fase C",
                value: fmt(reading.thdCurrentPhaseC, formatElectricalPercent),
            },
        ],
    }
}

/**
 * Monta os 5 cards da aba "Grandezas Elétricas" (LumiTrack Home v2.dc.html,
 * bloco `gzCards`) a partir de uma leitura SSE. Fase-neutro média (tensão),
 * média (corrente), ativa total (potência) e a média do fator de potência
 * são derivadas aqui, das 3 fases da própria leitura — não reaproveitam os
 * campos agregados pré-existentes (`voltage`/`current`/`powerW`/
 * `powerFactor`), que respondem por um instante de amostragem
 * independente.
 *
 * @param reading Última leitura SSE do medidor (sempre traz as 4 grandezas
 * agregadas; as 22 por fase são individualmente opcionais).
 * @returns Os 5 cards, na ordem do design.
 */
export function buildElectricalQuantityCards(reading: ReadingPayload): ElectricalQuantityCard[] {
    return [
        buildVoltageCard(reading),
        buildCurrentCard(reading),
        buildPowerCard(reading),
        buildPowerFactorCard(reading),
        buildThdCard(reading),
    ]
}
