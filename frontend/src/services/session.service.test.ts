import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/services/api"
import { sessionService } from "@/services/session.service"
import type { Session } from "@/types/session.types"

vi.mock("@/services/api", () => ({ api: { get: vi.fn(), delete: vi.fn(), post: vi.fn() } }))

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

    it("revoke chama DELETE /sessions/:id e devolve se era a atual", async () => {
        vi.mocked(api.delete).mockResolvedValue({
            data: { status: "success", data: { endedCurrent: false } },
        })

        await expect(sessionService.revoke("s-2")).resolves.toEqual({ endedCurrent: false })
        expect(api.delete).toHaveBeenCalledWith("/sessions/s-2")
    })

    it("revokeOthers chama POST /sessions/revoke-others e devolve o total", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: { revoked: 2 } },
        })

        await expect(sessionService.revokeOthers()).resolves.toEqual({ revoked: 2 })
        expect(api.post).toHaveBeenCalledWith("/sessions/revoke-others")
    })
})
