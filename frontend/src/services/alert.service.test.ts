import { describe, it, expect, beforeEach, vi } from "vitest"
import { alertService } from "@/services/alert.service"
import { api } from "@/services/api"
import type {
    Alert,
    CreateAlertInput,
    UpdateAlertInput,
} from "@/types/alert.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

// Helper para construir alerts de teste com defaults sensatos
const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

const mockAlert: Alert = makeAlert()

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// listGlobal
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.listGlobal", () => {
    it("faz GET em /alerts sem query quando nenhum filtro é passado", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockAlert] },
        })

        const result = await alertService.listGlobal()

        expect(api.get).toHaveBeenCalledWith("/alerts")
        expect(result).toEqual([mockAlert])
    })

    it("inclui ?triggered=true quando triggered=true é informado", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        await alertService.listGlobal({ triggered: true })

        expect(api.get).toHaveBeenCalledWith("/alerts?triggered=true")
    })

    it("inclui ?triggered=false quando triggered=false é informado", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        await alertService.listGlobal({ triggered: false })

        expect(api.get).toHaveBeenCalledWith("/alerts?triggered=false")
    })

    it("retorna array vazio quando o backend devolve []", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        const result = await alertService.listGlobal()

        expect(result).toEqual([])
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("Network down"))

        await expect(alertService.listGlobal()).rejects.toThrow("Network down")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// listByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.listByProperty", () => {
    it("faz GET na rota aninhada da property e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockAlert] },
        })

        const result = await alertService.listByProperty("prop-1")

        expect(api.get).toHaveBeenCalledWith("/properties/prop-1/alerts")
        expect(result).toEqual([mockAlert])
    })

    it("retorna array vazio quando o backend devolve []", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        const result = await alertService.listByProperty("prop-1")

        expect(result).toEqual([])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// listByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.listByArea", () => {
    it("faz GET na rota aninhada da area", async () => {
        const areaAlert = makeAlert({
            targetType: "AREA",
            propertyId: null,
            areaId: "area-1",
        })
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [areaAlert] },
        })

        const result = await alertService.listByArea("prop-1", "area-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/alerts",
        )
        expect(result).toEqual([areaAlert])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// listByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.listByDevice", () => {
    it("faz GET na rota aninhada do device", async () => {
        const deviceAlert = makeAlert({
            targetType: "DEVICE",
            propertyId: null,
            areaId: null,
            deviceId: "dev-1",
        })
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [deviceAlert] },
        })

        const result = await alertService.listByDevice(
            "prop-1",
            "area-1",
            "dev-1",
        )

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/dev-1/alerts",
        )
        expect(result).toEqual([deviceAlert])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getById
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.getById", () => {
    it("faz GET em /alerts/:id e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockAlert },
        })

        const result = await alertService.getById("alert-1")

        expect(api.get).toHaveBeenCalledWith("/alerts/alert-1")
        expect(result).toEqual(mockAlert)
    })

    it("propaga 404 do backend", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("404"))

        await expect(alertService.getById("inexistente")).rejects.toThrow("404")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// createForProperty / createForArea / createForDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.createForProperty", () => {
    it("faz POST na rota aninhada da property com o body informado", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockAlert },
        })

        const input: CreateAlertInput = { thresholdKwh: 100, message: "Atenção" }
        const result = await alertService.createForProperty("prop-1", input)

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/alerts",
            input,
        )
        expect(result).toEqual(mockAlert)
    })
})

describe("alertService.createForArea", () => {
    it("faz POST na rota aninhada da area com o body informado", async () => {
        const areaAlert = makeAlert({
            targetType: "AREA",
            propertyId: null,
            areaId: "area-1",
        })
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: areaAlert },
        })

        const input: CreateAlertInput = { thresholdKwh: 50 }
        const result = await alertService.createForArea(
            "prop-1",
            "area-1",
            input,
        )

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/alerts",
            input,
        )
        expect(result).toEqual(areaAlert)
    })
})

describe("alertService.createForDevice", () => {
    it("faz POST na rota aninhada do device com o body informado", async () => {
        const deviceAlert = makeAlert({
            targetType: "DEVICE",
            propertyId: null,
            areaId: null,
            deviceId: "dev-1",
        })
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: deviceAlert },
        })

        const input: CreateAlertInput = { thresholdKwh: 5 }
        const result = await alertService.createForDevice(
            "prop-1",
            "area-1",
            "dev-1",
            input,
        )

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/dev-1/alerts",
            input,
        )
        expect(result).toEqual(deviceAlert)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.update", () => {
    it("faz PUT em /alerts/:id com o body informado", async () => {
        const updated = makeAlert({ thresholdKwh: 250 })
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: updated },
        })

        const input: UpdateAlertInput = { thresholdKwh: 250 }
        const result = await alertService.update("alert-1", input)

        expect(api.put).toHaveBeenCalledWith("/alerts/alert-1", input)
        expect(result).toEqual(updated)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// markAsRead
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.markAsRead", () => {
    it("faz PATCH em /alerts/:id/read e descasca o envelope", async () => {
        const read = makeAlert({
            triggeredAt: "2025-11-10T12:00:00.000Z",
            readAt: "2025-11-11T08:30:00.000Z",
        })
        vi.mocked(api.patch).mockResolvedValue({
            data: { status: "success", data: read },
        })

        const result = await alertService.markAsRead("alert-1")

        expect(api.patch).toHaveBeenCalledWith("/alerts/alert-1/read")
        expect(result).toEqual(read)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// delete
// ─────────────────────────────────────────────────────────────────────────────

describe("alertService.delete", () => {
    it("faz DELETE em /alerts/:id e não retorna conteúdo", async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: "" })

        await alertService.delete("alert-1")

        expect(api.delete).toHaveBeenCalledWith("/alerts/alert-1")
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.delete).mockRejectedValue(new Error("403"))

        await expect(alertService.delete("alert-1")).rejects.toThrow("403")
    })
})