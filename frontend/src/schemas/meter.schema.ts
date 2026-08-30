import { z } from "zod"
import {
    ADDRESS_KIND_BY_PROTOCOL,
    ADDRESS_PROTOCOLS,
    NETWORK_PROTOCOLS,
    QUANTITY_ADDRESS_PROTOCOLS,
    TOPIC_PROTOCOLS,
    type AddressKind,
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

// Espelha registerAddress/dbAddress/tagAddress de
// backend/src/modules/meter/meter.schema.ts — mesmas 3 formas de endereço,
// checadas aqui só pra dar feedback client-side; o backend continua sendo
// quem de fato barra um valor inválido.
function matchesAddressKind(value: string, kind: AddressKind): boolean {
    switch (kind) {
        case "register":
            return /^\d+$/.test(value) && Number(value) <= 65535
        case "db":
            return /^DB[1-9]\d*$/.test(value)
        case "tag":
            return value.length > 0
    }
}

const baseMeterFormSchema = z.object({
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

    // Endereços de grandeza elétrica (extra.*) — só os 4 protocolos de
    // QUANTITY_ADDRESS_PROTOCOLS usam algum destes.
    // voltageAddress existe só porque MODBUS_RTU usa `address` (topo)
    // pro caminho da porta serial, sem sobra pra guardar a voltagem.
    voltageAddress: emptyToUndefined.pipe(z.string().max(255).optional()),
    currentAddress: emptyToUndefined.pipe(z.string().max(255).optional()),
    powerAddress: emptyToUndefined.pipe(z.string().max(255).optional()),
    powerFactorAddress: emptyToUndefined.pipe(z.string().max(255).optional()),
})

type BaseMeterFormShape = z.infer<typeof baseMeterFormSchema>
type QuantityField = "currentAddress" | "powerAddress" | "powerFactorAddress"

const QUANTITY_FIELD_LABELS: Record<QuantityField, string> = {
    currentAddress: "corrente",
    powerAddress: "potência",
    powerFactorAddress: "fator de potência",
}

// Presença e formato viram refines SEPARADOS (não um só "obrigatório") —
// digitar um valor com formato errado não deve mostrar "é obrigatório" com
// o campo preenchido na tela, a mesma separação que o backend já faz entre
// `.min(1)` e `.regex()`.
type RefineArgs = [(data: BaseMeterFormShape) => boolean, { message: string; path: PropertyKey[] }]

function quantityRequiredRefine(field: QuantityField): RefineArgs {
    const label = QUANTITY_FIELD_LABELS[field]
    return [
        (data) =>
            !QUANTITY_ADDRESS_PROTOCOLS.includes(data.protocol as MeterProtocol) ||
            data[field] !== undefined,
        { message: `Endereço de ${label} é obrigatório para este protocolo`, path: [field] },
    ]
}

function quantityFormatRefine(field: QuantityField): RefineArgs {
    const label = QUANTITY_FIELD_LABELS[field]
    return [
        (data) => {
            if (!QUANTITY_ADDRESS_PROTOCOLS.includes(data.protocol as MeterProtocol)) return true
            const value = data[field]
            if (value === undefined) return true
            const kind = ADDRESS_KIND_BY_PROTOCOL[data.protocol as MeterProtocol]
            return !kind || matchesAddressKind(value, kind)
        },
        { message: `Formato de endereço de ${label} inválido para este protocolo`, path: [field] },
    ]
}

export const meterFormSchema = baseMeterFormSchema
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
            !ADDRESS_PROTOCOLS.includes(data.protocol as MeterProtocol) || Boolean(data.address),
        { message: "Endereço é obrigatório para este protocolo", path: ["address"] },
    )
    .refine(
        (data) => {
            const protocol = data.protocol as MeterProtocol
            const kind = ADDRESS_KIND_BY_PROTOCOL[protocol]
            // MODBUS_RTU: `address` é o caminho da porta serial, não uma
            // grandeza — o formato de registrador vale pro voltageAddress
            // dele, checado abaixo, nunca pro `address` de topo.
            if (!kind || protocol === "MODBUS_RTU" || !data.address) return true
            return matchesAddressKind(data.address, kind)
        },
        { message: "Formato de endereço inválido para este protocolo", path: ["address"] },
    )
    .refine((data) => data.protocol !== "MODBUS_RTU" || data.voltageAddress !== undefined, {
        message: "Endereço de voltagem é obrigatório para MODBUS_RTU",
        path: ["voltageAddress"],
    })
    .refine(
        (data) => {
            if (data.protocol !== "MODBUS_RTU" || data.voltageAddress === undefined) return true
            return matchesAddressKind(data.voltageAddress, "register")
        },
        {
            message:
                "Formato de endereço de voltagem inválido (esperado registrador 0-65535) para MODBUS_RTU",
            path: ["voltageAddress"],
        },
    )
    .refine(...quantityRequiredRefine("currentAddress"))
    .refine(...quantityFormatRefine("currentAddress"))
    .refine(...quantityRequiredRefine("powerAddress"))
    .refine(...quantityFormatRefine("powerAddress"))
    .refine(...quantityRequiredRefine("powerFactorAddress"))
    .refine(...quantityFormatRefine("powerFactorAddress"))

export type MeterFormData = z.output<typeof meterFormSchema>
export type MeterFormInput = z.input<typeof meterFormSchema>
