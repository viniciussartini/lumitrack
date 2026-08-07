import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateDeviceInput, UpdateDeviceInput } from "@/modules/device/device.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaDevice = NonNullable<Awaited<ReturnType<PrismaClient["device"]["findUnique"]>>>

export type DeviceResponse = PrismaDevice

export class DeviceRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<DeviceResponse | null> {
        return this.prisma.device.findUnique({ where: { id } })
    }

    async findAllByArea(areaId: string): Promise<DeviceResponse[]> {
        return this.prisma.device.findMany({
            where: { areaId },
            orderBy: { name: "asc" },
        })
    }

    async findAllByAreaPaginated(
        areaId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<DeviceResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [devices, total] = await Promise.all([
            this.prisma.device.findMany({
                where: { areaId },
                orderBy: { name: "asc" },
                skip,
                take,
            }),
            this.prisma.device.count({ where: { areaId } }),
        ])

        return { items: devices, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    // Usado pela exportação de dados do titular (#09) — filtro de relação
    // aninhada de 2 níveis (Device → Area → Property → User).
    async findAllByUser(userId: string): Promise<DeviceResponse[]> {
        return this.prisma.device.findMany({
            where: { area: { property: { userId } } },
            orderBy: { name: "asc" },
        })
    }

    async create(areaId: string, data: CreateDeviceInput): Promise<DeviceResponse> {
        return this.prisma.device.create({
            data: {
                areaId,
                name: data.name,
                brand: data.brand ?? null,
                model: data.model ?? null,
                powerWatts: data.powerWatts ?? null,
            },
        })
    }

    async update(id: string, data: UpdateDeviceInput): Promise<DeviceResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.device.update({
            where: { id },
            data: cleanData,
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.device.delete({ where: { id } })
    }
}
