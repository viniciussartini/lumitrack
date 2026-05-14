import { describe, it, expect } from "vitest"
import {
    formatThresholdKwh,
    formatTriggeredAt,
    formatAlertTarget,
    type AlertTargetLookup,
} from "@/lib/formatters/alert"
import type { Alert } from "@/types/alert.types"

const baseAlert: Alert = {
    id: "alert-1",
    userId: "user-1",
    propertyId: "prop-abc12345",
    areaId: null,
    deviceId: null,
    targetType: "PROPERTY",
    message: null,
    thresholdKwh: 100,
    triggeredAt: null,
    readAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
}

// ─────────────────────────────────────────────────────────────────────────────
// formatThresholdKwh
// ─────────────────────────────────────────────────────────────────────────────

describe("formatThresholdKwh", () => {
    it("formata número inteiro sem casas decimais", () => {
        expect(formatThresholdKwh(100)).toBe("100 kWh")
    })

    it("formata número com 1 casa decimal", () => {
        expect(formatThresholdKwh(100.5)).toBe("100,5 kWh")
    })

    it("limita a 2 casas decimais", () => {
        expect(formatThresholdKwh(0.123)).toBe("0,12 kWh")
    })

    it("formata zero", () => {
        expect(formatThresholdKwh(0)).toBe("0 kWh")
    })

    it("formata número grande com separador de milhar pt-BR", () => {
        // 1.000 kWh com ponto de milhar
        expect(formatThresholdKwh(1000)).toBe("1.000 kWh")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatTriggeredAt
// ─────────────────────────────────────────────────────────────────────────────

describe("formatTriggeredAt", () => {
    it("retorna '—' quando triggeredAt é null", () => {
        expect(formatTriggeredAt(null)).toBe("—")
    })

    it("formata timestamp ISO em data/hora pt-BR", () => {
        const result = formatTriggeredAt("2025-11-15T17:30:00.000Z")
        // Só validamos o padrão — a hora varia com o TZ do ambiente.
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
        expect(result).toMatch(/\d{2}:\d{2}/)
    })

    it("inclui a data '15/11/2025' para o timestamp de novembro", () => {
        const result = formatTriggeredAt("2025-11-15T17:30:00.000Z")
        expect(result).toContain("15/11/2025")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatAlertTarget
// ─────────────────────────────────────────────────────────────────────────────

describe("formatAlertTarget — PROPERTY", () => {
    it("retorna nome da propriedade quando lookup tem a entrada", () => {
        const lookup: AlertTargetLookup = {
            properties: { "prop-abc12345": { name: "Casa Principal" } },
        }
        expect(formatAlertTarget(baseAlert, lookup)).toBe("Casa Principal")
    })

    it("retorna fallback com 8 chars do ID quando lookup está vazio", () => {
        expect(formatAlertTarget(baseAlert, {})).toBe("Propriedade · prop-abc")
    })

    it("retorna fallback quando lookup não tem a propriedade específica", () => {
        const lookup: AlertTargetLookup = {
            properties: { "outro-id": { name: "Outra" } },
        }
        expect(formatAlertTarget(baseAlert, lookup)).toBe("Propriedade · prop-abc")
    })

    it("funciona sem passar lookup (usa default {})", () => {
        expect(formatAlertTarget(baseAlert)).toBe("Propriedade · prop-abc")
    })
})

describe("formatAlertTarget — AREA", () => {
    const areaAlert: Alert = {
        ...baseAlert,
        targetType: "AREA",
        propertyId: "prop-1",
        areaId: "area-xyz98765",
    }

    it("retorna 'propertyName · areaName' quando lookup tem as duas entradas", () => {
        const lookup: AlertTargetLookup = {
            areas: {
                "area-xyz98765": {
                    name: "Cozinha",
                    propertyName: "Casa Principal",
                },
            },
        }
        expect(formatAlertTarget(areaAlert, lookup)).toBe(
            "Casa Principal · Cozinha",
        )
    })

    it("retorna só o nome da área quando propertyName está ausente", () => {
        const lookup: AlertTargetLookup = {
            areas: { "area-xyz98765": { name: "Cozinha" } },
        }
        expect(formatAlertTarget(areaAlert, lookup)).toBe("Cozinha")
    })

    it("retorna fallback com 8 chars do areaId quando lookup está vazio", () => {
        expect(formatAlertTarget(areaAlert, {})).toBe("Área · area-xyz")
    })
})

describe("formatAlertTarget — DEVICE", () => {
    const deviceAlert: Alert = {
        ...baseAlert,
        targetType: "DEVICE",
        propertyId: "prop-1",
        areaId: "area-1",
        deviceId: "device-ab123456",
    }

    it("retorna 'propertyName · areaName · deviceName' com lookup completo", () => {
        const lookup: AlertTargetLookup = {
            devices: {
                "device-ab123456": {
                    name: "Geladeira",
                    areaName: "Cozinha",
                    propertyName: "Casa Principal",
                },
            },
        }
        expect(formatAlertTarget(deviceAlert, lookup)).toBe(
            "Casa Principal · Cozinha · Geladeira",
        )
    })

    it("omite partes ausentes do lookup (só deviceName)", () => {
        const lookup: AlertTargetLookup = {
            devices: { "device-ab123456": { name: "Geladeira" } },
        }
        expect(formatAlertTarget(deviceAlert, lookup)).toBe("Geladeira")
    })

    it("omite propertyName ausente mas mantém areaName e deviceName", () => {
        const lookup: AlertTargetLookup = {
            devices: {
                "device-ab123456": { name: "Geladeira", areaName: "Cozinha" },
            },
        }
        expect(formatAlertTarget(deviceAlert, lookup)).toBe("Cozinha · Geladeira")
    })

    it("retorna fallback com 8 chars do deviceId quando lookup está vazio", () => {
        expect(formatAlertTarget(deviceAlert, {})).toBe(
            "Dispositivo · device-a",
        )
    })
})

describe("formatAlertTarget — edge cases", () => {
    it("retorna 'Alvo desconhecido' quando targetType não tem FK", () => {
        const broken = {
            ...baseAlert,
            targetType: "PROPERTY" as const,
            propertyId: null,
        }
        expect(formatAlertTarget(broken as Alert)).toBe("Alvo desconhecido")
    })
})