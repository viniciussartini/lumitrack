import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateDeviceInput, UpdateDeviceInput } from "@/modules/device/device.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import {
    toPropertyResponse,
    type PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaResponse } from "@/modules/area/area.repository.js"

type PrismaDevice = NonNullable<Awaited<ReturnType<PrismaClient["device"]["findUnique"]>>>

export type DeviceResponse = PrismaDevice

export class DeviceRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<DeviceResponse | null> {
        return this.prisma.device.findUnique({ where: { id } })
    }

    // Resolve device + área + propriedade dona numa única query (`include`
    // aninhado), em vez dos 3 round trips sequenciais que `resolveRootProperty`
    // fazia antes — `relationLoadStrategy: "join"` força um SQL JOIN real (a
    // estratégia default do Prisma para `include` é executar uma query por
    // nível de relação, não um join, mesmo aninhado). `Device.areaId` e
    // `Area.propertyId` são FKs obrigatórias, então a única falha possível
    // aqui é o próprio device não existir.
    async findByIdWithProperty(
        id: string,
    ): Promise<{ device: DeviceResponse; area: AreaResponse; property: PropertyResponse } | null> {
        const raw = await this.prisma.device.findUnique({
            where: { id },
            include: { area: { include: { property: true } } },
            relationLoadStrategy: "join",
        })
        if (!raw) return null

        const { area: rawArea, ...device } = raw
        const { property, ...area } = rawArea
        return { device, area, property: toPropertyResponse(property) }
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

    // Usado pela exportação de dados do titular — filtro de relação
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
