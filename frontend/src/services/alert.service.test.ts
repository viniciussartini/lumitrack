import { describe, it, expect, beforeEach, vi } from "vitest"
import { alertService } from "@/services/alert.service"
import { api } from "@/services/api"
import type { AlertWithStatus, CreateAlertInput, UpdateAlertInput } from "@/types/alert.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

const makeAlert = (overrides: Partial<AlertWithStatus> = {}): AlertWithStatus => ({
    id: "alert-1",
    userId: "user-1",
    meterId: "meter-1",
    name: "Geladeira fora da faixa",
    referencePowerKw: 10,
    tolerancePercent: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "normal",
    target: { type: "DEVICE", name: "Geladeira", path: "/propriedades/p1/areas/a1/devices/d1" },
    ...overrides,
})

const mockAlert = makeAlert()

beforeEach(() => {
    vi.clearAllMocks()
})

describe("alertService.list", () => {
    it("faz GET em /alerts com os params de paginação", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: { items: [mockAlert], total: 1, page: 1, pageSize: 10 },
            },
        })

        const result = await alertService.list({ page: 1, pageSize: 10 })

        expect(api.get).toHaveBeenCalledWith("/alerts", { params: { page: 1, pageSize: 10 } })
        expect(result.items).toEqual([mockAlert])
    })
})

describe("alertService.firing", () => {
    it("faz GET em /alerts/firing e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockAlert] },
        })

        const result = await alertService.firing()

        expect(api.get).toHaveBeenCalledWith("/alerts/firing")
        expect(result).toEqual([mockAlert])
    })
})

describe("alertService.stats", () => {
    it("faz GET em /alerts/stats e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: { enabledCount: 3 } },
        })

        const result = await alertService.stats()

        expect(api.get).toHaveBeenCalledWith("/alerts/stats")
        expect(result).toEqual({ enabledCount: 3 })
    })
})

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

describe("alertService.create", () => {
    it("faz POST em /alerts com o body informado", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockAlert },
        })

        const input: CreateAlertInput = {
            name: "Geladeira fora da faixa",
            meterId: "meter-1",
            referencePowerKw: 10,
            tolerancePercent: 2,
        }
        const result = await alertService.create(input)

        expect(api.post).toHaveBeenCalledWith("/alerts", input)
        expect(result).toEqual(mockAlert)
    })
})

describe("alertService.update", () => {
    it("faz PUT em /alerts/:id com o body informado", async () => {
        const updated = makeAlert({ referencePowerKw: 12 })
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: updated },
        })

        const input: UpdateAlertInput = { referencePowerKw: 12 }
        const result = await alertService.update("alert-1", input)

        expect(api.put).toHaveBeenCalledWith("/alerts/alert-1", input)
        expect(result).toEqual(updated)
    })
})

describe("alertService.patchEnabled", () => {
    it("faz PATCH em /alerts/:id/enabled com o body { enabled }", async () => {
        const disabled = makeAlert({ enabled: false })
        vi.mocked(api.patch).mockResolvedValue({
            data: { status: "success", data: disabled },
        })

        const result = await alertService.patchEnabled("alert-1", false)

        expect(api.patch).toHaveBeenCalledWith("/alerts/alert-1/enabled", { enabled: false })
        expect(result).toEqual(disabled)
    })
})

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
