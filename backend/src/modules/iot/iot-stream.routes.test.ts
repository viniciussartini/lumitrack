// ─────────────────────────────────────────────────────────────────────────────
// iot-stream.routes.test.ts — testes do endpoint SSE
//
// Por que não usar Supertest aqui?
// Supertest foi projetado para ciclos request/response curtos. Para SSE, a
// conexão fica aberta indefinidamente — o Supertest não consegue entregar
// eventos de streaming de forma confiável nesse cenário.
//
// Solução: iniciamos o Express em um servidor TCP real (porta aleatória) e
// usamos o módulo `http` nativo do Node, que suporta streaming completamente.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createServer, type Server } from "http"
import http from "http"
import type { AddressInfo } from "net"
import { createApp } from "@/app.js"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// ─── Processor ────────────────────────────────────────────────────────────────

const manager   = IoTConnectionManager.getInstance()
const processor = new IoTDataProcessor(manager)
processor.start()

const app = createApp({ prismaClient: prismaHttpTest, processor })

// ─── Servidor TCP ─────────────────────────────────────────────────────────────
// Iniciado com porta 0 (o SO escolhe uma porta livre automaticamente).
// Todos os testes SSE fazem requisições a esta porta via http.get().

let httpServer: Server
let serverPort: number

beforeAll(async () => {
    await new Promise<void>((resolve) => {
        httpServer = createServer(app)
        httpServer.listen(0, "127.0.0.1", resolve)
    })
    serverPort = (httpServer.address() as AddressInfo).port
})

afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    await prismaHttpTest.$disconnect()
})

beforeEach(async () => { await cleanHttpDatabase() })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email:     "joao@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const anotherUser = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    firstName: "Maria",
    lastName:  "Santos",
    cpf:       "310.037.856-38",
}

const validDistributorBody = {
    name:             "CEMIG",
    cnpj:             "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage:   220,
    kwhPrice:         0.75,
}

// ─── Helpers de setup ─────────────────────────────────────────────────────────
// Usamos request(app) do Supertest para o setup de dados — não precisa de
// servidor TCP, e é mais rápido. Os dados são gravados em prismaHttpTest,
// o mesmo banco usado pelo httpServer.

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email:    user.email,
        password: user.password,
        channel:  "WEB",
    })
    return loginRes.body.data.token as string
}

async function setupFull(user = validUser) {
    const token = await registerAndLogin(user)

    const distRes = await request(app)
        .post("/api/distributors")
        .set("Authorization", `Bearer ${token}`)
        .send(validDistributorBody)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distRes.body.data.id })

    const areaRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Sala" })

    const deviceRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id}/areas/${areaRes.body.data.id}/devices`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Medidor", powerWatts: 1000 })

    return {
        token,
        propertyId: propRes.body.data.id  as string,
        areaId:     areaRes.body.data.id  as string,
        deviceId:   deviceRes.body.data.id as string,
    }
}

// ─── Helpers SSE ──────────────────────────────────────────────────────────────

// Abre uma conexão SSE real via tcp. Retorna a IncomingMessage (stream legível)
// com headers já disponíveis — dados chegam em eventos subsequentes.
function openSseStream(token: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: "127.0.0.1",
            port:     serverPort,
            path:     "/api/iot/stream",
            headers:  {
                Authorization: `Bearer ${token}`,
                Accept:        "text/event-stream",
            },
        }, resolve)
        req.on("error", reject)
    })
}

// Coleta eventos SSE do stream até:
//   a) o evento em `stopAfterEvent` ser recebido, ou
//   b) `maxWaitMs` ser atingido.
//
// `onEvent` é chamado a cada evento recebido — útil para disparar ações
// em resposta a um evento específico (ex: simular leitura após "connected").
//
// O flag `done` evita que a Promise seja resolvida múltiplas vezes quando
// o stream é destruído e dispara tanto "error" quanto "close".
function collectSseEvents(
    stream:  http.IncomingMessage,
    options: {
        maxWaitMs:       number
        stopAfterEvent?: string
        onEvent?:        (event: string, data: unknown) => void
    },
): Promise<Array<{ event: string; data: unknown }>> {
    return new Promise((resolve) => {
        const events: Array<{ event: string; data: unknown }> = []
        let buffer       = ""
        let currentEvent = ""
        let done         = false

        const finish = () => {
            if (done) return
            done = true
            clearTimeout(timer)
            stream.destroy()
            resolve(events)
        }

        stream.setEncoding("utf8")

        stream.on("data", (chunk: string) => {
            if (done) return
            buffer += chunk

            // Divide em linhas, mantendo a incompleta para o próximo chunk.
            // SSE delimita eventos com \n\n — o split em \n processa linha a linha.
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    currentEvent = line.slice(7).trim()
                } else if (line.startsWith("data: ")) {
                    try {
                        const parsed = JSON.parse(line.slice(6)) as unknown
                        events.push({ event: currentEvent, data: parsed })
                        options.onEvent?.(currentEvent, parsed)

                        if (options.stopAfterEvent && currentEvent === options.stopAfterEvent) {
                            finish()
                            return
                        }
                    } catch { /* descarta dados malformados */ }
                    currentEvent = ""
                }
            }
        })

        // ECONNRESET é esperado ao chamar stream.destroy() — não é um erro real.
        stream.on("error", finish)
        stream.on("close", finish)

        const timer = setTimeout(finish, options.maxWaitMs)
    })
}

// Simula a chegada de dados de um sensor diretamente no IoTDataProcessor,
// sem passar pelo IoTConnectionManager (sem conexão real).
// Acessa o método privado `process` via cast para não expor API interna.
function simulateReading(deviceId: string, value: number): void {
    ;(processor as unknown as {
        process: (id: string, data: Record<string, unknown>) => void
    }).process(deviceId, { value })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: GET /api/iot/stream
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/iot/stream", () => {

    it("deve retornar 401 sem token", async () => {
        // Usa Supertest aqui — o middleware de auth rejeita antes do stream abrir,
        // então o ciclo normal request/response funciona perfeitamente.
        const response = await request(app).get("/api/iot/stream")
        expect(response.status).toBe(401)
    })

    it("deve retornar headers SSE corretos ao conectar com token válido", async () => {
        const { token } = await setupFull()

        // openSseStream resolve assim que os headers chegam (sem aguardar body).
        // Isso é possível porque o Express chama res.flushHeaders() antes de
        // qualquer operação assíncrona — os headers chegam imediatamente.
        const stream = await openSseStream(token)

        expect(stream.statusCode).toBe(200)
        expect(stream.headers["content-type"]).toContain("text/event-stream")
        expect(stream.headers["cache-control"]).toBe("no-cache")

        stream.destroy()
    })

    it("deve receber evento 'connected' com deviceCount ao abrir o stream", async () => {
        const { token } = await setupFull()
        // setupFull cria exatamente 1 device — o evento connected deve refletir isso.

        const stream = await openSseStream(token)
        const events = await collectSseEvents(stream, {
            maxWaitMs:      3000,
            stopAfterEvent: "connected",
        })

        const connected = events.find((e) => e.event === "connected")
        expect(connected).toBeDefined()

        const data = connected?.data as { deviceCount: number }
        expect(data.deviceCount).toBe(1)
    })

    it("deve receber evento 'reading' quando uma leitura do seu device chega", async () => {
        const { token, deviceId } = await setupFull()

        const stream = await openSseStream(token)

        // Simula a leitura SOMENTE após receber "connected" — garante que
        // o listener SSE do servidor já está registrado quando a leitura chega.
        // Sem essa sincronização, a leitura poderia ser emitida antes do listener
        // existir e o evento "reading" nunca chegaria ao cliente.
        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs:      3000,
            stopAfterEvent: "reading",
            onEvent:        (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    simulateReading(deviceId, 0.003)
                }
            },
        })

        const reading = events.find((e) => e.event === "reading")
        expect(reading).toBeDefined()

        const data = reading!.data as { deviceId: string; kwhConsumed: number }
        expect(data.deviceId).toBe(deviceId)
        expect(data.kwhConsumed).toBeCloseTo(0.003)
    })

    it("não deve receber leituras de devices de outro usuário", async () => {
        // Usuário A tem 1 device. Usuário B conecta ao stream.
        // Quando o device do A gera leitura, o B NÃO deve recebê-la.
        const { deviceId: deviceIdA } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const stream = await openSseStream(tokenB)

        // Simula leitura do device A após o connected do usuário B.
        // Aguarda 1000ms — se nenhum "reading" chegar, o isolamento está correto.
        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 1000,
            onEvent:   (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    simulateReading(deviceIdA, 0.005)
                }
            },
        })

        const readings = events.filter((e) => e.event === "reading")
        expect(readings).toHaveLength(0)
    })
})