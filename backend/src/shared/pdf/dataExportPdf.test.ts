import { describe, it, expect } from "vitest"
import {
    generateDataExportPdf,
    buildConsumptionSummaryByProperty,
} from "@/shared/pdf/dataExportPdf.js"
import type { DataExportPayload } from "@/modules/export/export.service.js"
import type { ConsumptionResponse } from "@/modules/consumption/consumption.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"
import type { AreaResponse } from "@/modules/area/area.repository.js"
import type { DeviceResponse } from "@/modules/device/device.repository.js"

// Payload fake — não toca o banco, testa só a geração do documento em si.
function buildFakePayload(overrides: Partial<DataExportPayload> = {}): DataExportPayload {
    return {
        generatedAt: new Date("2026-06-28T12:00:00Z"),
        user: {
            id: "user-1",
            email: "joao@example.com",
            userType: "INDIVIDUAL",
            firstName: "João",
            lastName: "Silva",
            companyName: null,
            tradeName: null,
            cpf: "529.982.247-25",
            cnpj: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
            consentedAt: new Date("2026-01-01T00:00:00Z"),
            consentVersion: "1.0",
        } as DataExportPayload["user"],
        properties: [],
        distributors: [],
        areas: [],
        devices: [],
        alerts: [],
        consumptionRecords: [],
        auditLogs: [],
        ...overrides,
    }
}

describe("generateDataExportPdf", () => {

    it("gera um Buffer com cabeçalho PDF válido para um payload vazio", async () => {
        const buffer = await generateDataExportPdf(buildFakePayload())

        expect(Buffer.isBuffer(buffer)).toBe(true)
        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("gera um PDF válido mesmo com seções preenchidas", async () => {
        const properties = [
            { id: "prop-1", name: "Casa", address: "Rua A", city: "BH", state: "MG", zipCode: "30000-000", userId: "user-1", distributorId: "dist-1", createdAt: new Date(), updatedAt: new Date() },
        ] as unknown as PropertyResponse[]

        const buffer = await generateDataExportPdf(
            buildFakePayload({
                properties,
                distributors: [
                    { id: "dist-1", userId: "user-1", name: "CEMIG", cnpj: "06.981.180/0001-16", electricalSystem: "TRIPHASIC", workingVoltage: 220, kwhPrice: 0.75, taxRate: null, publicLightingFee: null, createdAt: new Date(), updatedAt: new Date() },
                ],
                alerts: [
                    { id: "alert-1", userId: "user-1", targetType: "PROPERTY", propertyId: "prop-1", areaId: null, deviceId: null, thresholdKwh: 100, message: "Atenção", triggeredAt: null, readAt: null, createdAt: new Date(), updatedAt: new Date() },
                ] as unknown as DataExportPayload["alerts"],
                auditLogs: [
                    { id: "audit-1", userId: "user-1", action: "LOGIN", outcome: "SUCCESS", resourceType: "User", resourceId: "user-1", ipAddress: "127.0.0.1", userAgent: "vitest", metadata: null, createdAt: new Date() },
                ] as unknown as DataExportPayload["auditLogs"],
            }),
        )

        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    // Regressão: o PDF nunca deve listar ConsumptionRecord bruto (só o
    // resumo agregado) — um volume realista de registros não deve fazer a
    // geração degradar (tempo/memória), já que drawConsumptionSummarySection
    // só itera sobre o resumo por propriedade, não sobre a lista bruta.
    it("não degrada com um volume grande de ConsumptionRecord (usa apenas o resumo agregado)", async () => {
        const properties = [
            { id: "prop-1", name: "Casa", address: null, city: null, state: null, zipCode: null, userId: "user-1", distributorId: "dist-1", createdAt: new Date(), updatedAt: new Date() },
        ] as unknown as PropertyResponse[]

        const consumptionRecords = Array.from({ length: 50_000 }, (_, i) => ({
            id: `record-${i}`,
            propertyId: "prop-1",
            areaId: null,
            deviceId: null,
            period: "HOURLY",
            referenceDate: new Date(2026, 0, 1, i % 24),
            kwhConsumed: 1,
            costBrl: 0.75,
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })) as unknown as ConsumptionResponse[]

        const start = Date.now()
        const buffer = await generateDataExportPdf(
            buildFakePayload({ properties, consumptionRecords }),
        )
        const elapsedMs = Date.now() - start

        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
        expect(elapsedMs).toBeLessThan(5000)
    })
})

describe("buildConsumptionSummaryByProperty", () => {

    const properties = [
        { id: "prop-1", name: "Casa" } as unknown as PropertyResponse,
    ]
    const areas = [
        { id: "area-1", propertyId: "prop-1" } as unknown as AreaResponse,
    ]
    const devices = [
        { id: "device-1", areaId: "area-1" } as unknown as DeviceResponse,
    ]

    it("agrega registros dos 3 níveis (property/area/device) sob a mesma propriedade", () => {
        const records = [
            { propertyId: "prop-1", areaId: null, deviceId: null, kwhConsumed: 100, costBrl: 75 },
            { propertyId: null, areaId: "area-1", deviceId: null, kwhConsumed: 50, costBrl: 37.5 },
            { propertyId: null, areaId: null, deviceId: "device-1", kwhConsumed: 20, costBrl: 15 },
        ] as unknown as ConsumptionResponse[]

        const summary = buildConsumptionSummaryByProperty(records, properties, areas, devices)

        expect(summary).toHaveLength(1)
        expect(summary[0]!.propertyId).toBe("prop-1")
        expect(summary[0]!.totalKwh).toBeCloseTo(170)
        expect(summary[0]!.totalCostBrl).toBeCloseTo(127.5)
        expect(summary[0]!.recordCount).toBe(3)
    })

    it("retorna lista vazia quando não há registros", () => {
        expect(buildConsumptionSummaryByProperty([], properties, areas, devices)).toEqual([])
    })

    it("ignora registros órfãos (target resolvido para propriedade inexistente)", () => {
        const records = [
            { propertyId: null, areaId: "area-inexistente", deviceId: null, kwhConsumed: 10, costBrl: 7.5 },
        ] as unknown as ConsumptionResponse[]

        expect(buildConsumptionSummaryByProperty(records, properties, areas, devices)).toEqual([])
    })
})
