import { PrismaClient, IoTProtocol, Prisma } from "@/generated/prisma/client.js"
import type { CreateIoTConfigInput, UpdateIoTConfigInput } from "@/modules/iot/iot.schema.js"

export type IoTConfigResponse = {
    id:        string
    deviceId:  string
    protocol:  IoTProtocol
    host:      string | null
    port:      number | null
    topic:     string | null
    address:   string | null
    extra:     Record<string, unknown> | null
    createdAt: Date
    updatedAt: Date
}

type PrismaIoTConfig = NonNullable<
    Awaited<ReturnType<PrismaClient["ioTDeviceConfig"]["findUnique"]>>
>

//  Conversão JsonValue → Record 
// O Prisma retorna campos Json? como Prisma.JsonValue | null.
// Prisma.JsonValue é um tipo union recursivo (string | number | boolean | null | …).
// Como controlamos o que gravamos (Zod garante que `extra` é sempre um objeto),
// o cast para Record<string, unknown> | null é seguro aqui.

function toIoTConfigResponse(raw: PrismaIoTConfig): IoTConfigResponse {
    return {
        id:        raw.id,
        deviceId:  raw.deviceId,
        protocol:  raw.protocol,
        host:      raw.host,
        port:      raw.port,
        topic:     raw.topic,
        address:   raw.address,
        extra:     raw.extra as Record<string, unknown> | null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }
}

// Helpers para gravar Json? no Prisma
// O Prisma 7 exige que campos Json? recebam Prisma.JsonNull (não o null nativo
// do JS) quando o valor for nulo. Para valores presentes, aceita qualquer
// Prisma.InputJsonValue. Esta função faz a conversão necessária.

function toJsonInput(value: Record<string, unknown> | undefined | null): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    if (value === null || value === undefined) return Prisma.JsonNull
    return value as Prisma.InputJsonValue
}

// Extração segura de campos opcionais da union discriminada
// Com exactOptionalPropertyTypes: true, uma propriedade ausente na union
// (ex: `host` num objeto com protocol: "RS485") não existe no tipo — não
// é `undefined`, ela está literalmente ausente. O operador `in` é a única
// forma correta de checar isso em runtime sem violar o strict mode.

function extractField<T>(input: object, key: string): T | null {
    return key in input ? ((input as Record<string, T>)[key] ?? null) : null
}

export class IoTRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findByDeviceId(deviceId: string): Promise<IoTConfigResponse | null> {
        const raw = await this.prisma.ioTDeviceConfig.findUnique({
            where: { deviceId },
        })
        return raw ? toIoTConfigResponse(raw) : null
    }

    async create(deviceId: string, input: CreateIoTConfigInput): Promise<IoTConfigResponse> {
        const raw = await this.prisma.ioTDeviceConfig.create({
            data: {
                deviceId,
                protocol: input.protocol,
                host:    extractField<string>(input, "host"),
                port:    extractField<number>(input, "port"),
                topic:   extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                extra:   toJsonInput(extractField<Record<string, unknown>>(input, "extra")),
            },
        })
        return toIoTConfigResponse(raw)
    }

    async update(deviceId: string, input: UpdateIoTConfigInput): Promise<IoTConfigResponse> {
        const raw = await this.prisma.ioTDeviceConfig.update({
            where: { deviceId },
            data: {
                protocol: input.protocol,
                host:    extractField<string>(input, "host"),
                port:    extractField<number>(input, "port"),
                topic:   extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                extra:   toJsonInput(extractField<Record<string, unknown>>(input, "extra")),
            },
        })
        return toIoTConfigResponse(raw)
    }

    async delete(deviceId: string): Promise<void> {
        await this.prisma.ioTDeviceConfig.delete({
            where: { deviceId },
        })
    }
}