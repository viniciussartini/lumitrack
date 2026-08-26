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

// Cache em nível de módulo, não de instância: várias rotas (consumption,
// simulation, tariff-flag, o sync da ANEEL) instanciam seu próprio
// `new TariffFlagRepository(prismaClient)` sobre o mesmo Postgres — um cache
// por instância deixaria a invalidação feita por uma rota invisível às
// outras. `update()` é o único caminho de escrita da aplicação (chamado
// tanto pelo sync automático quanto pela rota admin manual), por isso
// invalida ali. O TTL abaixo é só um backstop contra uma escrita fora da
// aplicação (ex.: `prisma/seed.ts` reexecutado contra um processo já no
// ar) — sem ele, uma bandeira trocada por fora do `update()` ficaria
// presa em cache para sempre, até reiniciar o servidor.
const CACHE_TTL_MS = 5 * 60 * 1000
let cachedConfig: TariffFlagConfigResponse | null = null
let cachedAt = 0

// Singleton (id fixo = 1) — populado pelo seed. `get()` nunca deveria
// retornar null em ambiente seedado; ainda assim o service trata a ausência
// como NotFoundError em vez de assumir.
export class TariffFlagRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async get(): Promise<TariffFlagConfigResponse | null> {
        if (cachedConfig && Date.now() - cachedAt < CACHE_TTL_MS) return cachedConfig

        const raw = await this.prisma.tariffFlagConfig.findUnique({ where: { id: 1 } })
        if (!raw) return null

        cachedConfig = toResponse(raw)
        cachedAt = Date.now()
        return cachedConfig
    }

    async update(data: UpdateTariffFlagInput): Promise<TariffFlagConfigResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        const raw = await this.prisma.tariffFlagConfig.update({
            where: { id: 1 },
            data: cleanData,
        })
        cachedConfig = toResponse(raw)
        cachedAt = Date.now()
        return cachedConfig
    }
}

// Estado de módulo sobrevive entre testes do mesmo arquivo — sem isto, o
// primeiro `get()` bem-sucedido de uma suíte "vazaria" para os testes
// seguintes mesmo depois do `cleanDatabase()` recriar os dados. Chamado por
// `cleanDatabase()`, não pelos arquivos de teste individualmente.
export function resetTariffFlagCacheForTests(): void {
    cachedConfig = null
    cachedAt = 0
}
