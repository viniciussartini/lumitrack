// Janelas de anomalia histórica — 6 episódios espalhados pelo ano, cada um
// associado a um dos 3 medidores com Alert configurado (residencial, geral
// comercial, forno — ver alerts.ts). Escolhidos em horário de atividade
// normal do respectivo perfil (ver consumptionGen.ts) para que o pico seja
// visualmente um desvio real da curva, não um salto a partir do zero.
//
// `AlertTriggerEvent` é gravado diretamente a partir das amostras geradas
// nesta janela (ver readings.ts) — nunca via `AlertEvaluator` ao vivo, que
// não reprocessa histórico (PLANO_SIMULADOR_IOT_E_SEED_DEMO.md, Fase 2).

export type AnomalyMeterKey = "residential" | "commercialGeneral" | "oven"

export interface AnomalyWindow {
    meterKey: AnomalyMeterKey
    startUtc: Date
    durationMinutes: number
    multiplier: number
}

export const ANOMALY_WINDOWS: readonly AnomalyWindow[] = [
    // Residencial — pico noturno (chuveiro + forno elétrico simultâneos).
    {
        meterKey: "residential",
        startUtc: new Date("2025-08-14T23:40:00.000Z"),
        durationMinutes: 5,
        multiplier: 2.4,
    },
    {
        meterKey: "residential",
        startUtc: new Date("2026-03-03T00:10:00.000Z"),
        durationMinutes: 7,
        multiplier: 3.1,
    },

    // Comercial geral — pico em horário de expediente (equipamento extra ligado).
    {
        meterKey: "commercialGeneral",
        startUtc: new Date("2025-10-08T18:20:00.000Z"),
        durationMinutes: 4,
        multiplier: 2.8,
    },
    {
        meterKey: "commercialGeneral",
        startUtc: new Date("2026-05-19T14:05:00.000Z"),
        durationMinutes: 9,
        multiplier: 2.1,
    },

    // Forno — pico durante janela de produção (sobrecarga do elemento de aquecimento).
    {
        meterKey: "oven",
        startUtc: new Date("2025-12-11T08:15:00.000Z"),
        durationMinutes: 6,
        multiplier: 3.5,
    },
    {
        meterKey: "oven",
        startUtc: new Date("2026-06-24T17:40:00.000Z"),
        durationMinutes: 3,
        multiplier: 2.6,
    },
]

/** Multiplicador de anomalia ativo no minuto informado para o medidor, ou 1 (sem anomalia). */
export function anomalyMultiplierAt(meterKey: AnomalyMeterKey, minuteStartUtc: Date): number {
    const t = minuteStartUtc.getTime()
    for (const window of ANOMALY_WINDOWS) {
        if (window.meterKey !== meterKey) continue
        const start = window.startUtc.getTime()
        const end = start + window.durationMinutes * 60_000
        if (t >= start && t < end) return window.multiplier
    }
    return 1
}
