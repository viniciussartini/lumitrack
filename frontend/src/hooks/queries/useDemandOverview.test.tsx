import { describe, expect, it } from "vitest"
import { AxiosError, type AxiosResponse } from "axios"
import { demandRefetchInterval, demandRetry } from "@/hooks/queries/useDemandOverview"

const httpError = (status: number) =>
    new AxiosError("falha", "ERR", undefined, undefined, { status, data: {} } as AxiosResponse)

describe("demandRefetchInterval", () => {
    it("relê a cada minuto enquanto a consulta está saudável", () => {
        expect(demandRefetchInterval({ state: { status: "success" } })).toBe(60_000)
        expect(demandRefetchInterval({ state: { status: "pending" } })).toBe(60_000)
    })

    it("para de reler depois de um erro: 404 e 422 não mudam sozinhos", () => {
        expect(demandRefetchInterval({ state: { status: "error" } })).toBe(false)
    })
})

describe("demandRetry", () => {
    it("não repete resposta 4xx, que não muda", () => {
        expect(demandRetry(0, httpError(404))).toBe(false)
        expect(demandRetry(0, httpError(422))).toBe(false)
        expect(demandRetry(0, httpError(403))).toBe(false)
    })

    it("repete uma vez a falha de rede ou de servidor", () => {
        expect(demandRetry(0, httpError(500))).toBe(true)
        expect(demandRetry(1, httpError(500))).toBe(false)
        expect(demandRetry(0, new Error("rede"))).toBe(true)
    })
})
