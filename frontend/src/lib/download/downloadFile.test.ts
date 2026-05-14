import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { downloadFile } from "@/lib/download/downloadFile"

describe("downloadFile", () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:mock-url")
    const revokeObjectURL = vi.fn<(url: string) => void>()

    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal("URL", {
            createObjectURL,
            revokeObjectURL,
        })
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("cria um Blob com o mimeType e conteúdo corretos", () => {
        downloadFile("test.csv", "text/csv;charset=utf-8", "a,b\n1,2")

        expect(createObjectURL).toHaveBeenCalledTimes(1)

        // mock.calls[0] é [Blob] — tipo conhecido pelo vi.fn<(blob: Blob) => string>
        const [blob] = createObjectURL.mock.calls[0]
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe("text/csv;charset=utf-8")
    })

    it("cria um <a> com href=blob URL, download=filename e dispara click", () => {
        const clickSpy = vi.fn()
        const originalCreateElement = document.createElement.bind(document)

        vi.spyOn(document, "createElement").mockImplementation((tag) => {
            const element = originalCreateElement(tag)
            if (tag === "a") {
                element.click = clickSpy
            }
            return element
        })

        downloadFile("relatorio.csv", "text/csv", "conteúdo")

        expect(clickSpy).toHaveBeenCalledTimes(1)
        // Confirma que o <a> foi removido do body após o click
        expect(document.body.querySelector("a")).toBeNull()
    })

    it("aciona revokeObjectURL no próximo tick (Safari-safe)", () => {
        downloadFile("test.csv", "text/csv", "foo")

        // Antes do tick: ainda não revogou
        expect(revokeObjectURL).not.toHaveBeenCalled()

        vi.advanceTimersByTime(0)
        expect(revokeObjectURL).toHaveBeenCalledTimes(1)
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
    })
})