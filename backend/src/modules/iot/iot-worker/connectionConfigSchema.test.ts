import { describe, it, expect } from "vitest"
import { connectionConfigSchema } from "@/modules/iot/iot-worker/connectionConfigSchema.js"
import { createMeterSchema } from "@/modules/meter/meter.schema.js"

// Teste de contrato: connectionConfigSchema
// duplica a forma de createMeterSchema de propósito (o worker não importa do
// módulo `meter` — ver o cabeçalho de connectionConfigSchema.ts). A
// duplicação evita acoplamento indevido, mas abre espaço para drift
// silencioso: mudar um schema e esquecer o outro produziria um medidor que
// a escrita aceita e o worker recusa (ou o inverso). Este teste não elimina
// o drift, mas o torna barulhento — cada payload canônico abaixo precisa
// passar nos dois schemas ao mesmo tempo.
const targetFields = {
    targetType: "PROPERTY" as const,
    propertyId: "00000000-0000-4000-8000-000000000001",
}

const canonicalPayloads: Record<string, Record<string, unknown>> = {
    MQTT: {
        name: "Medidor MQTT",
        protocol: "MQTT",
        host: "localhost",
        port: 1883,
        topic: "lumitrack/teste",
        ...targetFields,
    },
    MODBUS_TCP: {
        name: "Medidor Modbus TCP",
        protocol: "MODBUS_TCP",
        host: "localhost",
        port: 502,
        address: "10",
        extra: { currentAddress: "11", powerAddress: "12", powerFactorAddress: "13" },
        ...targetFields,
    },
    MODBUS_RTU: {
        name: "Medidor Modbus RTU",
        protocol: "MODBUS_RTU",
        address: "/dev/ttyUSB0",
        extra: {
            voltageAddress: "10",
            currentAddress: "11",
            powerAddress: "12",
            powerFactorAddress: "13",
        },
        ...targetFields,
    },
    ETHERNET_IP: {
        name: "Medidor EtherNet/IP",
        protocol: "ETHERNET_IP",
        host: "localhost",
        address: "Voltage.Tag",
        extra: {
            currentAddress: "Current.Tag",
            powerAddress: "Power.Tag",
            powerFactorAddress: "PowerFactor.Tag",
        },
        ...targetFields,
    },
    PROFIBUS: {
        name: "Medidor Profibus",
        protocol: "PROFIBUS",
        address: "3",
        ...targetFields,
    },
    PROFINET: {
        name: "Medidor Profinet",
        protocol: "PROFINET",
        host: "localhost",
        address: "DB1",
        extra: { currentAddress: "DB2", powerAddress: "DB3", powerFactorAddress: "DB4" },
        ...targetFields,
    },
    RS232: {
        name: "Medidor RS-232",
        protocol: "RS232",
        address: "/dev/ttyUSB0",
        ...targetFields,
    },
    RS485: {
        name: "Medidor RS-485",
        protocol: "RS485",
        address: "/dev/ttyUSB0",
        ...targetFields,
    },
}

describe("contrato entre createMeterSchema e connectionConfigSchema", () => {
    for (const [protocol, payload] of Object.entries(canonicalPayloads)) {
        it(`payload canônico de ${protocol} passa nos dois schemas`, () => {
            const writeResult = createMeterSchema.safeParse(payload)
            expect(writeResult.success).toBe(true)

            // Diferenças de idioma entre as camadas, não um problema de
            // contrato: (a) meterId não existe no payload de escrita (é
            // gerado pelo banco) — injetado aqui só para satisfazer o schema
            // do worker; (b) campo opcional omitido vira `undefined` num
            // corpo de requisição HTTP, mas o repository/Prisma sempre
            // devolve `null` explícito para uma coluna vazia — nunca
            // `undefined`. `MeterConnectionConfig` (IoTConnectionManager.ts)
            // tipa `extra`/`port`/`topic`/`address` como `T | null`, nunca
            // `T | undefined`, e é esse tipo que connectionConfigSchema valida.
            const connectionPayload = {
                ...payload,
                meterId: "meter-contract-test",
                extra: payload["extra"] ?? null,
                port: payload["port"] ?? null,
                topic: payload["topic"] ?? null,
                address: payload["address"] ?? null,
            }
            const connectionResult = connectionConfigSchema.safeParse(connectionPayload)
            expect(connectionResult.success).toBe(true)
        })
    }
})
