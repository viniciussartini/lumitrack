import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { api } from "@/services/api"

describe("api", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn())
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it("faz GET com o prefixo /api e retorna o JSON parseado", async () => {
        const mockResponse = { host: "localhost", port: 1883 }
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(mockResponse), { status: 200 }),
        )

        const result = await api.getBrokerInfo()

        expect(fetch).toHaveBeenCalledWith(
            "/api/broker/info",
            expect.objectContaining({
                headers: expect.objectContaining({ "Content-Type": "application/json" }),
            }),
        )
        expect(result).toEqual(mockResponse)
    })

    it("faz POST com method e body corretos", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ id: "1", name: "Casa Teste", devices: [] }), {
                status: 201,
            }),
        )

        await api.createNetwork("Casa Teste")

        expect(fetch).toHaveBeenCalledWith(
            "/api/networks",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ name: "Casa Teste" }),
            }),
        )
    })

    it("retorna undefined em respostas 204 sem tentar parsear JSON", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))

        const result = await api.deleteNetwork("id-1")

        expect(result).toBeUndefined()
    })

    it("lança Error com a mensagem do corpo quando a resposta não é ok", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ status: "error", message: "Rede não encontrada" }), {
                status: 404,
            }),
        )

        await expect(api.deleteNetwork("id-inexistente")).rejects.toThrow("Rede não encontrada")
    })

    it("lança Error genérico se a resposta de erro não tiver corpo JSON válido", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 500 }))

        await expect(api.deleteNetwork("id-1")).rejects.toThrow("Falha na requisição (500)")
    })

    it("anexa Authorization: Bearer quando VITE_SIMULATOR_API_TOKEN está definida (issue #180)", async () => {
        vi.stubEnv("VITE_SIMULATOR_API_TOKEN", "token-de-teste")
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ host: "localhost", port: 1883 }), { status: 200 }),
        )

        await api.getBrokerInfo()

        expect(fetch).toHaveBeenCalledWith(
            "/api/broker/info",
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: "Bearer token-de-teste" }),
            }),
        )
    })

    it("não anexa Authorization quando VITE_SIMULATOR_API_TOKEN não está definida", async () => {
        vi.stubEnv("VITE_SIMULATOR_API_TOKEN", "")
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ host: "localhost", port: 1883 }), { status: 200 }),
        )

        await api.getBrokerInfo()

        const headers = vi.mocked(fetch).mock.calls[0]?.[1]?.headers as Record<string, string>
        expect(headers["Authorization"]).toBeUndefined()
    })
})
