import { z } from "zod"
import {
    NETWORK_PROTOCOLS,
    SERIAL_PROTOCOLS,
    TOPIC_PROTOCOLS,
    type MeterProtocol,
} from "@/types/meter.types"

/**
 * Schema do form de Medidor.
 *
 * Espelha a validação por protocolo do backend (`meter.schema.ts`), mas de
 * forma mais permissiva na forma (um único objeto, sem união discriminada) —
 * a validação condicional (host/port/topic/address obrigatórios conforme o
 * protocolo) acontece via `.refine()`. O backend é a fonte de verdade final.
 */
const emptyToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

export const meterFormSchema = z
    .object({
        name: z.string().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),

        protocol: z.enum(
            [
                "MQTT",
                "MODBUS_TCP",
                "MODBUS_RTU",
                "ETHERNET_IP",
                "PROFIBUS",
                "PROFINET",
                "RS232",
                "RS485",
            ],
            { message: "Selecione o protocolo" },
        ),

        host: emptyToUndefined.pipe(z.string().max(255).optional()),

        port: z
            .union([z.string(), z.number()])
            .optional()
            .transform((val) => {
                if (val === "" || val === undefined || val === null) return undefined
                const parsed = Number(val)
                return Number.isNaN(parsed) ? undefined : parsed
            })
            .pipe(z.number().int().min(1).max(65535).optional()),

        topic: emptyToUndefined.pipe(z.string().max(255).optional()),

        address: emptyToUndefined.pipe(z.string().max(255).optional()),
    })
    .refine(
        (data) => !NETWORK_PROTOCOLS.includes(data.protocol as MeterProtocol) || Boolean(data.host),
        { message: "Host é obrigatório para este protocolo", path: ["host"] },
    )
    .refine(
        (data) =>
            !NETWORK_PROTOCOLS.includes(data.protocol as MeterProtocol) || data.port !== undefined,
        { message: "Porta é obrigatória para este protocolo", path: ["port"] },
    )
    .refine(
        (data) => !TOPIC_PROTOCOLS.includes(data.protocol as MeterProtocol) || Boolean(data.topic),
        { message: "Tópico é obrigatório para MQTT", path: ["topic"] },
    )
    .refine(
        (data) =>
            !SERIAL_PROTOCOLS.includes(data.protocol as MeterProtocol) || Boolean(data.address),
        { message: "Endereço é obrigatório para este protocolo", path: ["address"] },
    )

export type MeterFormData = z.output<typeof meterFormSchema>
export type MeterFormInput = z.input<typeof meterFormSchema>
