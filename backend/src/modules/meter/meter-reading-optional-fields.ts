/**
 * As 22 grandezas por fase (ADR-0022) que `MeterReading` pode conter — o
 * contrato entre o nome da grandeza numa amostra bruta e o nome da coluna
 * agregada persistida (prefixo "avg", espelhando o par voltage/avgVoltage
 * já existente). Fonte única desta renomeação: o worker que acumula o
 * balde em memória (`MinuteBuffer`), o merge SQL do upsert
 * (`MeterReadingRepository`) e a validação/extração do payload bruto
 * (`IoTDataProcessor`) usam esta mesma tabela em vez de repetir os 22
 * pares manualmente em cada lugar.
 *
 * Vive no módulo `meter` (não em `iot/iot-worker`) porque é o contrato das
 * colunas de `meter_readings` — dado de persistência, não estado efêmero do
 * worker; o worker importa daqui, não o contrário.
 */
export const OPTIONAL_ELECTRICAL_FIELD_MAP = [
    ["voltagePhaseA", "avgVoltagePhaseA"],
    ["voltagePhaseB", "avgVoltagePhaseB"],
    ["voltagePhaseC", "avgVoltagePhaseC"],
    ["voltageUnbalance", "avgVoltageUnbalance"],
    ["currentPhaseA", "avgCurrentPhaseA"],
    ["currentPhaseB", "avgCurrentPhaseB"],
    ["currentPhaseC", "avgCurrentPhaseC"],
    ["activePowerPhaseA", "avgActivePowerPhaseA"],
    ["activePowerPhaseB", "avgActivePowerPhaseB"],
    ["activePowerPhaseC", "avgActivePowerPhaseC"],
    ["reactivePowerVar", "avgReactivePowerVar"],
    ["apparentPowerVa", "avgApparentPowerVa"],
    ["frequencyHz", "avgFrequencyHz"],
    ["powerFactorPhaseA", "avgPowerFactorPhaseA"],
    ["powerFactorPhaseB", "avgPowerFactorPhaseB"],
    ["powerFactorPhaseC", "avgPowerFactorPhaseC"],
    ["thdVoltagePhaseA", "avgThdVoltagePhaseA"],
    ["thdVoltagePhaseB", "avgThdVoltagePhaseB"],
    ["thdVoltagePhaseC", "avgThdVoltagePhaseC"],
    ["thdCurrentPhaseA", "avgThdCurrentPhaseA"],
    ["thdCurrentPhaseB", "avgThdCurrentPhaseB"],
    ["thdCurrentPhaseC", "avgThdCurrentPhaseC"],
] as const

export type OptionalSampleField = (typeof OPTIONAL_ELECTRICAL_FIELD_MAP)[number][0]
export type OptionalAvgField = (typeof OPTIONAL_ELECTRICAL_FIELD_MAP)[number][1]

// `?: number | undefined` (em vez de `Partial<Record<..., number>>`) porque o
// projeto compila com `exactOptionalPropertyTypes` — sem o `| undefined`
// explícito, atribuir `undefined` a um campo ausente (ex.: o resultado de
// `computeVoltageUnbalance` quando faltam fases) seria erro de tipo, mesmo a
// propriedade sendo opcional.
export type OptionalElectricalFields = { [K in OptionalSampleField]?: number | undefined }

/**
 * As 22 grandezas por fase, todas `null` — a base para montar um
 * `MeterReading` sem nenhuma delas (medidor legado, ou teste que não é sobre
 * elas). Qualquer código que monte um snapshot fora de `MinuteBuffer` parte
 * daqui em vez de listar as 22 chaves à mão.
 */
export function emptyOptionalAvgFields(): Record<OptionalAvgField, null> {
    const result = {} as Record<OptionalAvgField, null>
    for (const [, avgField] of OPTIONAL_ELECTRICAL_FIELD_MAP) {
        result[avgField] = null
    }
    return result
}
