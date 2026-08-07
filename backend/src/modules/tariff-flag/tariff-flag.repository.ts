import { PrismaClient, TariffFlag } from "@/generated/prisma/client.js"
import type { UpdateTariffFlagInput } from "@/modules/tariff-flag/tariff-flag.schema.js"

export type TariffFlagConfigResponse = {
    currentFlag: TariffFlag
    greenPer100Kwh: number
    yellowPer100Kwh: number
    redP1Per100Kwh: number
    redP2Per100Kwh: number
    updatedAt: Date
}

type PrismaTariffFlagConfig = NonNullable<
    Awaited<ReturnType<PrismaClient["tariffFlagConfig"]["findUnique"]>>
>

function toResponse(raw: PrismaTariffFlagConfig): TariffFlagConfigResponse {
    return {
        currentFlag: raw.currentFlag,
        greenPer100Kwh: raw.greenPer100Kwh.toNumber(),
        yellowPer100Kwh: raw.yellowPer100Kwh.toNumber(),
        redP1Per100Kwh: raw.redP1Per100Kwh.toNumber(),
        redP2Per100Kwh: raw.redP2Per100Kwh.toNumber(),
        updatedAt: raw.updatedAt,
    }
}

// Extrai o valor em R$/100kWh correspondente à bandeira vigente — usado por
// qualquer service que precise custear consumo (ConsumptionService,
// SimulationService), evitando duplicar o mapeamento enum → campo.
const FLAG_FIELD: Record<TariffFlagConfigResponse["currentFlag"], keyof TariffFlagConfigResponse> =
    {
        GREEN: "greenPer100Kwh",
        YELLOW: "yellowPer100Kwh",
        RED_P1: "redP1Per100Kwh",
        RED_P2: "redP2Per100Kwh",
    }

export function resolveFlagPer100Kwh(config: TariffFlagConfigResponse): number {
    return config[FLAG_FIELD[config.currentFlag]] as number
}

// Singleton (id fixo = 1) — populado pelo seed. `get()` nunca deveria
// retornar null em ambiente seedado; ainda assim o service trata a ausência
// como NotFoundError em vez de assumir.
export class TariffFlagRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async get(): Promise<TariffFlagConfigResponse | null> {
        const raw = await this.prisma.tariffFlagConfig.findUnique({ where: { id: 1 } })
        return raw ? toResponse(raw) : null
    }

    async update(data: UpdateTariffFlagInput): Promise<TariffFlagConfigResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        const raw = await this.prisma.tariffFlagConfig.update({
            where: { id: 1 },
            data: cleanData,
        })
        return toResponse(raw)
    }
}
