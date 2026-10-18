import { describe, it, expect, beforeEach, vi } from "vitest"
import { api } from "@/services/api"
import { reportScheduleService } from "@/services/report-schedule.service"
import type { ReportSchedule, ReportScheduleInput } from "@/types/report.types"

vi.mock("@/services/api", () => ({
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const SCHEDULE: ReportSchedule = {
    id: "sch-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: ["a@example.com"],
    active: true,
    nextRunAt: "2026-08-05T09:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
}

const INPUT: ReportScheduleInput = {
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: ["a@example.com"],
    active: true,
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("reportScheduleService", () => {
    it("list: GET /report-schedules com a página", async () => {
        const paginated = { items: [SCHEDULE], total: 1, page: 2, pageSize: 10 }
        vi.mocked(api.get).mockResolvedValue({ data: { status: "success", data: paginated } })

        const result = await reportScheduleService.list({ page: 2, pageSize: 10 })

        expect(api.get).toHaveBeenCalledWith("/report-schedules", {
            params: { page: 2, pageSize: 10 },
        })
        expect(result).toEqual(paginated)
    })

    it("create: POST /report-schedules com o corpo", async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { status: "success", data: SCHEDULE } })

        expect(await reportScheduleService.create(INPUT)).toEqual(SCHEDULE)
        expect(api.post).toHaveBeenCalledWith("/report-schedules", INPUT)
    })

    it("update: PUT /report-schedules/:id com o corpo completo", async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { status: "success", data: SCHEDULE } })

        expect(await reportScheduleService.update("sch-1", INPUT)).toEqual(SCHEDULE)
        expect(api.put).toHaveBeenCalledWith("/report-schedules/sch-1", INPUT)
    })

    it("remove: DELETE /report-schedules/:id", async () => {
        vi.mocked(api.delete).mockResolvedValue({})

        await reportScheduleService.remove("sch-1")

        expect(api.delete).toHaveBeenCalledWith("/report-schedules/sch-1")
    })
})
