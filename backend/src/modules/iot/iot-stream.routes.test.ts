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
//
// Reformulação IoT (Fase 4): contrato SSE completo — `alert-firing` e
// `notification` chegam via UserEventHub (substituiu o antigo AlertNotifier,
// que só sabia notificar o payload cru do Alert antigo). O intervalo de
// re-resolução do conjunto de medidores é injetado curto neste app de teste
// (200ms) para exercitar o refresh periódico sem esperar os 60s reais de
// produção.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createServer, type Server } from "http"
import http from "http"
import type { AddressInfo } from "net"
import { Router } from "express"
import { createApp } from "@/app.js"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import { iotStreamRoutes } from "@/modules/iot/iot-stream.routes.js"
import { createAuthenticateMiddleware } from "@/shared/middlewares/authenticate.js"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// ─── Processor e UserEventHub ─────────────────────────────────────────────────

const manager = IoTConnectionManager.getInstance()
const processor = new IoTDataProcessor(manager)
const userEventHub = new UserEventHub()
processor.start()

// createApp não expõe o parâmetro de intervalo de refresh (é interno da
// rota) — montamos a rota SSE manualmente aqui, com um intervalo curto, e
// anexamos ao app já criado pelas demais rotas.
const app = createApp({ prismaClient: prismaHttpTest })
const authenticate = createAuthenticateMiddleware(prismaHttpTest)
const testStreamRouter = Router()
testStreamRouter.use(
    "/",
    iotStreamRoutes(
        authenticate,
        prismaHttpTest,
        processor,
        userEventHub,
        200, // membershipRefreshIntervalMs curto, só para teste
    ),
)
app.use("/api/iot-test", testStreamRouter)

// ─── Servidor TCP ─────────────────────────────────────────────────────────────

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

beforeEach(async () => {
    await cleanHttpDatabase()
})

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (#06, cookie httpOnly).
async function registerAndLogin(user = validUser): Promise<{ userId: string; token: string }> {
    const createRes = await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return { userId: createRes.body.data.id as string, token: res.body.data.token as string }
}

let distributorSeq = 0

// Property/EnergyDistributor criados direto via Prisma; medidor via API real.
async function setupUserWithMeter(
    user = validUser,
): Promise<{ userId: string; token: string; meterId: string }> {
    const { userId, token } = await registerAndLogin(user)

    distributorSeq += 1
    const distributor = await prismaHttpTest.energyDistributor.create({
        data: {
            name: "CEMIG",
            cnpj: `06.981.180/000${distributorSeq}-16`,
            state: "MG",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.18,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        },
    })

    const property = await prismaHttpTest.property.create({
        data: {
            userId,
            distributorId: distributor.id,
            name: "Casa",
            electricalSystem: "MONOPHASIC",
        },
    })

    const meterRes = await request(app)
        .post("/api/meters")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/meter",
        })

    return { userId, token, meterId: meterRes.body.data.id as string }
}

// ─── Helpers de SSE ───────────────────────────────────────────────────────────

function openSseStream(token: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
        const req = http.get(
            {
                hostname: "127.0.0.1",
                port: serverPort,
                path: "/api/iot-test/stream",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "text/event-stream",
                },
            },
            resolve,
        )
        req.on("error", reject)
    })
}

function collectSseEvents(
    stream: http.IncomingMessage,
    options: {
        maxWaitMs: number
        stopAfterEvent?: string
        onEvent?: (event: string, data: unknown) => void
    },
): Promise<Array<{ event: string; data: unknown }>> {
    return new Promise((resolve) => {
        const events: Array<{ event: string; data: unknown }> = []
        let buffer = ""
        let currentEvent = ""
        let done = false

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
                    } catch {
                        /* descarta dados malformados */
                    }
                    currentEvent = ""
                }
            }
        })

        stream.on("error", finish)
        stream.on("close", finish)

        const timer = setTimeout(finish, options.maxWaitMs)
    })
}

function simulateReading(meterId: string, payload: Record<string, unknown>): void {
    ;(
        processor as unknown as {
            process: (id: string, data: Record<string, unknown>) => void
        }
    ).process(meterId, payload)
}

const validReadingPayload = { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 }

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: GET /api/iot/stream
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/iot/stream", () => {
    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/iot-test/stream")
        expect(response.status).toBe(401)
    })

    it("deve retornar headers SSE corretos ao conectar com token válido", async () => {
        const { token } = await setupUserWithMeter()

        const stream = await openSseStream(token)

        expect(stream.statusCode).toBe(200)
        expect(stream.headers["content-type"]).toContain("text/event-stream")
        expect(stream.headers["cache-control"]).toBe("no-cache")

        stream.destroy()
    })

    it("deve receber evento 'connected' com meterCount ao abrir o stream", async () => {
        const { token } = await setupUserWithMeter()

        const stream = await openSseStream(token)
        const events = await collectSseEvents(stream, {
            maxWaitMs: 3000,
            stopAfterEvent: "connected",
        })

        const connected = events.find((e) => e.event === "connected")
        expect(connected).toBeDefined()

        const data = connected?.data as { meterCount: number }
        expect(data.meterCount).toBe(1)
    })

    it("deve receber evento 'reading' com a leitura elétrica quando o próprio medidor reporta", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const stream = await openSseStream(token)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 3000,
            stopAfterEvent: "reading",
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    simulateReading(meterId, validReadingPayload)
                }
            },
        })

        const reading = events.find((e) => e.event === "reading")
        expect(reading).toBeDefined()

        const data = reading!.data as { meterId: string; voltage: number; powerW: number }
        expect(data.meterId).toBe(meterId)
        expect(data.voltage).toBe(220)
        expect(data.powerW).toBe(440)
    })

    it("não deve receber leituras de medidores de outro usuário", async () => {
        const { meterId: meterIdA } = await setupUserWithMeter(validUser)
        const { token: tokenB } = await setupUserWithMeter(anotherUser)

        const stream = await openSseStream(tokenB)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 1000,
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    simulateReading(meterIdA, validReadingPayload)
                }
            },
        })

        const readings = events.filter((e) => e.event === "reading")
        expect(readings).toHaveLength(0)
    })

    it("deve receber evento 'alert-firing' emitido pelo UserEventHub para o próprio usuário", async () => {
        const { userId, token } = await setupUserWithMeter()

        const stream = await openSseStream(token)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 3000,
            stopAfterEvent: "alert-firing",
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    userEventHub.emit(userId, "alert-firing", {
                        type: "start",
                        alertId: "alert-1",
                        alertName: "Pico",
                        meterId: "meter-1",
                        startedAt: new Date().toISOString(),
                    })
                }
            },
        })

        const firing = events.find((e) => e.event === "alert-firing")
        expect(firing).toBeDefined()
        expect((firing!.data as { type: string }).type).toBe("start")
    })

    it("deve receber evento 'notification' emitido pelo UserEventHub para o próprio usuário", async () => {
        const { userId, token } = await setupUserWithMeter()

        const stream = await openSseStream(token)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 3000,
            stopAfterEvent: "notification",
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    userEventHub.emit(userId, "notification", {
                        id: "n1",
                        alertName: "Pico",
                        message: "Alerta disparado",
                    })
                }
            },
        })

        const notification = events.find((e) => e.event === "notification")
        expect(notification).toBeDefined()
        expect((notification!.data as { message: string }).message).toBe("Alerta disparado")
    })

    it("não deve receber eventos alert-firing/notification de outro usuário", async () => {
        const { userId: userIdA } = await setupUserWithMeter(validUser)
        const { token: tokenB } = await setupUserWithMeter(anotherUser)

        const stream = await openSseStream(tokenB)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            maxWaitMs: 1000,
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    userEventHub.emit(userIdA, "alert-firing", { type: "start" })
                }
            },
        })

        expect(events.filter((e) => e.event === "alert-firing")).toHaveLength(0)
    })

    it("deve re-resolver o conjunto de medidores periodicamente (novo medidor passa a transmitir sem reconectar)", async () => {
        const { userId, token } = await registerAndLogin()

        // Conecta ANTES de existir qualquer medidor — meterCount inicial = 0.
        const stream = await openSseStream(token)

        let connectedReceived = false
        let meterIdCreated: string | undefined

        const events = await collectSseEvents(stream, {
            maxWaitMs: 3000,
            stopAfterEvent: "reading",
            onEvent: (event, data) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    expect((data as { meterCount: number }).meterCount).toBe(0)

                    // Cria o medidor DEPOIS de conectado — só deve passar a
                    // transmitir após o próximo refresh periódico (200ms no
                    // app de teste), sem precisar reconectar.
                    void (async () => {
                        distributorSeq += 1
                        const distributor = await prismaHttpTest.energyDistributor.create({
                            data: {
                                name: "CEMIG",
                                cnpj: `06.981.180/000${distributorSeq}-16`,
                                state: "MG",
                                tusdPerKwh: 0.3,
                                tePerKwh: 0.3,
                                icmsRate: 0.18,
                                pisRate: 0.0165,
                                cofinsRate: 0.076,
                            },
                        })
                        const property = await prismaHttpTest.property.create({
                            data: {
                                userId,
                                distributorId: distributor.id,
                                name: "Casa",
                                electricalSystem: "MONOPHASIC",
                            },
                        })
                        const meter = await prismaHttpTest.meter.create({
                            data: {
                                name: "Medidor Tardio",
                                targetType: "PROPERTY",
                                propertyId: property.id,
                                protocol: "MQTT",
                                host: "localhost",
                                port: 1883,
                                topic: "t",
                            },
                        })
                        meterIdCreated = meter.id

                        // Espera o refresh periódico (200ms) rodar antes de simular a leitura.
                        setTimeout(() => simulateReading(meter.id, validReadingPayload), 400)
                    })()
                }
            },
        })

        const reading = events.find((e) => e.event === "reading")
        expect(reading).toBeDefined()
        expect((reading!.data as { meterId: string }).meterId).toBe(meterIdCreated)
    })
})
