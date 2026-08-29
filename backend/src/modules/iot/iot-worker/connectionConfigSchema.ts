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
const quantityAddressFields = (protocol: string) => ({
    currentAddress: z
        .string()
        .min(1, { message: `extra.currentAddress é obrigatório para ${protocol}` }),
    powerAddress: z
        .string()
        .min(1, { message: `extra.powerAddress é obrigatório para ${protocol}` }),
    powerFactorAddress: z
        .string()
        .min(1, { message: `extra.powerFactorAddress é obrigatório para ${protocol}` }),
})

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
    address: z.string().min(1), // registrador de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        unitId: z.number().optional(),
        ...quantityAddressFields("MODBUS_TCP"),
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
        voltageAddress: z
            .string()
            .min(1, { message: "extra.voltageAddress é obrigatório para MODBUS_RTU" }),
        ...quantityAddressFields("MODBUS_RTU"),
    }),
})

const ethernetIpConnectionSchema = z.object({
    meterId: z.string().min(1),
    protocol: z.literal("ETHERNET_IP"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).nullable(),
    topic: z.null().optional(),
    address: z.string().min(1), // tag de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        ...quantityAddressFields("ETHERNET_IP"),
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
    address: z.string().min(1), // DB de voltagem
    extra: z.object({
        pollingIntervalMs: z.number().optional(),
        rack: z.number().optional(),
        slot: z.number().optional(),
        ...quantityAddressFields("PROFINET"),
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
