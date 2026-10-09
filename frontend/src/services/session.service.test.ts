import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/services/api"
import { sessionService } from "@/services/session.service"
import type { Session } from "@/types/session.types"

vi.mock("@/services/api", () => ({ api: { get: vi.fn() } }))

const session: Session = {
    id: "s-1",
    channel: "WEB",
    deviceLabel: "Chrome · Windows",
    origin: "189.45.xx.xx",
    lastAccessAt: "2026-10-16T18:30:00.000Z",
    isCurrent: true,
}

describe("sessionService", () => {
    beforeEach(() => vi.clearAllMocks())

    it("list busca /sessions e devolve só os itens", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: { items: [session] } },
        })

        await expect(sessionService.list()).resolves.toEqual([session])
        expect(api.get).toHaveBeenCalledWith("/sessions")
    })
})
