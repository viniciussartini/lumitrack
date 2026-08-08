import { PrismaClient, TargetType, IoTProtocol, Prisma } from "@/generated/prisma/client.js"
import type { CreateMeterInput, UpdateMeterInput } from "@/modules/meter/meter.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import {
    encryptMeterCredential,
    decryptMeterCredential,
} from "@/shared/crypto/meterCredentialEncryption.js"
import type { MeterConnectionConfig } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

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

// Issue #182 — só MQTT carrega credencial (username/password) em `extra`; os
// demais protocolos usam parâmetros de polling/endereçamento, nada sensível
// (ver IoTConnectionManager.ts::createConnection). A resposta pública nunca
// devolve o valor decifrado — só se a senha está definida (mesmo espírito de
// `mfaEnabled` em UserRepository: o dado sensível em si nunca sai do módulo
// que sabe decifrá-lo).
function sanitizeExtraForResponse(
    protocol: IoTProtocol,
    extra: Record<string, unknown> | null,
): Record<string, unknown> | null {
    if (protocol !== "MQTT" || !extra) return extra

    // `passwordSet` sempre presente (true/false) para medidor MQTT, mesmo
    // quando nenhuma senha nunca foi definida — mais informativo que omitir
    // o campo, e reflete literalmente "expõe passwordSet: boolean".
    const { password, ...rest } = extra
    return { ...rest, passwordSet: typeof password === "string" && password.length > 0 }
}

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
        extra: sanitizeExtraForResponse(raw.protocol, raw.extra as Record<string, unknown> | null),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }
}

// Cifra extra.password antes de persistir (só MQTT). Senha ausente/vazia não
// é cifrada — normaliza para "sem senha" (evita mais tarde tentar decifrar
// uma string vazia, que não é um ciphertext válido e lançaria).
function encryptExtraForStorage(
    protocol: IoTProtocol,
    extra: Record<string, unknown> | null,
): Record<string, unknown> | null {
    if (protocol !== "MQTT" || !extra) return extra

    const { password, ...rest } = extra
    if (typeof password !== "string" || password.length === 0) return rest

    return { ...rest, password: encryptMeterCredential(password) }
}

// Decifra extra.password para uso interno do worker IoT (conexão real) —
// nunca exposto via toMeterResponse/API. Mesma relação estrutural de
// UserRepository.findByEmailWithPassword vs. findByEmail.
function decryptExtraForConnection(
    protocol: IoTProtocol,
    extra: Record<string, unknown> | null,
): Record<string, unknown> | null {
    if (protocol !== "MQTT" || !extra || typeof extra.password !== "string") return extra

    return { ...extra, password: decryptMeterCredential(extra.password) }
}

function toConnectionConfig(raw: PrismaMeter): MeterConnectionConfig {
    return {
        meterId: raw.id,
        protocol: raw.protocol,
        host: raw.host,
        port: raw.port,
        topic: raw.topic,
        address: raw.address,
        extra: decryptExtraForConnection(raw.protocol, raw.extra as Record<string, unknown> | null),
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
                extra: toJsonInput(
                    encryptExtraForStorage(
                        input.protocol,
                        extractField<Record<string, unknown>>(input, "extra"),
                    ),
                ),
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
                extra: toJsonInput(
                    encryptExtraForStorage(
                        input.protocol,
                        extractField<Record<string, unknown>>(input, "extra"),
                    ),
                ),
            },
        })
        return toMeterResponse(raw)
    }

    async delete(id: string): Promise<void> {
        await this.prisma.meter.delete({ where: { id } })
    }

    // Só para uso interno do worker IoT (conexão real) — extra.password vem
    // decifrado. Nunca chamado a partir de uma rota HTTP diretamente (ver
    // MeterService.getConnectionConfig/getAllConnectionConfigs).
    async findConnectionConfigById(id: string): Promise<MeterConnectionConfig | null> {
        const raw = await this.prisma.meter.findUnique({ where: { id } })
        return raw ? toConnectionConfig(raw) : null
    }

    // Usado no boot do servidor (server.ts::restoreIoTConnections) para
    // reconectar todos os medidores de uma vez.
    async findAllConnectionConfigs(): Promise<MeterConnectionConfig[]> {
        const rows = await this.prisma.meter.findMany()
        return rows.map(toConnectionConfig)
    }
}
