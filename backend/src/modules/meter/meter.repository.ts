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
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "MeterRepository" })

/**
 * Resultado de `findAllConnectionConfigs()` — separa os medidores prontos
 * para conectar dos descartados por credencial indecifrável, para que o
 * chamador (boot do servidor) distinga "nenhum medidor cadastrado" de
 * "todos cadastrados, todos com credencial quebrada" — os dois cenários
 * produzem `configs.length === 0`, mas exigem log e diagnóstico diferentes.
 */
export interface ConnectionConfigsResult {
    configs: MeterConnectionConfig[]
    skippedMeterIds: string[]
}

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

// Só MQTT carrega credencial (username/password) em `extra`; os demais
// protocolos usam parâmetros de polling/endereçamento, nada sensível
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

/**
 * Persistência de medidores — cada medidor tem exatamente um alvo
 * (property/area/device) e, quando MQTT, uma credencial cifrada em repouso
 * (ver {@link encryptExtraForStorage}/{@link decryptExtraForConnection}).
 */
export class MeterRepository {
    /** @param prisma - Cliente Prisma usado para ler e gravar medidores. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um medidor pelo id.
     *
     * @param id - Id do medidor.
     * @returns O medidor, ou `null` se não existir.
     */
    async findById(id: string): Promise<MeterResponse | null> {
        const raw = await this.prisma.meter.findUnique({ where: { id } })
        return raw ? toMeterResponse(raw) : null
    }

    /**
     * Busca o medidor vinculado a um alvo (property/area/device) específico
     * — no máximo um medidor por alvo.
     *
     * @param targetType - Tipo do alvo (PROPERTY, AREA ou DEVICE).
     * @param targetId - Id do alvo.
     * @returns O medidor vinculado, ou `null` se o alvo não tiver medidor.
     */
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

    /**
     * Busca um medidor com seu alvo completo já resolvido. Uma única query
     * para qualquer targetType — `relationLoadStrategy: "join"` força um SQL
     * JOIN real cobrindo os 3 `include` opcionais de uma vez (a estratégia
     * default do Prisma para `include` é uma query por nível de relação, não
     * um join). Exatamente um de property/area/device vem populado,
     * conforme `meter.targetType`. Substitui os até 3 round trips
     * sequenciais que `resolveMeterTarget` fazia antes.
     *
     * @param meterId - Id do medidor.
     * @returns O medidor com seu alvo resolvido, ou `null` se não existir.
     */
    async findByIdWithTarget(meterId: string): Promise<MeterWithTargetRow | null> {
        const raw = await this.prisma.meter.findUnique({
            where: { id: meterId },
            include: METER_TARGET_INCLUDE,
            relationLoadStrategy: "join",
        })
        return raw ? toMeterWithTargetRow(raw) : null
    }

    /**
     * Versão em lote de {@link findByIdWithTarget} — uma única query para
     * uma página inteira de medidores (qualquer mistura de targetType), em
     * vez de uma chamada por medidor. Base do batching de
     * `resolveMeterTargets` (substitui o N+1 de `AlertService.findAll`).
     *
     * @param meterIds - Ids dos medidores a buscar.
     * @returns Mapa de id do medidor para o medidor com seu alvo resolvido.
     */
    async findManyByIdsWithTarget(meterIds: string[]): Promise<Map<string, MeterWithTargetRow>> {
        if (meterIds.length === 0) return new Map()

        const rows = await this.prisma.meter.findMany({
            where: { id: { in: meterIds } },
            include: METER_TARGET_INCLUDE,
            relationLoadStrategy: "join",
        })

        return new Map(rows.map((raw) => [raw.id, toMeterWithTargetRow(raw)]))
    }

    /**
     * Lista todos os medidores do usuário, sem paginação. Une os 3 caminhos
     * de posse (medidor de property, de area ou de device do usuário) numa
     * única query via OR de relação aninhada.
     *
     * @param userId - Id do usuário dono, direto ou indireto, dos medidores.
     * @returns Todos os medidores do usuário, ordenados por nome.
     */
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

    /**
     * Lista paginada dos medidores do usuário, unindo os 3 caminhos de
     * posse (medidor de property, de area ou de device do usuário).
     *
     * @param userId - Id do usuário dono, direto ou indireto, dos medidores.
     * @param pagination - Página e tamanho de página desejados.
     * @returns Página de medidores do usuário, ordenados por nome.
     */
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

    /**
     * Cria um medidor, cifrando a credencial (`extra.password`) antes de
     * persistir quando o protocolo é MQTT.
     *
     * @param input - Dados validados do medidor a criar.
     * @returns O medidor criado.
     */
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

    /**
     * Atualiza um medidor. `extra` é opcional no schema de update
     * (updateMeterSchema, MQTT inclusive) para não forçar reenvio da senha
     * em toda edição — a resposta pública nunca devolve a senha em claro
     * (ver {@link sanitizeExtraForResponse}), então um formulário de edição
     * legitimamente não tem como reenviá-la. Se a chave nem veio no
     * payload, a credencial existente não deve ser tocada; `extractField`
     * trataria "ausente" e "null explícito" da mesma forma (apagando a
     * coluna), então o `in` é checado antes dele, para os dois casos terem
     * efeitos diferentes.
     *
     * Pelo mesmo motivo, quando `extra` VEM no payload de um medidor MQTT
     * mas sem a chave `password` (ex.: form de edição reenviando só o
     * username alterado), a senha cifrada já armazenada é preservada em vez
     * de apagada — ver {@link preserveMqttPasswordIfMissing}.
     *
     * @param id - Id do medidor a atualizar.
     * @param input - Dados validados do medidor, já sem os campos ausentes.
     * @returns O medidor atualizado.
     */
    async update(id: string, input: UpdateMeterInput): Promise<MeterResponse> {
        const extraProvided = "extra" in input
        const extraForStorage = extraProvided
            ? await this.preserveMqttPasswordIfMissing(
                  id,
                  input.protocol,
                  extractField<Record<string, unknown>>(input, "extra"),
              )
            : undefined

        const raw = await this.prisma.meter.update({
            where: { id },
            data: {
                name: input.name,
                protocol: input.protocol,
                host: extractField<string>(input, "host"),
                port: extractField<number>(input, "port"),
                topic: extractField<string>(input, "topic"),
                address: extractField<string>(input, "address"),
                ...(extraProvided && { extra: toJsonInput(extraForStorage) }),
            },
        })
        return toMeterResponse(raw)
    }

    /**
     * Cifra o `extra` recebido no `update` e, para MQTT, preserva a senha já
     * armazenada quando o payload não reenvia `password`. A API nunca
     * devolve a senha em claro (ver {@link sanitizeExtraForResponse}), então
     * nenhum cliente legítimo tem como reenviá-la — tratar "ausente" como
     * "remover" apagaria a credencial em toda edição que não mexe na senha
     * (ex.: só trocar o username). A senha preservada é lida já cifrada
     * direto da linha atual e colada por cima do resultado de
     * {@link encryptExtraForStorage} — nunca passa pela cifra de novo, ou o
     * ciphertext seria cifrado em cima do próprio ciphertext.
     *
     * @param id - Id do medidor sendo atualizado (para reler a senha atual).
     * @param protocol - Protocolo do medidor após a atualização.
     * @param rawExtra - `extra` bruto recebido no payload de update.
     * @returns O `extra` cifrado, com a senha existente preservada quando aplicável.
     */
    private async preserveMqttPasswordIfMissing(
        id: string,
        protocol: IoTProtocol,
        rawExtra: Record<string, unknown> | null,
    ): Promise<Record<string, unknown> | null> {
        const encrypted = encryptExtraForStorage(protocol, rawExtra)
        if (protocol !== "MQTT" || !rawExtra || "password" in rawExtra || !encrypted) {
            return encrypted
        }

        const current = await this.prisma.meter.findUnique({
            where: { id },
            select: { extra: true },
        })
        const currentPassword = (current?.extra as Record<string, unknown> | null)?.password
        if (typeof currentPassword !== "string") return encrypted

        return { ...encrypted, password: currentPassword }
    }

    /**
     * Remove um medidor.
     *
     * @param id - Id do medidor a remover.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.meter.delete({ where: { id } })
    }

    /**
     * Configuração de conexão de um medidor com a credencial decifrada — só
     * para uso interno do worker IoT (conexão real). Nunca chamado a partir
     * de uma rota HTTP diretamente (ver
     * `MeterService.getConnectionConfig`/`getAllConnectionConfigs`).
     *
     * @param id - Id do medidor.
     * @returns A configuração de conexão do medidor, ou `null` se não existir.
     */
    async findConnectionConfigById(id: string): Promise<MeterConnectionConfig | null> {
        const raw = await this.prisma.meter.findUnique({ where: { id } })
        return raw ? toConnectionConfig(raw) : null
    }

    /**
     * Configuração de conexão de todos os medidores cadastrados, com a
     * credencial decifrada — usado no boot do servidor
     * (`server.ts::restoreIoTConnections`) para reconectar todos os
     * medidores de uma vez.
     *
     * Um medidor cuja credencial não decifra (ex.: `METER_CREDENTIAL_ENCRYPTION_KEY`
     * trocada sem reciframento das linhas antigas) é descartado individualmente
     * — sem isso, `Array.map` propagaria a exceção pra fora da função e um
     * único medidor corrompido derrubava a reconexão de TODOS os outros no
     * boot (efeito observado: nenhum medidor recebe dado em tempo real até o
     * próximo restart, mesmo os com credencial íntegra). `skippedMeterIds` vai
     * junto no retorno — sem isso, o chamador não consegue distinguir "banco
     * vazio" de "todos os medidores cadastrados foram descartados", que pedem
     * mensagens de boot diferentes.
     *
     * @returns Os medidores com credencial decifrável, mais os ids dos descartados.
     */
    async findAllConnectionConfigs(): Promise<ConnectionConfigsResult> {
        const rows = await this.prisma.meter.findMany()
        const configs: MeterConnectionConfig[] = []
        const skippedMeterIds: string[] = []

        for (const row of rows) {
            try {
                configs.push(toConnectionConfig(row))
            } catch (err) {
                log.error(
                    { meterId: row.id, err },
                    "Credencial do medidor não pôde ser decifrada — conexão não será restaurada",
                )
                skippedMeterIds.push(row.id)
            }
        }

        return { configs, skippedMeterIds }
    }
}
