import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateConsumptionInput, UpdateConsumptionInput, ConsumptionPeriod } from "@/modules/consumption/consumption.schema.js"

type PrismaConsumption = NonNullable<
    Awaited<ReturnType<PrismaClient["consumptionRecord"]["findUnique"]>>
>

export type ConsumptionResponse = PrismaConsumption

// Identifica qual FK preencher — exatamente um deve ser informado.
export type ConsumptionTarget =
    | { propertyId: string; areaId?: never; deviceId?: never }
    | { areaId: string; propertyId?: never; deviceId?: never }
    | { deviceId: string; propertyId?: never; areaId?: never }

export class ConsumptionRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<ConsumptionResponse | null> {
        return this.prisma.consumptionRecord.findUnique({ where: { id } })
    }

    // Busca para verificar unicidade: period + target + referenceDate
    async findByTargetAndPeriod(
        target: ConsumptionTarget,
        period: ConsumptionPeriod,
        referenceDate: Date,
    ): Promise<ConsumptionResponse | null> {
        return this.prisma.consumptionRecord.findFirst({
            where: {
                ...target,
                period,
                referenceDate,
            },
        })
    }

    async findAllByTarget(
        target: ConsumptionTarget,
        period?: ConsumptionPeriod,
    ): Promise<ConsumptionResponse[]> {
        return this.prisma.consumptionRecord.findMany({
            where: {
                ...target,
                ...(period ? { period } : {}),
            },
            orderBy: { referenceDate: "desc" },
        })
    }

    async create(
        target: ConsumptionTarget,
        data: CreateConsumptionInput,
        costBrl: number,
    ): Promise<ConsumptionResponse> {
        return this.prisma.consumptionRecord.create({
            data: {
                ...target,
                period: data.period,
                referenceDate: data.referenceDate,
                kwhConsumed: data.kwhConsumed,
                costBrl,
                notes: data.notes ?? null,
            },
        })
    }

    async update(
        id: string,
        data: UpdateConsumptionInput,
        costBrl?: number,
    ): Promise<ConsumptionResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.consumptionRecord.update({
            where: { id },
            data: {
                ...cleanData,
                ...(costBrl !== undefined ? { costBrl } : {}),
            },
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.consumptionRecord.delete({ where: { id } })
    }
}