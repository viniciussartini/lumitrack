import { describe, it, expect, beforeEach, vi } from "vitest"
import { api } from "@/services/api"
import { reportService } from "@/services/report.service"
import type { CreateReportInput, Report } from "@/types/report.types"

vi.mock("@/services/api", () => ({
    api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const REPORT: Report = {
    id: "rep-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "MONTHLY",
    format: "PDF",
    origin: "MANUAL",
    periodStart: "2026-07-01T03:00:00.000Z",
    periodEnd: "2026-08-01T03:00:00.000Z",
    fileName: "lumitrack-relatorio-monthly-2026-07.pdf",
    sizeBytes: 1200,
    createdAt: "2026-08-01T09:00:00.000Z",
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("reportService", () => {
    it("create: POST /reports com o corpo e devolve os metadados", async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { status: "success", data: REPORT } })
        const input: CreateReportInput = {
            type: "MONTHLY",
            targetType: "PROPERTY",
            targetId: "prop-1",
            format: "PDF",
            month: "2026-07",
        }

        const result = await reportService.create(input)

        expect(api.post).toHaveBeenCalledWith("/reports", input)
        expect(result).toEqual(REPORT)
    })

    it("list: GET /reports com a página e devolve o envelope paginado", async () => {
        const paginated = { items: [REPORT], total: 1, page: 2, pageSize: 10 }
        vi.mocked(api.get).mockResolvedValue({ data: { status: "success", data: paginated } })

        const result = await reportService.list({ page: 2, pageSize: 10 })

        expect(api.get).toHaveBeenCalledWith("/reports", { params: { page: 2, pageSize: 10 } })
        expect(result).toEqual(paginated)
    })

    it("remove: DELETE /reports/:id", async () => {
        vi.mocked(api.delete).mockResolvedValue({})

        await reportService.remove("rep-1")

        expect(api.delete).toHaveBeenCalledWith("/reports/rep-1")
    })

    it("download: GET como blob e devolve o nome do relatório com o conteúdo", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" })
        vi.mocked(api.get).mockResolvedValue({ data: blob })

        const file = await reportService.download(REPORT)

        expect(api.get).toHaveBeenCalledWith("/reports/rep-1/download", { responseType: "blob" })
        expect(file).toEqual({ fileName: REPORT.fileName, blob })
    })
})
