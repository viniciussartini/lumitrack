/**
 * Tipos compartilhados de Medidor (Meter) — módulo novo da reformulação IoT.
 * Espelham `backend/src/modules/meter/meter.schema.ts` e `meter.repository.ts`.
 *
 * Um medidor se vincula a EXATAMENTE UM alvo (propriedade, área ou
 * dispositivo) — `targetType` discrimina qual, os outros dois FKs vêm null.
 * O alvo é imutável após a criação (não há como "mover" um medidor).
 */

/** Alvo ao qual um medidor (ou alerta, via medidor) está vinculado. */
export type TargetType = "PROPERTY" | "AREA" | "DEVICE"

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
    PROPERTY: "Propriedade",
    AREA: "Área",
    DEVICE: "Dispositivo",
}

/** Protocolos de conexão IoT suportados (espelha o enum Prisma IoTProtocol). */
export type MeterProtocol =
    | "MQTT"
    | "MODBUS_TCP"
    | "MODBUS_RTU"
    | "ETHERNET_IP"
    | "PROFIBUS"
    | "PROFINET"
    | "RS232"
    | "RS485"

export const METER_PROTOCOL_LABELS: Record<MeterProtocol, string> = {
    MQTT: "MQTT",
    MODBUS_TCP: "Modbus TCP",
    MODBUS_RTU: "Modbus RTU",
    ETHERNET_IP: "EtherNet/IP",
    PROFIBUS: "Profibus",
    PROFINET: "Profinet",
    RS232: "RS-232",
    RS485: "RS-485",
}

/** Protocolos que exigem host+port (conexão de rede). */
export const NETWORK_PROTOCOLS: readonly MeterProtocol[] = [
    "MQTT",
    "MODBUS_TCP",
    "ETHERNET_IP",
    "PROFINET",
]

/** Protocolos que exigem `topic` (além de host+port). */
export const TOPIC_PROTOCOLS: readonly MeterProtocol[] = ["MQTT"]

/** Protocolos que exigem `address` — todos exceto MQTT (host/port/topic). */
export const ADDRESS_PROTOCOLS: readonly MeterProtocol[] = [
    "MODBUS_TCP",
    "MODBUS_RTU",
    "ETHERNET_IP",
    "PROFIBUS",
    "PROFINET",
    "RS232",
    "RS485",
]

/**
 * Protocolos de registrador/tag único que, além do endereço "principal" (a
 * grandeza voltagem), exigem mais endereços em `extra` — um por grandeza
 * elétrica restante (current/power/powerFactor; MODBUS_RTU soma um quarto,
 * voltageAddress, porque seu `address` de topo é o caminho da porta serial,
 * não a voltagem). Espelha `quantityAddressFields` de
 * `backend/src/modules/meter/meter.schema.ts` — sem esses campos, o
 * backend rejeita a criação/edição do medidor com 400 (issue #316).
 */
export const QUANTITY_ADDRESS_PROTOCOLS: readonly MeterProtocol[] = [
    "MODBUS_TCP",
    "MODBUS_RTU",
    "ETHERNET_IP",
    "PROFINET",
]

/** Formato de endereço de grandeza exigido por protocolo (valida no client). */
export type AddressKind = "register" | "db" | "tag"

export const ADDRESS_KIND_BY_PROTOCOL: Partial<Record<MeterProtocol, AddressKind>> = {
    MODBUS_TCP: "register",
    MODBUS_RTU: "register",
    ETHERNET_IP: "tag",
    PROFINET: "db",
}

/** Medidor retornado pela API */
export interface Meter {
    id: string
    name: string
    targetType: TargetType
    propertyId: string | null
    areaId: string | null
    deviceId: string | null
    protocol: MeterProtocol
    host: string | null
    port: number | null
    topic: string | null
    address: string | null
    extra: Record<string, unknown> | null
    createdAt: string
    updatedAt: string
}

/** Discriminador do alvo — usado só na criação (imutável depois). */
export type MeterFormTarget =
    | { targetType: "PROPERTY"; propertyId: string }
    | { targetType: "AREA"; areaId: string }
    | { targetType: "DEVICE"; deviceId: string }

/** Campos de conexão — variam por protocolo, mas o form trata como opcionais
 * e o backend valida a combinação exata via união discriminada por protocolo. */
export interface MeterConnectionInput {
    protocol: MeterProtocol
    host?: string
    port?: number
    topic?: string
    address?: string
    extra?: Record<string, unknown>
}

export type CreateMeterInput = MeterFormTarget & MeterConnectionInput & { name: string }

export type UpdateMeterInput = MeterConnectionInput & { name: string }
