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

    // Usado pela exportação de dados do titular (#09) — ConsumptionRecord é
    // polimórfico (propertyId | areaId | deviceId, exatamente um
    // preenchido, sem FK direta para userId). Resolve com uma única query
    // via OR de relação aninhada, sem precisar buscar os IDs de
    // properties/areas/devices do usuário antes — evita duas viagens ao
    // banco e arrays grandes de IDs em memória. Sem paginação, de propósito
    // (Art. 18 pede integralidade); o resumo agregado usado no PDF é
    // calculado em memória a partir deste mesmo resultado (ver
    // shared/pdf/dataExportPdf.ts), sem segunda query.
    async findAllByUser(userId: string): Promise<ConsumptionResponse[]> {
        return this.prisma.consumptionRecord.findMany({
            where: {
                OR: [
                    { property: { userId } },
                    { area: { property: { userId } } },
                    { device: { area: { property: { userId } } } },
                ],
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