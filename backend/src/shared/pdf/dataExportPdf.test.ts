import { describe, it, expect } from "vitest"
import { generateDataExportPdf } from "@/shared/pdf/dataExportPdf.js"
import type { DataExportPayload } from "@/modules/export/export.service.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"

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
                    { id: "dist-1", name: "CEMIG", cnpj: "06.981.180/0001-16", state: "MG", tusdPerKwh: 0.3, tePerKwh: 0.3, icmsRate: 0.18, pisRate: 0.0165, cofinsRate: 0.076, createdAt: new Date(), updatedAt: new Date() },
                ],
                alerts: [
                    { id: "alert-1", userId: "user-1", meterId: "meter-1", name: "Pico de consumo", referencePowerKw: 10, tolerancePercent: 2, enabled: true, createdAt: new Date(), updatedAt: new Date() },
                ] satisfies DataExportPayload["alerts"],
                auditLogs: [
                    { id: "audit-1", userId: "user-1", action: "LOGIN", outcome: "SUCCESS", resourceType: "User", resourceId: "user-1", ipAddress: "127.0.0.1", userAgent: "vitest", metadata: null, createdAt: new Date() },
                ] as unknown as DataExportPayload["auditLogs"],
            }),
        )

        expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })
})
