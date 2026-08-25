import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"
import {
    createQueryCountMiddleware,
    incrementQueryCount,
    getQueryCount,
} from "@/shared/database/queryCounter.js"

function fakeReqRes(path: string) {
    const finishHandlers: Array<() => void> = []
    const req = { path, method: "GET" } as unknown as Request
    const res = {
        on: vi.fn((event: string, handler: () => void) => {
            if (event === "finish") finishHandlers.push(handler)
        }),
    } as unknown as Response

    return { req, res, triggerFinish: () => finishHandlers.forEach((h) => h()) }
}

describe("createQueryCountMiddleware", () => {
    it("ignora requisições fora dos prefixos rastreados — não cria contexto nem registra listener de finish", () => {
        const middleware = createQueryCountMiddleware(["/api/alerts"])
        const { req, res } = fakeReqRes("/api/properties")
        const next = vi.fn()

        middleware(req, res, next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(res.on).not.toHaveBeenCalled()
    })

    it("conta as queries incrementadas durante a requisição rastreada", () => {
        const middleware = createQueryCountMiddleware(["/api/alerts"])
        const { req, res, triggerFinish } = fakeReqRes("/api/alerts")
        const next = vi.fn(() => {
            incrementQueryCount()
            incrementQueryCount()
            incrementQueryCount()
        })

        middleware(req, res, next)
        triggerFinish()

        expect(next).toHaveBeenCalledTimes(1)
        expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function))
    })

    it("casa por prefixo — /api/consumption/summary é rastreado por /api/consumption", () => {
        const middleware = createQueryCountMiddleware(["/api/consumption"])
        const { req, res } = fakeReqRes("/api/consumption/summary")
        const next = vi.fn()

        middleware(req, res, next)

        expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function))
    })

    it("incrementQueryCount() fora de qualquer contexto rastreado não lança erro", () => {
        expect(() => incrementQueryCount()).not.toThrow()
    })

    it("contextos de requisições concorrentes não se misturam (AsyncLocalStorage isola por execução)", async () => {
        const middleware = createQueryCountMiddleware(["/api/alerts"])

        function run(queriesToCount: number): Promise<number | null> {
            const { req, res } = fakeReqRes("/api/alerts")

            return new Promise((resolve) => {
                middleware(req, res, () => {
                    void (async () => {
                        for (let i = 0; i < queriesToCount; i++) {
                            // Cede o loop de eventos entre incrementos — se o
                            // contexto vazasse entre requisições concorrentes,
                            // intercalar essas duas execuções revelaria o erro.
                            await Promise.resolve()
                            incrementQueryCount()
                        }
                        resolve(getQueryCount())
                    })()
                })
            })
        }

        const [countA, countB] = await Promise.all([run(2), run(5)])

        expect(countA).toBe(2)
        expect(countB).toBe(5)
    })
})
