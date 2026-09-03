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
// Contrato SSE completo: `alert-firing` e `notification` chegam via
// UserEventHub. O intervalo de re-resolução do conjunto de medidores é
// injetado curto neste app de teste (200ms) para exercitar o refresh
// periódico sem esperar os 60s reais de produção.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createServer, type Server } from "http"
import http from "http"
import type { AddressInfo } from "net"
import { Router, type Response } from "express"
import { createApp } from "@/app.js"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import {
    iotStreamRoutes,
    createBackpressureState,
    writeSseChunk,
    createEventWriter,
} from "@/modules/iot/iot-stream.routes.js"
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
// via header — WEB não devolve token no body (cookie httpOnly).
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

// Sem Authorization — só o `?ticket=` na query, o mesmo caminho que a demo
// do Render usa cross-origin (cookie não existe nesse cenário).
function openSseStreamWithTicket(ticket: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
        const req = http.get(
            {
                hostname: "127.0.0.1",
                port: serverPort,
                path: `/api/iot-test/stream?ticket=${encodeURIComponent(ticket)}`,
                headers: { Accept: "text/event-stream" },
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

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: writeSseChunk / backpressure
//
// Reproduzir res.write() devolvendo false (buffer de saída cheio) e o
// 'drain' subsequente de verdade exigiria um consumidor lento sobre um
// socket TCP real — daí a extração testada aqui com um SseWritable fake em
// vez de um teste de integração como o resto do arquivo.
// ─────────────────────────────────────────────────────────────────────────────

describe("writeSseChunk", () => {
    function createFakeWritable(writeReturns: boolean[]): {
        write: (chunk: string) => boolean
        once: (event: "drain", listener: () => void) => void
        chunks: string[]
        fireDrain: () => void
    } {
        const chunks: string[] = []
        let drainListener: (() => void) | null = null
        let callIndex = 0

        return {
            chunks,
            write: (chunk) => {
                chunks.push(chunk)
                const result = writeReturns[callIndex] ?? true
                callIndex += 1
                return result
            },
            once: (_event, listener) => {
                drainListener = listener
            },
            fireDrain: () => {
                drainListener?.()
                drainListener = null
            },
        }
    }

    it("escreve normalmente enquanto o buffer de saída não está cheio", () => {
        const fake = createFakeWritable([true, true])
        const state = createBackpressureState()
        const onSlowConsumer = vi.fn()

        writeSseChunk(fake, state, "a", onSlowConsumer)
        writeSseChunk(fake, state, "b", onSlowConsumer)

        expect(fake.chunks).toEqual(["a", "b"])
        expect(onSlowConsumer).not.toHaveBeenCalled()
        expect(state.disconnected).toBe(false)
    })

    it("espera o 'drain' quando write() devolve false, sem desconectar — próxima escrita só acontece depois de drenar", () => {
        const fake = createFakeWritable([false, true])
        const state = createBackpressureState()
        const onSlowConsumer = vi.fn()

        writeSseChunk(fake, state, "a", onSlowConsumer)
        expect(state.pendingSinceDrain).toBe(1)

        fake.fireDrain()
        expect(state.pendingSinceDrain).toBe(0)

        writeSseChunk(fake, state, "b", onSlowConsumer)
        expect(fake.chunks).toEqual(["a", "b"])
        expect(onSlowConsumer).not.toHaveBeenCalled()
    })

    it("tolera 1 chunk a mais acumulado antes do 'drain' — várias mensagens na mesma volta do event loop não derrubam a conexão", () => {
        const fake = createFakeWritable([false, false, true])
        const state = createBackpressureState()
        const onSlowConsumer = vi.fn()

        writeSseChunk(fake, state, "a", onSlowConsumer)
        expect(state.pendingSinceDrain).toBe(1)

        // "b" chega antes do 'drain' de "a" — ainda dentro da tolerância,
        // não desconecta.
        writeSseChunk(fake, state, "b", onSlowConsumer)
        expect(state.pendingSinceDrain).toBe(2)
        expect(onSlowConsumer).not.toHaveBeenCalled()
        expect(fake.chunks).toEqual(["a", "b"])

        fake.fireDrain()
        expect(state.pendingSinceDrain).toBe(0)
    })

    it("desconecta um consumidor persistentemente lento — 2 mensagens acumuladas além da tolerância, sem nenhum 'drain' entre elas", () => {
        const fake = createFakeWritable([false, false])
        const state = createBackpressureState()
        const onSlowConsumer = vi.fn()

        writeSseChunk(fake, state, "a", onSlowConsumer)
        writeSseChunk(fake, state, "b", onSlowConsumer) // ainda tolerado
        expect(onSlowConsumer).not.toHaveBeenCalled()

        // "c" chega e nenhum 'drain' aconteceu entre "a", "b" e "c" — agora
        // sim, persistentemente lento.
        writeSseChunk(fake, state, "c", onSlowConsumer)

        expect(onSlowConsumer).toHaveBeenCalledTimes(1)
        expect(state.disconnected).toBe(true)
        // "c" nunca chega a ser escrito — o consumidor já foi desconectado.
        expect(fake.chunks).toEqual(["a", "b"])
    })

    it("depois de desconectado, ignora escritas futuras sem chamar onSlowConsumer de novo", () => {
        const fake = createFakeWritable([false, false])
        const state = createBackpressureState()
        const onSlowConsumer = vi.fn()

        writeSseChunk(fake, state, "a", onSlowConsumer)
        writeSseChunk(fake, state, "b", onSlowConsumer)
        writeSseChunk(fake, state, "c", onSlowConsumer)
        writeSseChunk(fake, state, "d", onSlowConsumer)

        expect(onSlowConsumer).toHaveBeenCalledTimes(1)
        // "a" e "b" chegam a ser escritos (dentro da tolerância); "c" é a
        // desconexão em si (nunca escrito); "d" é ignorado (já desconectado).
        expect(fake.chunks).toEqual(["a", "b"])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: createEventWriter — integração real com cleanup()/res.end()
//
// writeSseChunk isolado (acima) já prova a máquina de estados de
// backpressure em si. O que faltava: provar que createEventWriter de fato
// aciona cleanup() e res.end() quando um consumidor é considerado lento —
// se alguém remover essa chamada de dentro de disconnectSlowConsumer, os
// testes de writeSseChunk continuariam verdes (não conhecem cleanup()) e o
// listener do processor ficaria pendurado para sempre, sem nenhum teste
// pegando isso.
// ─────────────────────────────────────────────────────────────────────────────

describe("createEventWriter", () => {
    function createFakeResponse(): {
        write: ReturnType<typeof vi.fn>
        once: (event: "drain", listener: () => void) => void
        end: ReturnType<typeof vi.fn>
        writableEnded: boolean
    } {
        const fakeRes = {
            // Sempre "buffer cheio" e o 'drain' nunca dispara — simula um
            // consumidor que não drena de jeito nenhum.
            write: vi.fn(() => false),
            once: (_event: "drain", _listener: () => void) => {},
            end: vi.fn(),
            writableEnded: false,
        }
        fakeRes.end.mockImplementation(() => {
            fakeRes.writableEnded = true
        })
        return fakeRes
    }

    it("aciona cleanup() e res.end() de verdade ao desconectar um consumidor lento", () => {
        const fakeRes = createFakeResponse()
        const cleanup = vi.fn()
        const { writeEvent } = createEventWriter(fakeRes as unknown as Response, "user-1", cleanup)

        writeEvent("reading", "1") // buffer cheio
        writeEvent("reading", "2") // ainda tolerado
        writeEvent("reading", "3") // persistentemente lento — desconecta

        expect(cleanup).toHaveBeenCalledTimes(1)
        expect(fakeRes.end).toHaveBeenCalledTimes(1)
    })

    it("não chama res.end() de novo se a resposta já tiver encerrado por outro motivo (ex.: sessão revogada)", () => {
        const fakeRes = createFakeResponse()
        fakeRes.writableEnded = true // já encerrada por outro caminho
        const cleanup = vi.fn()
        const { writeEvent } = createEventWriter(fakeRes as unknown as Response, "user-1", cleanup)

        writeEvent("reading", "1")
        writeEvent("reading", "2")
        writeEvent("reading", "3")

        expect(cleanup).toHaveBeenCalledTimes(1)
        expect(fakeRes.end).not.toHaveBeenCalled()
    })
})

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

    it("serializa a amostra uma única vez, mesmo com 2 conexões do mesmo usuário (2 abas) recebendo o mesmo evento", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const streamA = await openSseStream(token)
        const streamB = await openSseStream(token)

        const stringifySpy = vi.spyOn(JSON, "stringify")

        // try/finally: se qualquer expect abaixo falhar (ou o Promise.all
        // rejeitar), o spy precisa ser restaurado de qualquer jeito — senão
        // ele vaza para os testes seguintes do arquivo, que passariam a
        // rodar com JSON.stringify espionado sem saber.
        try {
            let connectedCount = 0
            const triggerWhenBothConnected = (event: string): void => {
                if (event !== "connected") return
                connectedCount += 1
                if (connectedCount === 2) {
                    simulateReading(meterId, validReadingPayload)
                }
            }

            const [eventsA, eventsB] = await Promise.all([
                collectSseEvents(streamA, {
                    maxWaitMs: 3000,
                    stopAfterEvent: "reading",
                    onEvent: triggerWhenBothConnected,
                }),
                collectSseEvents(streamB, {
                    maxWaitMs: 3000,
                    stopAfterEvent: "reading",
                    onEvent: triggerWhenBothConnected,
                }),
            ])

            // Conta só as chamadas de stringify sobre a própria amostra —
            // outras chamadas incidentais (ex.: logging, Prisma) acontecem em
            // paralelo e não devem contaminar a contagem. Precisa ler
            // `.mock.calls` ANTES de `mockRestore()` (no finally) —
            // `mockRestore()` também limpa o histórico de chamadas, não só
            // restaura a implementação original.
            const sampleStringifyCalls = stringifySpy.mock.calls.filter(([arg]) => {
                return (
                    typeof arg === "object" &&
                    arg !== null &&
                    (arg as Record<string, unknown>)["meterId"] === meterId &&
                    (arg as Record<string, unknown>)["voltage"] === validReadingPayload["voltage"]
                )
            })

            expect(eventsA.find((e) => e.event === "reading")).toBeDefined()
            expect(eventsB.find((e) => e.event === "reading")).toBeDefined()
            expect(sampleStringifyCalls).toHaveLength(1)
        } finally {
            stringifySpy.mockRestore()
        }
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

    // A sessão que abriu o stream é revalidada no mesmo refresh periódico
    // do conjunto de medidores (200ms no app de teste).
    it("encerra o stream quando a sessão que o abriu é revogada (logout)", async () => {
        const { token } = await setupUserWithMeter()

        const stream = await openSseStream(token)
        let connectedReceived = false
        let streamClosed = false
        stream.on("close", () => {
            streamClosed = true
        })

        await collectSseEvents(stream, {
            maxWaitMs: 4000,
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    // Revoga a sessão de verdade via logout — mesmo AuthToken
                    // usado para abrir o stream.
                    void (async () => {
                        await request(app)
                            .post("/api/auth/logout")
                            .set("Authorization", `Bearer ${token}`)
                            .send()
                    })()
                }
            },
        })

        expect(streamClosed).toBe(true)

        // Confirma no banco que a sessão está mesmo revogada — não é só o
        // stream que fechou por outro motivo.
        const storedTokens = await prismaHttpTest.authToken.findMany({
            where: { revokedAt: { not: null } },
        })
        expect(storedTokens.length).toBeGreaterThan(0)
    })

    it("mantém o stream aberto e continua entregando leituras enquanto a sessão segue válida", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const stream = await openSseStream(token)

        let connectedReceived = false
        const events = await collectSseEvents(stream, {
            // Maior que 1 ciclo do refresh periódico (200ms) — garante que a
            // revalidação rodou ao menos uma vez sem derrubar a conexão.
            maxWaitMs: 1500,
            stopAfterEvent: "reading",
            onEvent: (event) => {
                if (event === "connected" && !connectedReceived) {
                    connectedReceived = true
                    setTimeout(() => simulateReading(meterId, validReadingPayload), 400)
                }
            },
        })

        const reading = events.find((e) => e.event === "reading")
        expect(reading).toBeDefined()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: POST /api/iot/stream-ticket + GET /api/iot/stream?ticket=...
//
// Caminho usado quando o stream precisa ser aberto cross-origin (demo do
// Render, ADR-0010) — cookie de sessão não atravessa domínio, então o
// cliente troca um ticket de uso único (emitido same-origin) pela conexão.
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/iot/stream-ticket", () => {
    it("deve retornar 401 sem autenticação", async () => {
        const response = await request(app).post("/api/iot-test/stream-ticket")
        expect(response.status).toBe(401)
    })

    it("deve emitir um ticket com token válido", async () => {
        const { token } = await setupUserWithMeter()

        const response = await request(app)
            .post("/api/iot-test/stream-ticket")
            .set("Authorization", `Bearer ${token}`)
            .send()

        expect(response.status).toBe(201)
        expect(typeof response.body.data.ticket).toBe("string")
        expect((response.body.data.ticket as string).length).toBeGreaterThan(0)
    })
})

describe("GET /api/iot/stream com ?ticket=", () => {
    it("deve retornar 401 com ticket inexistente", async () => {
        const stream = await openSseStreamWithTicket("ticket-que-nao-existe")
        expect(stream.statusCode).toBe(401)
    })

    it("deve conectar e receber eventos com um ticket válido", async () => {
        const { token, meterId } = await setupUserWithMeter()

        const ticketRes = await request(app)
            .post("/api/iot-test/stream-ticket")
            .set("Authorization", `Bearer ${token}`)
            .send()
        const ticket = ticketRes.body.data.ticket as string

        const stream = await openSseStreamWithTicket(ticket)
        expect(stream.statusCode).toBe(200)

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
        expect((reading!.data as { meterId: string }).meterId).toBe(meterId)
    })

    it("não deve permitir reusar o mesmo ticket duas vezes", async () => {
        const { token } = await setupUserWithMeter()

        const ticketRes = await request(app)
            .post("/api/iot-test/stream-ticket")
            .set("Authorization", `Bearer ${token}`)
            .send()
        const ticket = ticketRes.body.data.ticket as string

        const first = await openSseStreamWithTicket(ticket)
        expect(first.statusCode).toBe(200)
        first.destroy()

        const second = await openSseStreamWithTicket(ticket)
        expect(second.statusCode).toBe(401)
    })
})
