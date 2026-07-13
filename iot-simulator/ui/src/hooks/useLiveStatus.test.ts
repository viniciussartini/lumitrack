import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useLiveStatus } from "@/hooks/useLiveStatus"

type Listener = (event: { data: string }) => void

class FakeEventSource {
    static instances: FakeEventSource[] = []
    listeners: Record<string, Listener[]> = {}
    onerror: (() => void) | null = null
    closed = false

    constructor(public url: string) {
        FakeEventSource.instances.push(this)
    }

    addEventListener(type: string, listener: Listener): void {
        ;(this.listeners[type] ??= []).push(listener)
    }

    close(): void {
        this.closed = true
    }

    emit(type: string, data: unknown): void {
        for (const listener of this.listeners[type] ?? []) {
            listener({ data: JSON.stringify(data) })
        }
    }

    triggerError(): void {
        this.onerror?.()
    }
}

describe("useLiveStatus", () => {
    beforeEach(() => {
        FakeEventSource.instances = []
        vi.stubGlobal("EventSource", FakeEventSource)
    })

    it("conecta em /api/status/stream e atualiza networks a cada evento 'snapshot'", async () => {
        const { result } = renderHook(() => useLiveStatus())

        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0]!.url).toBe("/api/status/stream")
        expect(result.current.connected).toBe(false)
        expect(result.current.networks).toEqual([])

        const snapshot = [{ id: "net-1", name: "Casa Teste", devices: [] }]
        FakeEventSource.instances[0]!.emit("snapshot", snapshot)

        await waitFor(() => {
            expect(result.current.connected).toBe(true)
            expect(result.current.networks).toEqual(snapshot)
        })
    })

    it("marca connected como false quando o EventSource dispara erro", async () => {
        const { result } = renderHook(() => useLiveStatus())
        FakeEventSource.instances[0]!.emit("snapshot", [])
        await waitFor(() => expect(result.current.connected).toBe(true))

        FakeEventSource.instances[0]!.triggerError()

        await waitFor(() => expect(result.current.connected).toBe(false))
    })

    it("fecha a conexão ao desmontar", () => {
        const { unmount } = renderHook(() => useLiveStatus())
        const instance = FakeEventSource.instances[0]!

        expect(instance.closed).toBe(false)
        unmount()
        expect(instance.closed).toBe(true)
    })
})
