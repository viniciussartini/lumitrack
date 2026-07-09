import { z } from "zod"

// Enum de protocolos (espelha o enum Prisma)
export const IoTProtocolSchema = z.enum([
    "MQTT",
    "MODBUS_TCP",
    "MODBUS_RTU",
    "ETHERNET_IP",
    "PROFIBUS",
    "PROFINET",
    "RS232",
    "RS485",
])

export type IoTProtocol = z.infer<typeof IoTProtocolSchema>

// Campos base (compartilhados por todos os protocolos)
const baseFields = {
    extra: z.record(z.string(), z.unknown()).optional(),
}

// Schemas por protocolo (discriminatedUnion)
const mqttSchema = z.object({
    ...baseFields,
    protocol: z.literal("MQTT"),
    host:     z.string().min(1, { message: "host é obrigatório para MQTT" }),
    port:     z.number().int().min(1).max(65535, { message: "port é obrigatório para MQTT" }),
    topic:    z.string().min(1, { message: "topic é obrigatório para MQTT" }),
    address:  z.undefined().optional(), // não faz sentido para MQTT
})

const modbusTcpSchema = z.object({
    ...baseFields,
    protocol: z.literal("MODBUS_TCP"),
    host:     z.string().min(1, { message: "host é obrigatório para MODBUS_TCP" }),
    port:     z.number().int().min(1).max(65535, { message: "port é obrigatório para MODBUS_TCP" }),
    address:  z.string().min(1, { message: "address é obrigatório para MODBUS_TCP" }),
    topic:    z.undefined().optional(),
})

const modbusRtuSchema = z.object({
    ...baseFields,
    protocol: z.literal("MODBUS_RTU"),
    address:  z.string().min(1, { message: "address é obrigatório para MODBUS_RTU" }),
    host:     z.undefined().optional(),
    port:     z.undefined().optional(),
    topic:    z.undefined().optional(),
})

const ethernetIpSchema = z.object({
    ...baseFields,
    protocol: z.literal("ETHERNET_IP"),
    host:     z.string().min(1, { message: "host é obrigatório para ETHERNET_IP" }),
    port:     z.number().int().min(1).max(65535).optional(),
    address:  z.string().optional(),
    topic:    z.undefined().optional(),
})

const profibusSchema = z.object({
    ...baseFields,
    protocol: z.literal("PROFIBUS"),
    address:  z.string().min(1, { message: "address é obrigatório para PROFIBUS" }),
    host:     z.undefined().optional(),
    port:     z.undefined().optional(),
    topic:    z.undefined().optional(),
})

const profinetSchema = z.object({
    ...baseFields,
    protocol: z.literal("PROFINET"),
    host:     z.string().min(1, { message: "host é obrigatório para PROFINET" }),
    port:     z.number().int().min(1).max(65535).optional(),
    address:  z.string().optional(),
    topic:    z.undefined().optional(),
})

const rs232Schema = z.object({
    ...baseFields,
    protocol: z.literal("RS232"),
    address:  z.string().min(1, { message: "address é obrigatório para RS232" }),
    host:     z.undefined().optional(),
    port:     z.undefined().optional(),
    topic:    z.undefined().optional(),
})

const rs485Schema = z.object({
    ...baseFields,
    protocol: z.literal("RS485"),
    address:  z.string().min(1, { message: "address é obrigatório para RS485" }),
    host:     z.undefined().optional(),
    port:     z.undefined().optional(),
    topic:    z.undefined().optional(),
})

// Union discriminada para criação
// O Zod usa o campo `protocol` como discriminador para saber qual branch validar.
// Se protocol = "MQTT" e topic estiver ausente → erro de validação imediato.
// Se protocol = "RS485" e host for enviado → o campo é ignorado (z.undefined()).

export const createIoTConfigSchema = z.discriminatedUnion("protocol", [
    mqttSchema,
    modbusTcpSchema,
    modbusRtuSchema,
    ethernetIpSchema,
    profibusSchema,
    profinetSchema,
    rs232Schema,
    rs485Schema,
])

// Schema de atualização
// Na atualização, o protocolo também pode mudar — o que muda os campos obrigatórios.
// Por isso reutilizamos a mesma union: se você muda de MQTT para RS485,
// a validação exige address e rejeita host/topic.
export const updateIoTConfigSchema = createIoTConfigSchema

// Tipos inferidos
export type CreateIoTConfigInput = z.infer<typeof createIoTConfigSchema>
export type UpdateIoTConfigInput = z.infer<typeof updateIoTConfigSchema>