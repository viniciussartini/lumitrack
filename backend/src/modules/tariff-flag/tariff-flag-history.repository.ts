import {
    PrismaClient,
    Prisma,
    TariffFlag,
    TariffFlagChangeSource,
} from "@/generated/prisma/client.js"
import type { TariffFlagConfigResponse } from "@/modules/tariff-flag/tariff-flag.repository.js"

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

// Só grava — sem endpoint de leitura (evita escopo extra sem consumidor real).
export class TariffFlagHistoryRepository {
    constructor(private readonly prisma: PrismaClient) {}

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
}
