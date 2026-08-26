import { PrismaClient, TargetType, IoTProtocol, Prisma } from "@/generated/prisma/client.js"
import type { CreateMeterInput, UpdateMeterInput } from "@/modules/meter/meter.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import {
    encryptMeterCredential,
    decryptMeterCredential,
} from "@/shared/crypto/meterCredentialEncryption.js"
import type { MeterConnectionConfig } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import {
    toPropertyResponse,
    type PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaResponse } from "@/modules/area/area.repository.js"
import type { DeviceResponse } from "@/modules/device/device.repository.js"

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

export type MeterWithTargetRow = {
    meter: MeterResponse
    property: PropertyResponse | null
    area: AreaResponse | null
    device: DeviceResponse | null
}

// Compartilhado entre `findByIdWithTarget` e `findManyByIdsWithTarget` — a
// mesma forma de `include` nas duas é o que permite ao Prisma tratá-las como
// uma única query em lote quando disparadas concorrentemente.
const METER_TARGET_INCLUDE = {
    property: true,
    area: { include: { property: true } },
    device: { include: { area: { include: { property: true } } } },
} as const

type RawMeterWithTarget = Prisma.MeterGetPayload<{ include: typeof METER_TARGET_INCLUDE }>

// Descarta a relação aninhada (`property`/`area`) antes de expor como
// `AreaResponse`/`DeviceResponse` — sem isto, os objetos carregariam em
// runtime endereço ainda cifrado e `userId` que o tipo público não declara.
// Mesma destruturação que `AreaRepository.findByIdWithProperty` e
// `DeviceRepository.findByIdWithProperty` já fazem para o mesmo `include`.
function stripAreaProperty(area: NonNullable<RawMeterWithTarget["area"]>): AreaResponse {
    const { property: _property, ...rest } = area
    return rest
}

function stripDeviceArea(device: NonNullable<RawMeterWithTarget["device"]>): DeviceResponse {
    const { area: _area, ...rest } = device
    return rest
}

function toMeterWithTargetRow(raw: RawMeterWithTarget): MeterWithTargetRow {
    const property = raw.property ?? raw.area?.property ?? raw.device?.area.property ?? null
    // `area` cobre os dois casos em que uma área importa: alvo AREA (área do
    // próprio medidor) e alvo DEVICE (área-mãe do dispositivo, necessária
    // pra montar o path). Nunca ambos ao mesmo tempo.
    const rawArea = raw.area ?? raw.device?.area ?? null

    return {
        meter: toMeterResponse(raw),
        property: property ? toPropertyResponse(property) : null,
        area: rawArea ? stripAreaProperty(rawArea) : null,
        device: raw.device ? stripDeviceArea(raw.device) : null,
    }
}

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

    // Uma única query para qualquer targetType — `relationLoadStrategy:
    // "join"` força um SQL JOIN real cobrindo os 3 `include` opcionais de
    // uma vez (a estratégia default do Prisma para `include` é uma query por
    // nível de relação, não um join). Exatamente um de property/area/device
    // vem populado, conforme `meter.targetType`. Substitui os até 3 round
    // trips sequenciais que `resolveMeterTarget` fazia antes.
    async findByIdWithTarget(meterId: string): Promise<MeterWithTargetRow | null> {
        const raw = await this.prisma.meter.findUnique({
            where: { id: meterId },
            include: METER_TARGET_INCLUDE,
            relationLoadStrategy: "join",
        })
        return raw ? toMeterWithTargetRow(raw) : null
    }

    // Versão em lote de `findByIdWithTarget` — uma única query para uma
    // página inteira de medidores (qualquer mistura de targetType), em vez
    // de uma chamada por medidor. Base do batching de `resolveMeterTargets`
    // (substitui o N+1 de `AlertService.findAll`).
    async findManyByIdsWithTarget(meterIds: string[]): Promise<Map<string, MeterWithTargetRow>> {
        if (meterIds.length === 0) return new Map()

        const rows = await this.prisma.meter.findMany({
            where: { id: { in: meterIds } },
            include: METER_TARGET_INCLUDE,
            relationLoadStrategy: "join",
        })

        return new Map(rows.map((raw) => [raw.id, toMeterWithTargetRow(raw)]))
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
        // `extra` é opcional no schema de update (updateMeterSchema, MQTT
        // inclusive) para não forçar reenvio da senha em toda edição — a
        // resposta pública nunca devolve a senha em claro (sanitizeExtraForResponse),
        // então um formulário de edição legitimamente não tem como reenviá-la.
        // Se a chave nem veio no payload, a credencial existente não deve ser
        // tocada; `extractField` trataria "ausente" e "null explícito" da
        // mesma forma (apagando a coluna), então o `in` é checado aqui, antes
        // dele, para os dois casos terem efeitos diferentes.
        const extraProvided = "extra" in input
        const raw = await this.prisma.meter.update({
            where: { id },
            data: {
                name: input.name,
                protocol: input.protocol,
                host: extractField<string>(input, "host"),
                port: extractField<number>(input, "port"),
                topic: extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                ...(extraProvided && {
                    extra: toJsonInput(
                        encryptExtraForStorage(
                            input.protocol,
                            extractField<Record<string, unknown>>(input, "extra"),
                        ),
                    ),
                }),
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
