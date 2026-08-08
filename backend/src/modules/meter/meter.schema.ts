import { z } from "zod"

// Alvo ao qual o medidor está vinculado — mesmo enum do Prisma (TargetType).
export const targetTypeSchema = z.enum(["PROPERTY", "AREA", "DEVICE"])
export type TargetTypeInput = z.infer<typeof targetTypeSchema>

// Enum de protocolos (espelha o enum Prisma IoTProtocol). Duplicado aqui em
// vez de importado do antigo módulo `iot` porque esse módulo é removido
// nesta mesma fase — o módulo `meter` passa a ser o único dono da validação
// de config de conexão.
export const meterProtocolSchema = z.enum([
    "MQTT",
    "MODBUS_TCP",
    "MODBUS_RTU",
    "ETHERNET_IP",
    "PROFIBUS",
    "PROFINET",
    "RS232",
    "RS485",
])

export type MeterProtocol = z.infer<typeof meterProtocolSchema>

// Campos comuns a todo medidor, independente do protocolo.
const nameField = { name: z.string().min(1, { message: "Nome é obrigatório" }).max(200) }

// `extra` tipado por protocolo (issue #182) — substitui o antigo
// `z.record(z.string(), z.unknown())` genérico, que aceitava qualquer par
// chave/valor sem checagem nenhuma. Só os campos que IoTConnectionManager.ts
// (createConnection) de fato lê para cada protocolo — chave desconhecida é
// descartada (Zod "strip" por padrão em z.object), não rejeitada: o objetivo
// aqui é tipar, não introduzir validação nova de faixa/formato.
//
// Só MQTT tem credencial (username/password) — os demais protocolos usam
// parâmetros de polling/endereçamento, nada sensível.
const mqttExtraSchema = z
    .object({
        username: z.string().optional(),
        password: z.string().optional(),
    })
    .optional()

const pollingExtraSchema = z
    .object({
        pollingIntervalMs: z.number().optional(),
    })
    .optional()

const modbusTcpExtraSchema = z
    .object({
        pollingIntervalMs: z.number().optional(),
        unitId: z.number().optional(),
    })
    .optional()

const modbusRtuExtraSchema = z
    .object({
        baudRate: z.number().optional(),
        pollingIntervalMs: z.number().optional(),
        unitId: z.number().optional(),
    })
    .optional()

const profibusExtraSchema = z
    .object({
        slaveAddress: z.number().optional(),
        pollingIntervalMs: z.number().optional(),
    })
    .optional()

const profinetExtraSchema = z
    .object({
        pollingIntervalMs: z.number().optional(),
        rack: z.number().optional(),
        slot: z.number().optional(),
    })
    .optional()

const serialExtraSchema = z
    .object({
        baudRate: z.number().optional(),
        pollingIntervalMs: z.number().optional(),
    })
    .optional()

// Campos de alvo — usados só na criação (o alvo não é editável depois).
// Exatamente um de propertyId/areaId/deviceId deve ser informado, coerente
// com targetType; essa regra cruzada é validada no service (precisa de
// lookups no banco de qualquer forma para checar posse).
const targetFields = {
    targetType: targetTypeSchema,
    propertyId: z.string().uuid().optional(),
    areaId: z.string().uuid().optional(),
    deviceId: z.string().uuid().optional(),
}

// ─── Criação: union discriminada por protocolo, com os campos de alvo ────────
export const createMeterSchema = z.discriminatedUnion("protocol", [
    z.object({
        ...nameField,
        ...targetFields,
        extra: mqttExtraSchema,
        protocol: z.literal("MQTT"),
        host: z.string().min(1, { message: "host é obrigatório para MQTT" }),
        port: z.number().int().min(1).max(65535, { message: "port é obrigatório para MQTT" }),
        topic: z.string().min(1, { message: "topic é obrigatório para MQTT" }),
        address: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: modbusTcpExtraSchema,
        protocol: z.literal("MODBUS_TCP"),
        host: z.string().min(1, { message: "host é obrigatório para MODBUS_TCP" }),
        port: z.number().int().min(1).max(65535, { message: "port é obrigatório para MODBUS_TCP" }),
        address: z.string().min(1, { message: "address é obrigatório para MODBUS_TCP" }),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: modbusRtuExtraSchema,
        protocol: z.literal("MODBUS_RTU"),
        address: z.string().min(1, { message: "address é obrigatório para MODBUS_RTU" }),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: pollingExtraSchema,
        protocol: z.literal("ETHERNET_IP"),
        host: z.string().min(1, { message: "host é obrigatório para ETHERNET_IP" }),
        port: z.number().int().min(1).max(65535).optional(),
        address: z.string().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: profibusExtraSchema,
        protocol: z.literal("PROFIBUS"),
        address: z.string().min(1, { message: "address é obrigatório para PROFIBUS" }),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: profinetExtraSchema,
        protocol: z.literal("PROFINET"),
        host: z.string().min(1, { message: "host é obrigatório para PROFINET" }),
        port: z.number().int().min(1).max(65535).optional(),
        address: z.string().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: serialExtraSchema,
        protocol: z.literal("RS232"),
        address: z.string().min(1, { message: "address é obrigatório para RS232" }),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        ...targetFields,
        extra: serialExtraSchema,
        protocol: z.literal("RS485"),
        address: z.string().min(1, { message: "address é obrigatório para RS485" }),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
])

export type CreateMeterInput = z.infer<typeof createMeterSchema>

// ─── Atualização: mesma união de conexão, sem os campos de alvo (imutável) ───
export const updateMeterSchema = z.discriminatedUnion("protocol", [
    z.object({
        ...nameField,
        extra: mqttExtraSchema,
        protocol: z.literal("MQTT"),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        topic: z.string().min(1),
        address: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: modbusTcpExtraSchema,
        protocol: z.literal("MODBUS_TCP"),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        address: z.string().min(1),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: modbusRtuExtraSchema,
        protocol: z.literal("MODBUS_RTU"),
        address: z.string().min(1),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: pollingExtraSchema,
        protocol: z.literal("ETHERNET_IP"),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).optional(),
        address: z.string().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: profibusExtraSchema,
        protocol: z.literal("PROFIBUS"),
        address: z.string().min(1),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: profinetExtraSchema,
        protocol: z.literal("PROFINET"),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).optional(),
        address: z.string().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: serialExtraSchema,
        protocol: z.literal("RS232"),
        address: z.string().min(1),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
    z.object({
        ...nameField,
        extra: serialExtraSchema,
        protocol: z.literal("RS485"),
        address: z.string().min(1),
        host: z.undefined().optional(),
        port: z.undefined().optional(),
        topic: z.undefined().optional(),
    }),
])

export type UpdateMeterInput = z.infer<typeof updateMeterSchema>

// Query params de GET /api/meters/by-target
export const byTargetQuerySchema = z.object({
    targetType: targetTypeSchema,
    targetId: z.string().uuid(),
})

export type ByTargetQuery = z.infer<typeof byTargetQuerySchema>
