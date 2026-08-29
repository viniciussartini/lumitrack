// ─────────────────────────────────────────────────────────────────────────────
// connectionConfigSchema — valida MeterConnectionConfig por protocolo,
// imediatamente antes de conectar (IoTConnectionManager.createConnection).
//
// Substitui os non-null assertions que existiam ali. Um Meter já passou por
// createMeterSchema/updateMeterSchema (módulo `meter`) na escrita, mas isso
// não garante que o registro chegue aqui válido: o schema pode ter mudado
// depois que o medidor foi criado, o banco pode ter sido editado manualmente,
// e a restauração no boot do servidor (server.ts, um Meter por Meter já
// existente) não passa pela validação de escrita nenhuma vez. Falhar fechado
// aqui — erro claro em vez de coagir `null` para `string` silenciosamente.
//
// Duplica (não importa) a forma já validada em meter.schema.ts de propósito:
// MeterConnectionConfig documenta que o worker não acopla ao módulo `meter`.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod"

// Protocolos de registrador/tag único (Modbus, EtherNet/IP, Profinet) fazem
// polling de UM endereço por leitura, mas cada amostra elétrica precisa das
// 4 grandezas (voltage/current/powerW/powerFactor) simultaneamente — por
// isso exigem 3 endereços adicionais em `extra` (ver meter.schema.ts para o
// mesmo requisito espelhado na validação de escrita).
//
// Valida o FORMATO, não só a presença — mesma razão e mesmos validadores de
// meter.schema.ts (duplicados de propósito, ver cabeçalho do arquivo):
// `ModbusTcpConnection._readSample()` faria `parseInt("abc", 10)` e leria
// o registrador `NaN`; `ProfinetConnection` faria `"DB0"` virar DB1.
const registerAddress = (label: string, protocol: string) =>
    z
        .string()
        .min(1, { message: `extra.${label} é obrigatório para ${protocol}` })
        .regex(/^\d+$/, {
            message: `extra.${label} deve ser um número de registrador (0-65535) para ${protocol}`,
        })
        .refine((value) => Number(value) <= 65535, {
            message: `extra.${label} deve ser um registrador válido (0-65535) para ${protocol}`,
        })

const dbAddress = (label: string, protocol: string) =>
    z
        .string()
        .min(1, { message: `extra.${label} é obrigatório para ${protocol}` })
        .regex(/^DB[1-9]\d*$/, {
            message: `extra.${label} deve seguir o formato DB<N>, N >= 1 (ex.: "DB1") para ${protocol}`,
        })

const tagAddress = (label: string, protocol: string) =>
    z.string().min(1, { message: `extra.${label} é obrigatório para ${protocol}` })

const quantityAddressFields = (protocol: string, kind: "register" | "db" | "tag") => {
    const validator = kind === "register" ? registerAddress : kind === "db" ? dbAddress : tagAddress
    return {
        currentAddress: validator("currentAddress", protocol),
        powerAddress: validator("powerAddress", protocol),
        powerFactorAddress: validator("powerFactorAddress", protocol),
    }
}

const mqttConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("MQTT"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    topic: z.string().min(1),
    address: z.null().optional(),
    extra: z
        .object({ username: z.string().optional(), password: z.string().optional() })
        .nullable(),
})

const modbusTcpConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("MODBUS_TCP"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    topic: z.null().optional(),
    address: registerAddress("address", "MODBUS_TCP"), // registrador de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        unitId: z.number().optional(),
        ...quantityAddressFields("MODBUS_TCP", "register"),
    }),
})

const modbusRtuConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("MODBUS_RTU"),
    host: z.null().optional(),
    port: z.null().optional(),
    topic: z.null().optional(),
    address: z.string().min(1), // caminho da porta serial
    extra: z.object({
        baudRate: z.number().optional(),
        pollingIntervalMs: z.number().optional(),
        unitId: z.number().optional(),
        voltageAddress: registerAddress("voltageAddress", "MODBUS_RTU"),
        ...quantityAddressFields("MODBUS_RTU", "register"),
    }),
})

const ethernetIpConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("ETHERNET_IP"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).nullable(),
    topic: z.null().optional(),
    address: tagAddress("address", "ETHERNET_IP"), // tag de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        ...quantityAddressFields("ETHERNET_IP", "tag"),
    }),
})

const profibusConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("PROFIBUS"),
    host: z.null().optional(),
    port: z.null().optional(),
    topic: z.null().optional(),
    address: z.string().min(1),
    extra: z
        .object({ slaveAddress: z.number().optional(), pollingIntervalMs: z.number().optional() })
        .nullable(),
})

const profinetConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("PROFINET"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).nullable(),
    topic: z.null().optional(),
    address: dbAddress("address", "PROFINET"), // DB de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        rack: z.number().optional(),
        slot: z.number().optional(),
        ...quantityAddressFields("PROFINET", "db"),
    }),
})

const serialConnectionSchema = (protocol: "RS232" | "RS485") =>
    z.object({
        meterId: z.string().min(1),
        protocol: z.literal(protocol),
        host: z.null().optional(),
        port: z.null().optional(),
        topic: z.null().optional(),
        address: z.string().min(1),
        extra: z
            .object({ baudRate: z.number().optional(), pollingIntervalMs: z.number().optional() })
            .nullable(),
    })

export const connectionConfigSchema = z.discriminatedUnion("protocol", [
    mqttConnectionSchema,
    modbusTcpConnectionSchema,
    modbusRtuConnectionSchema,
    ethernetIpConnectionSchema,
    profibusConnectionSchema,
    profinetConnectionSchema,
    serialConnectionSchema("RS232"),
    serialConnectionSchema("RS485"),
])
