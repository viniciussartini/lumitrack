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

// A09: teste que precisa falhar se o `redact` for removido do
// logger, vazando dado sensível em log estruturado. NODE_ENV=test silencia o
// logger singleton (`resolveLogLevel`), então
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

describe("pino-http — o Referer não leva token de URL ao log", () => {
    const RESET_TOKEN = "token-de-redefinicao-vivo-0123456789"

    it("a página de redefinição chama a API com o token no Referer e ele não aparece no log", async () => {
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

        await request(app)
            .get("/api/auth/me")
            .set("Referer", `https://app.example.com/reset-password?token=${RESET_TOKEN}`)

        const output = lines.join("\n")
        expect(output).toContain("/api/auth/me")
        expect(output).not.toContain(RESET_TOKEN)
    })
})

describe("corpo malformado — a senha do corpo nunca chega ao log", () => {
    const SECRET = "Segredo@123-corpo-malformado"

    function createCapturedApp() {
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
        return { lines, app: createApp({ prismaClient: prismaHttpTest, logger: capturedLogger }) }
    }

    it("JSON malformado com a senha responde 400 e a senha não aparece no log", async () => {
        const { app, lines } = createCapturedApp()

        const response = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send(`{"email":"a@example.com","password":"${SECRET}"`)

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toContain(SECRET)
        expect(lines.join("\n")).not.toContain(SECRET)
    })

    it("corpo acima do limite responde 413 e o conteúdo não aparece no log", async () => {
        const { app, lines } = createCapturedApp()

        const response = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ password: SECRET, filler: "x".repeat(200_000) }))

        expect(response.status).toBe(413)
        expect(lines.join("\n")).not.toContain(SECRET)
    })

    it("redige o corpo anexado a um erro logado, como defesa extra", () => {
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
        const err = Object.assign(new Error("parse"), { body: `{"password":"${SECRET}"` })

        capturedLogger.error({ err }, "Erro inesperado")

        expect(lines.join("\n")).not.toContain(SECRET)
        expect(lines.join("\n")).toContain("[REDACTED]")
    })
})
