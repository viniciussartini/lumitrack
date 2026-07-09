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
import { AlertNotifier } from "@/modules/alert/alert-notifier.js"
import type { AlertResponse } from "@/modules/alert/alert.repository.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// ─── Processor e AlertNotifier ────────────────────────────────────────────────

const manager       = IoTConnectionManager.getInstance()
const processor     = new IoTDataProcessor(manager)
const alertNotifier = new AlertNotifier()
processor.start()

const app = createApp({ prismaClient: prismaHttpTest, processor, alertNotifier })

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
    acceptedTerms: true,
    firstName: "João",
    lastName:  "Silva",
    cpf:       "529.982.247-25",
}

const anotherUser = {
    email:     "maria@example.com",
    password:  "Senha@123",
    userType:  "INDIVIDUAL",
    acceptedTerms: true,
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

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (#06, cookie httpOnly).
async function registerAndLogin(user = validUser): Promise<string> {
    await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email: user.email, password: user.password, channel: "MOBILE",
    })
    return res.body.data.token as string
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
        .send({ name: "Casa", distributorId: distRes.body.data.id as string })

    const areaRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id as string}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Sala" })

    const deviceRes = await request(app)
        .post(`/api/properties/${propRes.body.data.id as string}/areas/${areaRes.body.data.id as string}/devices`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Medidor", powerWatts: 1000 })

    return {
        token,
        propertyId: propRes.body.data.id    as string,
        areaId:     areaRes.body.data.id    as string,
        deviceId:   deviceRes.body.data.id  as string,
    }
}

// Retorna o userId a partir de um token — decodifica o payload JWT sem verificar a assinatura.
function extractUserId(token: string): string {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { id: string }
    return payload.id
}

// ─── Helpers de SSE ───────────────────────────────────────────────────────────

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

        stream.on("error", finish)
        stream.on("close", finish)

        const timer = setTimeout(finish, options.maxWaitMs)
    })
}

function simulateReading(deviceId: string, value: number): void {
    ;(processor as unknown as {
        process: (id: string, data: Record<string, unknown>) => void
    }).process(deviceId, { value })
}

// Constrói um AlertResponse mínimo para simular o disparo de um alerta.
function makeAlert(userId: string, overrides: Partial<AlertResponse> = {}): AlertResponse {
    return {
        id:           "alert-test-id",
        userId,
        targetType:   "PROPERTY",
        propertyId:   "property-id",
        areaId:       null,
        deviceId:     null,
        thresholdKwh: 100,
        message:      "Consumo alto detectado",
        triggeredAt:  new Date(),
        readAt:       null,
        createdAt:    new Date(),
        updatedAt:    new Date(),
        ...overrides,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: GET /api/iot/stream
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/iot/stream", () => {

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/iot/stream")
        expect(response.status).toBe(401)
    })

    it("deve retornar headers SSE corretos ao conectar com token válido", async () => {
        const { token } = await setupFull()

        const stream = await openSseStream(token)

        expect(stream.statusCode).toBe(200)
        expect(stream.headers["content-type"]).toContain("text/event-stream")
        expect(stream.headers["cache-control"]).toBe("no-cache")

        stream.destroy()
    })

    it("deve receber evento 'connected' com deviceCount ao abrir o stream", async () => {
        const { token } = await setupFull()

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
        const { deviceId: deviceIdA } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const stream = await openSseStream(tokenB)

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

    // ─── Testes de alertas em tempo real ───────────────────────────────────────

    it("deve receber evento 'alert' quando um alerta do usuário é disparado", async () => {
        const { token } = await setupFull()
        const userId    = extractUserId(token)

        const stream = await openSseStream(token)

        // Simula o disparo de um alerta do usuário após a conexão ser estabelecida.
        // Na produção, esse notify seria chamado pelo AlertService.checkAndTrigger.
        // Aqui chamamos diretamente o AlertNotifier para testar o canal SSE
        // de forma isolada, sem depender de um consumo real no banco.
        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs:      3000,
            stopAfterEvent: "alert",
            onEvent:        (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    alertNotifier.notify(makeAlert(userId))
                }
            },
        })

        const alertEvent = events.find((e) => e.event === "alert")
        expect(alertEvent).toBeDefined()

        const data = alertEvent!.data as { id: string; userId: string; thresholdKwh: number }
        expect(data.userId).toBe(userId)
        expect(data.thresholdKwh).toBe(100)
        expect(data.id).toBe("alert-test-id")
    })

    it("não deve receber alertas de outro usuário", async () => {
        const { token: tokenA } = await setupFull(validUser)
        const tokenB            = await registerAndLogin(anotherUser)
        const userIdA           = extractUserId(tokenA)

        // Usuário B conecta ao stream.
        const stream = await openSseStream(tokenB)

        // Dispara alerta do usuário A após o connected do usuário B.
        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 1000,
            onEvent:   (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    // Alerta do usuário A — não deve chegar ao usuário B.
                    alertNotifier.notify(makeAlert(userIdA))
                }
            },
        })

        const alertEvents = events.filter((e) => e.event === "alert")
        expect(alertEvents).toHaveLength(0)
    })
})