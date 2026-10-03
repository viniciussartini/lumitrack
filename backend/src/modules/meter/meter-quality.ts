/** Uma grandeza do relatório de qualidade de energia e as colunas de `meter_readings` que a alimentam. */
export interface PowerQualityQuantity {
    key: string
    label: string
    unit: string
    fractionDigits: number
    /** Uma coluna por fase (A, B, C) ou uma única coluna sem fase. */
    columns: readonly string[]
}

const PHASES = ["A", "B", "C"] as const
const perPhase = (prefix: string): string[] => PHASES.map((phase) => `${prefix}Phase${phase}`)

/**
 * Grandezas do relatório de qualidade de energia, na ordem em que aparecem.
 * Os nomes de coluna são constantes do código (nunca entrada do usuário), o
 * que permite interpolá-los no SQL cru.
 */
export const POWER_QUALITY_QUANTITIES: readonly PowerQualityQuantity[] = [
    {
        key: "voltage",
        label: "Tensão",
        unit: "V",
        fractionDigits: 1,
        columns: perPhase("avgVoltage"),
    },
    {
        key: "current",
        label: "Corrente",
        unit: "A",
        fractionDigits: 2,
        columns: perPhase("avgCurrent"),
    },
    {
        key: "powerFactor",
        label: "Fator de potência",
        unit: "",
        fractionDigits: 3,
        columns: perPhase("avgPowerFactor"),
    },
    {
        key: "thdVoltage",
        label: "THD de tensão",
        unit: "%",
        fractionDigits: 2,
        columns: perPhase("avgThdVoltage"),
    },
    {
        key: "thdCurrent",
        label: "THD de corrente",
        unit: "%",
        fractionDigits: 2,
        columns: perPhase("avgThdCurrent"),
    },
    {
        key: "unbalance",
        label: "Desequilíbrio de tensão",
        unit: "%",
        fractionDigits: 2,
        columns: ["avgVoltageUnbalance"],
    },
    {
        key: "frequency",
        label: "Frequência",
        unit: "Hz",
        fractionDigits: 2,
        columns: ["avgFrequencyHz"],
    },
]

/** Mínimo, média ponderada e máximo de uma coluna no período; `null` se o medidor nunca a reportou. */
export interface PowerQualityStat {
    min: number | null
    avg: number | null
    max: number | null
}

/** Média de um dia local de uma grandeza (média das fases presentes); `null` sem dado. */
export interface PowerQualityDailyRow {
    /** Dia local de São Paulo, lido pelos getters UTC (convenção dos baldes de consumo). */
    day: Date
    averages: Record<string, number | null>
}

export interface PowerQualityStats {
    /** Indexado pelo nome da coluna de `meter_readings`. */
    period: Record<string, PowerQualityStat>
    daily: PowerQualityDailyRow[]
}
