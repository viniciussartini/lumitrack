import type { TariffFlag } from "@/generated/prisma/client.js"

// Snapshot completo dos 4 valores por 100kWh + a bandeira vigente, no
// formato que `TariffFlagConfig` já usa — o domínio não precisa saber que
// a fonte é a ANEEL nem como o dado foi obtido (DIP, `06-code-quality-standards.md`).
export interface TariffFlagSnapshot {
    flag: TariffFlag
    greenPer100Kwh: number
    yellowPer100Kwh: number
    redP1Per100Kwh: number
    redP2Per100Kwh: number
}

// Implementações lançam em qualquer falha (rede, timeout, payload que não
// valida) — nunca retornam um snapshot parcial ou com valor adivinhado.
// Quem chama decide o que fazer com a falha (falha fechada: manter o
// último valor conhecido).
export interface ITariffFlagSource {
    fetchCurrent(): Promise<TariffFlagSnapshot>
}
