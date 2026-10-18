import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const app = createApp({ prismaClient: prismaHttpTest })

const user = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

async function login(): Promise<string> {
    await request(app).post("/api/users").send(user)
    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password, channel: "MOBILE" })
    return response.body.data.token as string
}

interface PropertyOverride {
    tariffGroup?: "GROUP_A" | "GROUP_B"
    contractedDemandKw?: number
}

// Propriedade com medidor próprio. Grupo B por padrão; o Grupo A é Verde com
// demanda contratada de 100 kW.
async function setupProperty(override: PropertyOverride = {}) {
    const token = await login()
    const owner = await prismaHttpTest.user.findFirstOrThrow({ where: { email: user.email } })
    const distributor = await createTestDistributor(prismaHttpTest)
    const groupA = override.tariffGroup === "GROUP_A"
    const property = await prismaHttpTest.property.create({
        data: {
            userId: owner.id,
            distributorId: distributor.id,
            name: "Fábrica Norte",
            electricalSystem: "TRIPHASIC",
            tariffGroup: override.tariffGroup ?? "GROUP_B",
            tariffSubgroup: groupA ? "A4" : null,
            tariffModality: groupA ? "GREEN" : null,
            contractedDemandKw: groupA ? (override.contractedDemandKw ?? 100) : null,
            billingClass: groupA ? null : "B1",
        },
    })
    const meter = await prismaHttpTest.meter.create({
        data: {
            name: "Medidor geral",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "fabrica/geral",
        },
    })
    return { token, ownerId: owner.id, propertyId: property.id, meterId: meter.id }
}

const reading = (meterId: string, minuteStart: string, extra: Record<string, number> = {}) => ({
    meterId,
    minuteStart: new Date(minuteStart),
    kwhConsumed: 1,
    avgVoltage: 220,
    avgCurrent: 5,
    avgPowerW: 1100,
    avgPowerFactor: 1,
    sampleCount: 60,
    secondsCovered: 60,
    ...extra,
})

const freePeriod = (type: string, targetId: string, format: "PDF" | "CSV") => ({
    type,
    targetType: "PROPERTY",
    targetId,
    format,
    from: "2026-07-01T03:00:00.000Z",
    to: "2026-08-01T03:00:00.000Z",
})

async function emit(token: string, body: Record<string, unknown>) {
    return request(app).post("/api/reports").set("Authorization", `Bearer ${token}`).send(body)
}

async function download(token: string, id: string) {
    return request(app)
        .get(`/api/reports/${id}/download`)
        .set("Authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
            const chunks: Buffer[] = []
            res.on("data", (chunk: Buffer) => chunks.push(chunk))
            res.on("end", () => callback(null, Buffer.concat(chunks)))
        })
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("relatório de alertas", () => {
    async function withEpisode() {
        const ctx = await setupProperty()
        const alert = await prismaHttpTest.alert.create({
            data: {
                userId: ctx.ownerId,
                meterId: ctx.meterId,
                name: "Chuveiro ligado",
                referencePowerKw: 5.5,
                tolerancePercent: 2,
            },
        })
        await prismaHttpTest.alertTriggerEvent.createMany({
            data: [
                {
                    alertId: alert.id,
                    startedAt: new Date("2026-07-10T13:00:00Z"),
                    endedAt: new Date("2026-07-10T14:20:00Z"),
                    durationSeconds: 4800,
                    minPowerW: 5400,
                    maxPowerW: 5600,
                    avgPowerW: 5500,
                    sampleCount: 80,
                },
                {
                    alertId: alert.id,
                    startedAt: new Date("2026-06-10T13:00:00Z"),
                    endedAt: new Date("2026-06-10T13:10:00Z"),
                    durationSeconds: 600,
                    minPowerW: 5400,
                    maxPowerW: 5600,
                    avgPowerW: 5500,
                    sampleCount: 10,
                },
            ],
        })
        return ctx
    }

    it("lista só os episódios do período, com duração e faixa do alerta", async () => {
        const { token, propertyId } = await withEpisode()

        const created = await emit(token, freePeriod("ALERTS", propertyId, "CSV"))

        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({ type: "ALERTS", format: "CSV" })
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Relatório de alertas")
        expect(file).toContain("Episódios de disparo;1")
        expect(file).toContain("Tempo total em disparo;1 h 20 min")
        expect(file).toContain("Chuveiro ligado;5,50 kW ± 2,0%")
        expect(file.match(/Chuveiro ligado/g)).toHaveLength(1)
    })

    it("período sem episódios gera o arquivo com a nota, sem erro", async () => {
        const { token, propertyId } = await setupProperty()

        const created = await emit(token, freePeriod("ALERTS", propertyId, "CSV"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Episódios de disparo;0")
        expect(file).toContain("Nenhum episódio de disparo no período.")
    })

    it("gera um PDF válido", async () => {
        const { token, propertyId } = await withEpisode()

        const created = await emit(token, freePeriod("ALERTS", propertyId, "PDF"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body as Buffer
        expect(file.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })
})

describe("relatório de qualidade de energia", () => {
    it("traz mínimo, média e máximo por fase, e '-' para o que o medidor não fornece", async () => {
        const { token, propertyId, meterId } = await setupProperty()
        await prismaHttpTest.meterReading.createMany({
            data: [
                reading(meterId, "2026-07-10T13:00:00Z", {
                    avgVoltagePhaseA: 220,
                    avgVoltagePhaseB: 221,
                    avgPowerFactorPhaseA: 0.95,
                    avgFrequencyHz: 60,
                }),
                reading(meterId, "2026-07-10T13:01:00Z", {
                    avgVoltagePhaseA: 230,
                    avgVoltagePhaseB: 221,
                    avgPowerFactorPhaseA: 0.97,
                    avgFrequencyHz: 60.1,
                }),
            ],
        })

        const created = await emit(token, freePeriod("POWER_QUALITY", propertyId, "CSV"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Relatório de qualidade de energia")
        expect(file).toContain("Tensão (V);A;220;225;230")
        expect(file).toContain("Tensão (V);B;221;221;221")
        // Fase C e THD nunca reportados: ausência (-), não zero.
        expect(file).toContain("Tensão (V);C;-;-;-")
        expect(file).toContain("THD de tensão (%);A;-;-;-")
        expect(file).toContain("Fator de potência;A;0,95;0,96;0,97")
        expect(file).toContain("Frequência (Hz);-;60;60,05;60,1")
        expect(file).toContain("Dias com leituras;1")
    })

    it("período sem leituras gera o arquivo, sem erro", async () => {
        const { token, propertyId } = await setupProperty()

        const created = await emit(token, freePeriod("POWER_QUALITY", propertyId, "CSV"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Dias com leituras;0")
        expect(file).toContain("Tensão (V);A;-;-;-")
    })

    it("gera um PDF válido", async () => {
        const { token, propertyId, meterId } = await setupProperty()
        await prismaHttpTest.meterReading.create({
            data: reading(meterId, "2026-07-10T13:00:00Z", { avgVoltagePhaseA: 220 }),
        })

        const created = await emit(token, freePeriod("POWER_QUALITY", propertyId, "PDF"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body as Buffer
        expect(file.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })
})

describe("relatório de demanda", () => {
    const monthBody = (targetId: string, format: "PDF" | "CSV", targetType = "PROPERTY") => ({
        type: "DEMAND",
        targetType,
        targetId,
        format,
        month: "2026-07",
    })

    it("compara a demanda medida com a contratada e aponta a ultrapassagem", async () => {
        const { token, propertyId, meterId } = await setupProperty({ tariffGroup: "GROUP_A" })
        await prismaHttpTest.meterDemandRollup.createMany({
            data: [
                {
                    meterId,
                    periodStart: new Date("2026-07-01T03:00:00.000Z"),
                    post: "OFF_PEAK",
                    maxAvgPowerW: 120_000,
                    windowEndAt: new Date("2026-07-15T17:15:00.000Z"),
                },
                {
                    meterId,
                    periodStart: new Date("2026-07-01T03:00:00.000Z"),
                    post: "PEAK",
                    maxAvgPowerW: 80_000,
                    windowEndAt: new Date("2026-07-16T21:00:00.000Z"),
                },
            ],
        })

        const created = await emit(token, monthBody(propertyId, "CSV"))

        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({
            type: "DEMAND",
            fileName: "lumitrack-relatorio-demand-2026-07.csv",
        })
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Modalidade;Verde")
        // Verde: demanda única, comparada com o maior valor entre os postos.
        expect(file).toContain("Único;100;120;120;Ultrapassou;15/07/2026")
        expect(file).toContain("Postos com ultrapassagem;1")
    })

    it("mês sem janela medida mostra a demanda como ausente", async () => {
        const { token, propertyId } = await setupProperty({ tariffGroup: "GROUP_A" })

        const created = await emit(token, monthBody(propertyId, "CSV"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body.toString("utf8")
        expect(file).toContain("Único;100;-;-;-;-")
        expect(file).toContain("Postos com ultrapassagem;0")
    })

    it("gera um PDF válido", async () => {
        const { token, propertyId } = await setupProperty({ tariffGroup: "GROUP_A" })

        const created = await emit(token, monthBody(propertyId, "PDF"))

        expect(created.status).toBe(201)
        const file = (await download(token, created.body.data.id)).body as Buffer
        expect(file.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("rejeita propriedade do Grupo B com 422", async () => {
        const { token, propertyId } = await setupProperty({ tariffGroup: "GROUP_B" })

        const response = await emit(token, monthBody(propertyId, "CSV"))

        expect(response.status).toBe(422)
        expect(await prismaHttpTest.report.count()).toBe(0)
    })

    it("rejeita área, mesmo de propriedade do Grupo A, com 422", async () => {
        const { token, propertyId } = await setupProperty({ tariffGroup: "GROUP_A" })
        const area = await prismaHttpTest.area.create({ data: { propertyId, name: "Linha 1" } })
        await prismaHttpTest.meter.create({
            data: {
                name: "Medidor linha",
                targetType: "AREA",
                areaId: area.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "fabrica/linha",
            },
        })

        const response = await emit(token, monthBody(area.id, "CSV", "AREA"))

        expect(response.status).toBe(422)
    })
})

describe("validação do período por tipo", () => {
    it("alertas e qualidade exigem período livre; demanda exige o mês", async () => {
        const { token, propertyId } = await setupProperty({ tariffGroup: "GROUP_A" })
        const base = { targetType: "PROPERTY", targetId: propertyId, format: "CSV" }

        const alertsWithMonth = await emit(token, { ...base, type: "ALERTS", month: "2026-07" })
        const demandWithRange = await emit(token, {
            ...base,
            type: "DEMAND",
            from: "2026-07-01T03:00:00.000Z",
            to: "2026-08-01T03:00:00.000Z",
        })
        const qualityOver92 = await emit(token, {
            ...base,
            type: "POWER_QUALITY",
            from: "2026-01-01T03:00:00.000Z",
            to: "2026-06-01T03:00:00.000Z",
        })

        expect(alertsWithMonth.status).toBe(422)
        expect(demandWithRange.status).toBe(422)
        expect(qualityOver92.status).toBe(422)
    })

    it("não emite relatório de propriedade de outro usuário", async () => {
        const { propertyId } = await setupProperty()
        await request(app)
            .post("/api/users")
            .send({
                ...user,
                email: "maria@example.com",
                cpf: "310.037.856-38",
                firstName: "Maria",
            })
        const other = await request(app)
            .post("/api/auth/login")
            .send({ email: "maria@example.com", password: user.password, channel: "MOBILE" })

        const response = await emit(
            other.body.data.token as string,
            freePeriod("POWER_QUALITY", propertyId, "CSV"),
        )

        expect(response.status).toBe(403)
    })
})
