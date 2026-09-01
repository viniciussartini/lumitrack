import {
    PrismaClient,
    Prisma,
    TariffFlag,
    TariffFlagChangeSource,
} from "@/generated/prisma/client.js"
import type { TariffFlagConfigResponse } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"

// Snapshot dos 4 valores por 100kWh, sem o `currentFlag`/`updatedAt` — é o
// que efetivamente diverge entre "antes" e "depois" além da bandeira em si.
type TariffFlagValuesSnapshot = Pick<
    TariffFlagConfigResponse,
    "greenPer100Kwh" | "yellowPer100Kwh" | "redP1Per100Kwh" | "redP2Per100Kwh"
>

export interface TariffFlagHistoryEntry {
    previousFlag: TariffFlag | null
    newFlag: TariffFlag
    previousValues: TariffFlagValuesSnapshot | null
    newValues: TariffFlagValuesSnapshot
    source: TariffFlagChangeSource
    changedByUserId: string | null
}

/**
 * Histórico de trocas de bandeira tarifária. Só grava — sem endpoint de
 * leitura (evita escopo extra sem consumidor real).
 */
export class TariffFlagHistoryRepository {
    /** @param prisma - Cliente Prisma usado para persistir o histórico de bandeiras. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Registra uma troca de bandeira tarifária, com os valores antes e
     * depois da mudança.
     *
     * @param entry - Dados da troca a registrar.
     */
    async create(entry: TariffFlagHistoryEntry): Promise<void> {
        await this.prisma.tariffFlagHistory.create({
            data: {
                previousFlag: entry.previousFlag,
                newFlag: entry.newFlag,
                ...(entry.previousValues
                    ? { previousValues: entry.previousValues as Prisma.InputJsonValue }
                    : {}),
                newValues: entry.newValues as Prisma.InputJsonValue,
                source: entry.source,
                changedByUserId: entry.changedByUserId,
            },
        })
    }

    /**
     * Expurgo por retenção — remove entradas de histórico mais antigas que
     * `threshold`, por `createdAt`. Suportado pelo `@@index([createdAt])`
     * já existente.
     *
     * @param threshold - Data-limite; entradas anteriores a ela são removidas.
     * @returns Quantidade de entradas removidas.
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.tariffFlagHistory.deleteMany({
                where: { createdAt: { lt: threshold } },
            })
            return result.count
        })
    }
}
