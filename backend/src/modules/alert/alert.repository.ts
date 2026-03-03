import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAlertInput, UpdateAlertInput } from "@/modules/alert/alert.schema.js"

type PrismaAlert = NonNullable<
    Awaited<ReturnType<PrismaClient["alert"]["findUnique"]>>
>

export type AlertResponse = PrismaAlert

// Um dos três FKs deve ser preenchido por alerta.
export type AlertTarget =
    | { propertyId: string; areaId?: never; deviceId?: never }
    | { areaId: string; propertyId?: never; deviceId?: never }
    | { deviceId: string; propertyId?: never; areaId?: never }

export class AlertRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<AlertResponse | null> {
        return this.prisma.alert.findUnique({ where: { id } })
    }

    async findAllByUser(userId: string, triggered?: boolean

    ): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({
            where: {
                userId,
                ...(triggered === true
                    ? { triggeredAt: { not: null } }
                    : triggered === false
                    ? { triggeredAt: null }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
        })
    }

    async findAllByTarget(target: AlertTarget): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({
            where: { ...target },
            orderBy: { createdAt: "desc" },
        })
    }

    // Busca alertas de um target que ainda não foram disparados —
    // usado pelo mecanismo de disparo automático no ConsumptionService.
    async findActiveByTarget(target: AlertTarget): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({
            where: {
                ...target,
                triggeredAt: null,
            },
        })
    }

    async create(
        userId: string,
        target: AlertTarget,
        targetType: "PROPERTY" | "AREA" | "DEVICE",
        data: CreateAlertInput,
    ): Promise<AlertResponse> {
        return this.prisma.alert.create({
            data: {
                userId,
                targetType,
                ...target,
                thresholdKwh: data.thresholdKwh,
                message: data.message ?? null,
            },
        })
    }

    async update(id: string, data: UpdateAlertInput): Promise<AlertResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        return this.prisma.alert.update({ where: { id }, data: cleanData })
    }

    // Preenche triggeredAt com o momento atual.
    async trigger(id: string): Promise<AlertResponse> {
        return this.prisma.alert.update({
            where: { id },
            data: { triggeredAt: new Date() },
        })
    }

    async markAsRead(id: string): Promise<AlertResponse> {
        return this.prisma.alert.update({
            where: { id },
            data: { readAt: new Date() },
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.alert.delete({ where: { id } })
    }
}