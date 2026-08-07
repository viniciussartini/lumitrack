import { PrismaClient, TargetType, IoTProtocol, Prisma } from "@/generated/prisma/client.js"
import type { CreateMeterInput, UpdateMeterInput } from "@/modules/meter/meter.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

export type MeterResponse = {
    id: string
    name: string
    targetType: TargetType
    propertyId: string | null
    areaId: string | null
    deviceId: string | null
    protocol: IoTProtocol
    host: string | null
    port: number | null
    topic: string | null
    address: string | null
    extra: Record<string, unknown> | null
    createdAt: Date
    updatedAt: Date
}

type PrismaMeter = NonNullable<Awaited<ReturnType<PrismaClient["meter"]["findUnique"]>>>

function toMeterResponse(raw: PrismaMeter): MeterResponse {
    return {
        id: raw.id,
        name: raw.name,
        targetType: raw.targetType,
        propertyId: raw.propertyId,
        areaId: raw.areaId,
        deviceId: raw.deviceId,
        protocol: raw.protocol,
        host: raw.host,
        port: raw.port,
        topic: raw.topic,
        address: raw.address,
        extra: raw.extra as Record<string, unknown> | null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }
}

// O Prisma 7 exige Prisma.JsonNull (não o null nativo do JS) para gravar nulo
// num campo Json?. Para valores presentes, aceita qualquer InputJsonValue.
function toJsonInput(
    value: Record<string, unknown> | undefined | null,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    if (value === null || value === undefined) return Prisma.JsonNull
    return value as Prisma.InputJsonValue
}

// Extração segura de campos opcionais da union discriminada por protocolo.
// Com exactOptionalPropertyTypes: true, uma propriedade ausente (ex: `host`
// num objeto com protocol: "RS485") não existe no tipo — o operador `in` é a
// única forma correta de checar isso em runtime sem violar o strict mode.
function extractField<T>(input: object, key: string): T | null {
    return key in input ? ((input as Record<string, T>)[key] ?? null) : null
}

export class MeterRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(id: string): Promise<MeterResponse | null> {
        const raw = await this.prisma.meter.findUnique({ where: { id } })
        return raw ? toMeterResponse(raw) : null
    }

    async findByTarget(targetType: TargetType, targetId: string): Promise<MeterResponse | null> {
        const where =
            targetType === "PROPERTY"
                ? { propertyId: targetId }
                : targetType === "AREA"
                  ? { areaId: targetId }
                  : { deviceId: targetId }

        const raw = await this.prisma.meter.findFirst({ where })
        return raw ? toMeterResponse(raw) : null
    }

    // Une os 3 caminhos de posse (medidor de property, de area ou de device
    // do usuário) numa única query via OR de relação aninhada.
    async findAllByUser(userId: string): Promise<MeterResponse[]> {
        const rows = await this.prisma.meter.findMany({
            where: {
                OR: [
                    { property: { userId } },
                    { area: { property: { userId } } },
                    { device: { area: { property: { userId } } } },
                ],
            },
            orderBy: { name: "asc" },
        })
        return rows.map(toMeterResponse)
    }

    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<MeterResponse>> {
        const { skip, take } = toSkipTake(pagination)
        const where = {
            OR: [
                { property: { userId } },
                { area: { property: { userId } } },
                { device: { area: { property: { userId } } } },
            ],
        }

        const [rows, total] = await Promise.all([
            this.prisma.meter.findMany({ where, orderBy: { name: "asc" }, skip, take }),
            this.prisma.meter.count({ where }),
        ])

        return {
            items: rows.map(toMeterResponse),
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
        }
    }

    async create(input: CreateMeterInput): Promise<MeterResponse> {
        const raw = await this.prisma.meter.create({
            data: {
                name: input.name,
                targetType: input.targetType,
                propertyId: input.propertyId ?? null,
                areaId: input.areaId ?? null,
                deviceId: input.deviceId ?? null,
                protocol: input.protocol,
                host: extractField<string>(input, "host"),
                port: extractField<number>(input, "port"),
                topic: extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                extra: toJsonInput(extractField<Record<string, unknown>>(input, "extra")),
            },
        })
        return toMeterResponse(raw)
    }

    async update(id: string, input: UpdateMeterInput): Promise<MeterResponse> {
        const raw = await this.prisma.meter.update({
            where: { id },
            data: {
                name: input.name,
                protocol: input.protocol,
                host: extractField<string>(input, "host"),
                port: extractField<number>(input, "port"),
                topic: extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                extra: toJsonInput(extractField<Record<string, unknown>>(input, "extra")),
            },
        })
        return toMeterResponse(raw)
    }

    async delete(id: string): Promise<void> {
        await this.prisma.meter.delete({ where: { id } })
    }
}
