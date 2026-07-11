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
// Reformulação IoT (Fase 2): o evento "reading" passou a carregar a leitura
// elétrica por medidor (meterId/voltage/current/powerW/powerFactor), não mais
// um incremento de kWh por device. Os testes de "alert" (evento SSE de
// alerta) foram removidos desta suíte nesta fase — o módulo `alert` e o
// contrato SSE de alert-firing/notification são redesenhados na Fase 4.
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
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

// ─── Processor e AlertNotifier ────────────────────────────────────────────────

const manager       = IoTConnectionManager.getInstance()
const processor     = new IoTDataProcessor(manager)
const alertNotifier = new AlertNotifier()
processor.start()

const app = createApp({ prismaClient: prismaHttpTest, processor, alertNotifier })

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

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (#06, cookie httpOnly).
async function registerAndLogin(user = validUser): Promise<string> {
    await request(app).post("/api/users").send(user)
    const res = await request(app).post("/api/auth/login").send({
        email: user.email, password: user.password, channel: "MOBILE",
    })
    return res.body.data.token as string
}

let distributorSeq = 0

// Property/EnergyDistributor criados direto via Prisma — os módulos HTTP
// ainda não foram atualizados para o schema v2 (Fase 3). O medidor é criado
// via a API real (/api/meters), que é o que esta fase está testando.
async function setupUserWithMeter(user = validUser): Promise<{ token: string; meterId: string }> {
    const token = await registerAndLogin(user)
    const dbUser = await prismaHttpTest.user.findUniqueOrThrow({ where: { email: user.email } })

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
            userId: dbUser.id,
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

    return { token, meterId: meterRes.body.data.id as string }
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

function simulateReading(meterId: string, payload: Record<string, unknown>): void {
    ;(processor as unknown as {
        process: (id: string, data: Record<string, unknown>) => void
    }).process(meterId, payload)
}

const validReadingPayload = { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 }

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: GET /api/iot/stream
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/iot/stream", () => {

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/iot/stream")
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
            maxWaitMs:      3000,
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
            maxWaitMs:      3000,
            stopAfterEvent: "reading",
            onEvent:        (event) => {
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
            onEvent:   (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    simulateReading(meterIdA, validReadingPayload)
                }
            },
        })

        const readings = events.filter((e) => e.event === "reading")
        expect(readings).toHaveLength(0)
    })
})
