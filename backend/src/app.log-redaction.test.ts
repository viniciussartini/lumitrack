import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import pino from "pino"
import { Writable } from "node:stream"
import { createApp } from "@/app.js"
import { logRedactPaths } from "@/shared/logger/logger.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const validUser = {
    email: "redact@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Redact",
    lastName: "Teste",
    cpf: "529.982.247-25",
}

function findSetCookieLine(response: request.Response, cookieName: string): string | undefined {
    const setCookie = response.headers["set-cookie"] as unknown as string[] | undefined
    return setCookie?.find((line) => line.startsWith(`${cookieName}=`))
}

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// A09 / RNF05: teste que precisa falhar se o `redact` for removido do
// logger. NODE_ENV=test silencia o logger singleton (`resolveLogLevel`), então
// não dá pra observar o output dele diretamente — aqui injetamos um pino
// próprio via `AppDependencies.logger`, com `level: "info"` e o MESMO
// `redact` de produção (`logRedactPaths`), escrevendo num stream capturado.
describe("pino-http — redação de dado sensível no log de requisição", () => {
    it("não expõe o cookie de sessão em nenhuma linha de log de uma requisição autenticada", async () => {
        const lines: string[] = []
        const sink = new Writable({
            write(chunk: Buffer, _encoding, callback) {
                lines.push(chunk.toString())
                callback()
            },
        })
        const capturedLogger = pino(
            { level: "info", redact: { paths: logRedactPaths, censor: "[REDACTED]" } },
            sink,
        )
        const app = createApp({ prismaClient: prismaHttpTest, logger: capturedLogger })

        await request(app).post("/api/users").send(validUser)
        const agent = request.agent(app)
        const loginRes = await agent.post("/api/auth/login").send({
            email: validUser.email,
            password: validUser.password,
            channel: "WEB",
        })

        const sessionCookieLine = findSetCookieLine(loginRes, "lumitrack_session")
        expect(sessionCookieLine).toBeDefined()
        const sessionCookieValue = sessionCookieLine!.split(";")[0]!.split("=")[1]!

        // A requisição autenticada seguinte é a que carrega o cookie de
        // sessão no header `cookie` — é essa linha de log que vazaria o
        // valor sem o `redact`.
        await agent.get("/api/auth/me")

        const output = lines.join("\n")
        expect(output).not.toContain(sessionCookieValue)
        expect(output).toContain("[REDACTED]")
    })
})
