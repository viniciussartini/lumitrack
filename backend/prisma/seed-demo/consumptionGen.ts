// Gerador puro (sem I/O) de amostras de consumo por minuto, para os 4
// perfis de carga dos medidores demo (ver PLANO_SIMULADOR_IOT_E_SEED_DEMO.md,
// Fase 2 — "Geração de consumo de 1 ano"). Determinístico: mesma seed produz
// sempre a mesma série, sem depender do fuso horário da máquina que roda o
// script (todo cálculo de hora local usa os métodos `getUTC*` sobre um
// timestamp já deslocado, nunca `getHours`/`getDay` do host).

export type MeterProfileKey = "RESIDENTIAL" | "COMMERCIAL_GENERAL" | "SALES_AREA" | "OVEN"

export interface GeneratedMinute {
    avgVoltage: number
    avgCurrent: number
    avgPowerW: number
    avgPowerFactor: number
    kwhConsumed: number
}

// PRNG determinístico (mulberry32) — mesma escolha do iot-simulator para
// evitar dependência externa; aqui usado para reprodutibilidade, lá para
// não precisar de uma lib de RNG em runtime.
export function createRng(seed: number): () => number {
    let a = seed
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Box-Muller — retorna uma amostra de N(0,1).
function gaussianNoise(rng: () => number): number {
    const u1 = Math.max(rng(), Number.EPSILON)
    const u2 = rng()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000

interface LocalParts {
    hourDecimal: number // 0-24
    weekday: number // 0=domingo .. 6=sábado
    dayOfYear: number // 0-365
}

function localParts(minuteStartUtc: Date): LocalParts {
    const local = new Date(minuteStartUtc.getTime() - BRAZIL_UTC_OFFSET_MS)
    const hourDecimal = local.getUTCHours() + local.getUTCMinutes() / 60
    const weekday = local.getUTCDay()

    const startOfYear = Date.UTC(local.getUTCFullYear(), 0, 1)
    const dayOfYear = Math.floor((local.getTime() - startOfYear) / (24 * 60 * 60 * 1000))

    return { hourDecimal, weekday, dayOfYear }
}

// Transições suaves (logística) em vez de degraus — evita "serrote" entre
// minutos consecutivos num gráfico de linha.
function rampUp(hour: number, center: number, steepness: number): number {
    return 1 / (1 + Math.exp(-(hour - center) * steepness))
}
function rampDown(hour: number, center: number, steepness: number): number {
    return 1 - rampUp(hour, center, steepness)
}
// Janela [start, end] com subida/descida suaves.
function openWindow(hour: number, start: number, end: number, steepness = 4): number {
    return rampUp(hour, start, steepness) * rampDown(hour, end, steepness)
}
function gaussianBump(hour: number, center: number, sigmaHours: number, amplitude: number): number {
    return amplitude * Math.exp(-0.5 * ((hour - center) / sigmaHours) ** 2)
}

const isWeekend = (weekday: number): boolean => weekday === 0 || weekday === 6

// Residencial: base baixa + dois lobos de pico (banho/café da manhã, jantar/
// banho à noite), ~25% mais alto no fim de semana, leve sazonalidade de
// verão (uso de ventilador/ar-condicionado em Dez-Fev).
function residentialTargetPowerW(local: LocalParts): number {
    const base = 280
    const morningLobe = gaussianBump(local.hourDecimal, 7, 1.2, 650)
    const eveningLobe = gaussianBump(local.hourDecimal, 20.5, 1.8, 3400)

    const weekendFactor = isWeekend(local.weekday) ? 1.25 : 1
    // Verão no hemisfério sul: pico em torno do dia 15 (15/jan).
    const summerFactor =
        1 + 0.15 * Math.max(0, Math.cos((2 * Math.PI * (local.dayOfYear - 15)) / 365))

    return (base + morningLobe + eveningLobe) * weekendFactor * summerFactor
}

// Comercial geral (padaria/loja): fechado aos domingos, patamar alto
// 8h-19h com dip no horário de almoço.
function commercialGeneralTargetPowerW(local: LocalParts): number {
    if (local.weekday === 0) return 150 // fechado: só geladeiras/standby

    const base = 600
    const plateau = 9500 * openWindow(local.hourDecimal, 8, 19, 3)
    const lunchDip = 1 - 0.35 * openWindow(local.hourDecimal, 12, 14, 6)

    return base + plateau * lunchDip
}

// Área de vendas (submedidor): iluminação + ar-condicionado, mesmo horário
// de funcionamento da loja, escala bem menor que o medidor geral (que cobre
// o prédio inteiro, incluindo cozinha/forno).
function salesAreaTargetPowerW(local: LocalParts): number {
    if (local.weekday === 0) return 40 // fechado: alarme/standby

    const base = 80
    const plateau = 1800 * openWindow(local.hourDecimal, 8, 19, 3)
    const lunchDip = 1 - 0.2 * openWindow(local.hourDecimal, 12, 14, 6)

    return base + plateau * lunchDip
}

// Forno industrial: rajadas curtas concentradas nos horários de produção
// (madrugada para o pão do dia, início da tarde para o lote da tarde),
// desligado fora desses horários e aos domingos.
function ovenTargetPowerW(local: LocalParts): number {
    if (local.weekday === 0) return 0

    const morningProduction = openWindow(local.hourDecimal, 4, 8, 3)
    const afternoonProduction = openWindow(local.hourDecimal, 14, 16, 3)
    const inProduction = Math.max(morningProduction, afternoonProduction)
    if (inProduction < 0.05) return 30 // standby do painel eletrônico

    // Ciclo liga/desliga do elemento de aquecimento (rajadas de ~8-10min)
    // dentro da janela de produção — nunca um patamar constante.
    const cyclePhase = (local.hourDecimal * 60) % 9 // minutos dentro do ciclo de 9min
    const dutyCycle = cyclePhase < 6 ? 1 : 0.15 // ~6min ligado, ~3min em baixa

    return inProduction * 4800 * dutyCycle
}

function targetPowerW(profile: MeterProfileKey, minuteStartUtc: Date): number {
    const local = localParts(minuteStartUtc)
    switch (profile) {
        case "RESIDENTIAL":
            return residentialTargetPowerW(local)
        case "COMMERCIAL_GENERAL":
            return commercialGeneralTargetPowerW(local)
        case "SALES_AREA":
            return salesAreaTargetPowerW(local)
        case "OVEN":
            return ovenTargetPowerW(local)
    }
}

interface ProfileElectricalDefaults {
    nominalVoltage: number
    powerFactorBase: number
    noiseAmplitudePercent: number // ruído relativo (desvio padrão) sobre a potência-alvo
}

const PROFILE_DEFAULTS: Record<MeterProfileKey, ProfileElectricalDefaults> = {
    RESIDENTIAL: { nominalVoltage: 220, powerFactorBase: 0.92, noiseAmplitudePercent: 0.04 },
    COMMERCIAL_GENERAL: { nominalVoltage: 380, powerFactorBase: 0.9, noiseAmplitudePercent: 0.04 },
    SALES_AREA: { nominalVoltage: 380, powerFactorBase: 0.87, noiseAmplitudePercent: 0.05 },
    OVEN: { nominalVoltage: 380, powerFactorBase: 0.97, noiseAmplitudePercent: 0.03 },
}

// Sag de tensão leve durante anomalia (mesmo padrão do iot-simulator —
// simulation/signalGenerator.ts), reforçando visualmente o pico de potência.
const ANOMALY_VOLTAGE_SAG = 0.97

/**
 * Gera a leitura agregada de 1 minuto para um medidor/perfil, já com ruído
 * gaussiano e, opcionalmente, um multiplicador de anomalia (>1) aplicado à
 * potência-alvo. Mantém `P = V·I·PF` fisicamente coerente por construção,
 * derivando a corrente a partir de tensão/potência/FP em vez de gerar os
 * três de forma independente.
 */
export function generateMinuteReading(
    profile: MeterProfileKey,
    minuteStartUtc: Date,
    rng: () => number,
    anomalyMultiplier = 1,
): GeneratedMinute {
    const { nominalVoltage, powerFactorBase, noiseAmplitudePercent } = PROFILE_DEFAULTS[profile]

    const basePower = targetPowerW(profile, minuteStartUtc) * anomalyMultiplier
    const avgPowerW = Math.max(0, basePower * (1 + noiseAmplitudePercent * gaussianNoise(rng)))

    const voltageSag = anomalyMultiplier > 1 ? ANOMALY_VOLTAGE_SAG : 1
    const avgVoltage = nominalVoltage * voltageSag * (1 + 0.008 * gaussianNoise(rng))

    const avgPowerFactor = Math.min(1, Math.max(0, powerFactorBase + 0.015 * gaussianNoise(rng)))

    const avgCurrent = avgPowerFactor > 0 ? avgPowerW / (avgVoltage * avgPowerFactor) : 0

    // Minuto inteiramente coberto por amostras a 1Hz — mesma convenção do
    // MinuteBuffer real (60 amostras, 60s cobertos) para uma linha "íntegra".
    const kwhConsumed = avgPowerW / 60_000

    return { avgVoltage, avgCurrent, avgPowerW, avgPowerFactor, kwhConsumed }
}
