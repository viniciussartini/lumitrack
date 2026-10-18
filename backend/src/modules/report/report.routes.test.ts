import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { MAX_MANUAL_REPORTS_PER_USER } from "@/modules/report/report.service.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { waitFor } from "@/shared/test/waitFor.js"
import {
    createTestDistributor,
    createTestTariffFlagConfig,
} from "@/shared/test/distributorFixture.js"

const app = createApp({ prismaClient: prismaHttpTest })

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

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return {
        token: loginRes.body.data.token as string,
        userId: loginRes.body.data.user?.id as string | undefined,
    }
}

function reading(meterId: string, minuteStart: string, kwhConsumed: number) {
    return {
        meterId,
        minuteStart: new Date(minuteStart),
        kwhConsumed,
        avgVoltage: 220,
        avgCurrent: 5,
        avgPowerW: 1100,
        avgPowerFactor: 1,
        sampleCount: 60,
        secondsCovered: 60,
    }
}

// Propriedade com medidor e leituras em junho e julho de 2026 (horário 13h UTC
// = 10h em São Paulo, bem longe da virada do dia), mais duas áreas: uma com
// medidor e leitura, outra sem medidor.
async function setupProperty(user = validUser) {
    const { token } = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)
    await createTestTariffFlagConfig(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Casa Jardins",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
        })
    const propertyId = propRes.body.data.id as string

    const meter = await prismaHttpTest.meter.create({
        data: {
            name: "Medidor geral",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/geral",
        },
    })
    await prismaHttpTest.meterReading.createMany({
        data: [
            reading(meter.id, "2026-06-15T13:00:00Z", 15),
            reading(meter.id, "2026-07-01T13:00:00Z", 10),
            reading(meter.id, "2026-07-02T13:00:00Z", 20),
        ],
    })

    const sala = await prismaHttpTest.area.create({ data: { propertyId, name: "Sala" } })
    const garagem = await prismaHttpTest.area.create({ data: { propertyId, name: "Garagem" } })
    const salaMeter = await prismaHttpTest.meter.create({
        data: {
            name: "Medidor sala",
            targetType: "AREA",
            areaId: sala.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/sala",
        },
    })
    await prismaHttpTest.meterReading.create({
        data: reading(salaMeter.id, "2026-07-01T13:00:00Z", 12),
    })

    return {
        token,
        propertyId,
        salaId: sala.id,
        garagemId: garagem.id,
        distributorId: distributor.id,
    }
}

const monthly = (targetId: string, format: "PDF" | "CSV", targetType = "PROPERTY") => ({
    type: "MONTHLY",
    targetType,
    targetId,
    format,
    month: "2026-07",
})

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("POST /api/reports", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app)
            .post("/api/reports")
            .send(monthly("00000000-0000-4000-8000-000000000000", "PDF"))
        expect(response.status).toBe(401)
    })

    it("emite o relatório mensal em PDF e devolve só metadados", async () => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "PDF"))

        expect(response.status).toBe(201)
        expect(response.body.data).toMatchObject({
            type: "MONTHLY",
            format: "PDF",
            origin: "MANUAL",
            targetType: "PROPERTY",
            targetId: propertyId,
            fileName: "lumitrack-relatorio-monthly-2026-07.pdf",
        })
        expect(response.body.data.sizeBytes).toBeGreaterThan(0)
        expect(response.body.data.content).toBeUndefined()
    })

    it("grava o relatório imutável e o oferece para download", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "PDF"))

        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)
            .buffer(true)
            .parse((res, cb) => {
                const chunks: Buffer[] = []
                res.on("data", (c: Buffer) => chunks.push(c))
                res.on("end", () => cb(null, Buffer.concat(chunks)))
            })

        expect(download.status).toBe(200)
        expect(download.headers["content-type"]).toContain("application/pdf")
        expect(download.headers["content-disposition"]).toBe(
            'attachment; filename="lumitrack-relatorio-monthly-2026-07.pdf"',
        )
        expect((download.body as Buffer).subarray(0, 4).toString("latin1")).toBe("%PDF")
    })

    it("o relatório mensal em CSV traz totais, custo, variação e consumo por área", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))

        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)

        expect(download.headers["content-type"]).toContain("text/csv")
        const text = download.text
        expect(text).toContain("Consumo total (kWh);30")
        expect(text).toContain("Média diária (kWh);0,968")
        expect(text).toContain("Dia de maior consumo;02/07/2026")
        expect(text).toMatch(/Custo do mês \(R\$\);\d/)
        expect(text).toContain("Consumo do mês anterior (kWh);15")
        expect(text).toContain("Variação sobre o mês anterior (%);100")
        expect(text).toContain("01/07/2026;10;")
        // Área com medidor entra ordenada por consumo; área sem medidor aparece como "-".
        expect(text).toContain("Sala;12;40")
        expect(text).toContain("Garagem;-;-")
        expect(text.indexOf("Sala;12")).toBeLessThan(text.indexOf("Garagem;-"))
    })

    it("o relatório de consumo cobre um período livre e não traz o bloco mensal", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send({
                type: "CONSUMPTION",
                targetType: "PROPERTY",
                targetId: propertyId,
                format: "CSV",
                from: "2026-07-01T03:00:00.000Z",
                to: "2026-07-02T03:00:00.000Z",
            })

        expect(created.status).toBe(201)
        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)

        expect(download.text).toContain("Consumo total (kWh);10")
        expect(download.text).not.toContain("02/07/2026;20")
        expect(download.text).not.toContain("Custo do mês")
    })

    it("emite relatório de período sem nenhuma leitura, com '-' onde não há dado", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...monthly(propertyId, "CSV"), month: "2025-01" })

        expect(created.status).toBe(201)
        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)

        expect(download.text).toContain("Consumo total (kWh);0")
        expect(download.text).toContain("Dia de maior consumo;-")
        expect(download.text).toContain("Variação sobre o mês anterior (%);-")
    })

    it("relatório de dispositivo não traz quebra por filhos", async () => {
        const { token, salaId } = await setupProperty()
        const device = await prismaHttpTest.device.create({ data: { areaId: salaId, name: "TV" } })
        const meter = await prismaHttpTest.meter.create({
            data: {
                name: "Medidor TV",
                targetType: "DEVICE",
                deviceId: device.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "casa/tv",
            },
        })
        await prismaHttpTest.meterReading.create({
            data: reading(meter.id, "2026-07-01T13:00:00Z", 1),
        })

        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(device.id, "CSV", "DEVICE"))

        expect(created.status).toBe(201)
        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)
        expect(download.text).toContain("Dispositivo;TV")
        expect(download.text).not.toContain("Participação")
    })

    it("sem custo calculável para sub-nível do Grupo A, o relatório sai com '-' em vez de falhar", async () => {
        const { token, distributorId } = await setupProperty()
        const user = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        const groupA = await prismaHttpTest.property.create({
            data: {
                userId: user.id,
                distributorId,
                name: "Fábrica",
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                billingClass: null,
            },
        })
        const area = await prismaHttpTest.area.create({
            data: { propertyId: groupA.id, name: "Linha 1" },
        })
        const meter = await prismaHttpTest.meter.create({
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
        await prismaHttpTest.meterReading.create({
            data: reading(meter.id, "2026-07-01T13:00:00Z", 5),
        })

        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(area.id, "CSV", "AREA"))

        expect(created.status).toBe(201)
        const download = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${token}`)
        expect(download.text).toContain("Custo do mês (R$);-")
        expect(download.text).toContain("Enquadramento;Grupo A · A4")
    })

    it("registra a emissão na auditoria, sem o conteúdo", async () => {
        const { token, propertyId } = await setupProperty()

        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))

        // A auditoria é gravada depois da resposta — ver waitFor.
        const entry = await waitFor(() =>
            prismaHttpTest.auditLog.findFirst({ where: { action: "REPORT_GENERATE" } }),
        )
        expect(entry.resourceId).toBe(created.body.data.id)
        expect(entry.outcome).toBe("SUCCESS")
        expect(JSON.stringify(entry.metadata)).not.toContain("Consumo total")
    })

    it("retorna 403 para propriedade de outro usuário", async () => {
        const { propertyId } = await setupProperty(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${tokenB}`)
            .send(monthly(propertyId, "PDF"))

        expect(response.status).toBe(403)
        expect(await prismaHttpTest.report.count()).toBe(0)
    })

    it("retorna 404 quando o alvo não tem medidor vinculado", async () => {
        const { token, garagemId } = await setupProperty()

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(garagemId, "PDF", "AREA"))

        expect(response.status).toBe(404)
        expect(await prismaHttpTest.report.count()).toBe(0)
    })

    it.each([
        ["tipo sem gerador", { type: "DEMAND" }],
        ["formato desconhecido", { format: "XLSX" }],
        ["mês malformado", { month: "07/2026" }],
        ["alvo inválido", { targetId: "nao-e-uuid" }],
    ])("retorna 422 para %s", async (_label, override) => {
        const { token, propertyId } = await setupProperty()

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...monthly(propertyId, "PDF"), ...override })

        expect(response.status).toBe(422)
    })
})

describe("GET /api/reports/:id/download", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get(
            "/api/reports/00000000-0000-4000-8000-000000000000/download",
        )
        expect(response.status).toBe(401)
    })

    it("retorna 404 para relatório de outro usuário, igual a um inexistente", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const foreign = await request(app)
            .get(`/api/reports/${created.body.data.id}/download`)
            .set("Authorization", `Bearer ${tokenB}`)
        const missing = await request(app)
            .get("/api/reports/00000000-0000-4000-8000-000000000000/download")
            .set("Authorization", `Bearer ${tokenB}`)

        expect(foreign.status).toBe(404)
        expect(missing.status).toBe(404)
        expect(foreign.body).toEqual(missing.body)
    })

    it("retorna 422 para id malformado", async () => {
        const { token } = await setupProperty()

        const response = await request(app)
            .get("/api/reports/nao-e-uuid/download")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

describe("GET /api/reports", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).get("/api/reports")
        expect(response.status).toBe(401)
    })

    it("lista só os relatórios do usuário, mais recentes primeiro, sem o conteúdo", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const { token: tokenB, propertyId: propertyB } = await setupProperty(anotherUser)
        const first = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))
        const second = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "PDF"))
        await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${tokenB}`)
            .send(monthly(propertyB, "CSV"))

        const response = await request(app)
            .get("/api/reports")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.total).toBe(2)
        expect(response.body.data.items.map((r: { id: string }) => r.id)).toEqual([
            second.body.data.id,
            first.body.data.id,
        ])
        expect(response.body.data.items[0].content).toBeUndefined()
        expect(response.body.data.items[0].fileName).toBe("lumitrack-relatorio-monthly-2026-07.pdf")
    })

    it("pagina o histórico", async () => {
        const { token, propertyId } = await setupProperty()
        for (let i = 0; i < 3; i++) {
            await request(app)
                .post("/api/reports")
                .set("Authorization", `Bearer ${token}`)
                .send(monthly(propertyId, "CSV"))
        }

        const response = await request(app)
            .get("/api/reports?page=2&pageSize=2")
            .set("Authorization", `Bearer ${token}`)

        expect(response.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 })
        expect(response.body.data.items).toHaveLength(1)
    })

    it("retorna 200 com lista vazia quando não há relatórios", async () => {
        const { token } = await setupProperty()

        const response = await request(app)
            .get("/api/reports")
            .set("Authorization", `Bearer ${token}`)

        expect(response.body.data).toMatchObject({ items: [], total: 0 })
    })

    it("retorna 422 para paginação inválida", async () => {
        const { token } = await setupProperty()

        const response = await request(app)
            .get("/api/reports?pageSize=1000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(422)
    })
})

describe("DELETE /api/reports/:id", () => {
    it("retorna 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/reports/00000000-0000-4000-8000-000000000000",
        )
        expect(response.status).toBe(401)
    })

    it("exclui o relatório e o arquivo, e o download passa a dar 404", async () => {
        const { token, propertyId } = await setupProperty()
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))
        const id = created.body.data.id as string

        const response = await request(app)
            .delete(`/api/reports/${id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)
        expect(await prismaHttpTest.report.count({ where: { id } })).toBe(0)
        const download = await request(app)
            .get(`/api/reports/${id}/download`)
            .set("Authorization", `Bearer ${token}`)
        expect(download.status).toBe(404)
    })

    it("retorna 404 e não exclui relatório de outro usuário", async () => {
        const { token, propertyId } = await setupProperty(validUser)
        const created = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))
        const { token: tokenB } = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/reports/${created.body.data.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(404)
        expect(await prismaHttpTest.report.count()).toBe(1)
    })

    it("retorna 404 para id inexistente e 422 para id malformado", async () => {
        const { token } = await setupProperty()

        const missing = await request(app)
            .delete("/api/reports/00000000-0000-4000-8000-000000000000")
            .set("Authorization", `Bearer ${token}`)
        const malformed = await request(app)
            .delete("/api/reports/nao-e-uuid")
            .set("Authorization", `Bearer ${token}`)

        expect(missing.status).toBe(404)
        expect(malformed.status).toBe(422)
    })
})

describe("teto de relatórios guardados", () => {
    async function fillHistory(userId: string, propertyId: string, origin: "MANUAL" | "SCHEDULED") {
        await prismaHttpTest.report.createMany({
            data: Array.from({ length: MAX_MANUAL_REPORTS_PER_USER }, (_, i) => ({
                userId,
                targetType: "PROPERTY" as const,
                targetId: propertyId,
                type: "MONTHLY" as const,
                format: "CSV" as const,
                origin,
                periodStart: new Date("2026-06-01T03:00:00.000Z"),
                periodEnd: new Date("2026-07-01T03:00:00.000Z"),
                fileName: `r-${i}.csv`,
                content: new Uint8Array([1]),
                sizeBytes: 1,
            })),
        })
    }

    it("recusa um novo relatório manual quando o histórico manual está cheio, sem gravar", async () => {
        const { token, propertyId } = await setupProperty()
        const owner = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        await fillHistory(owner.id, propertyId, "MANUAL")

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))

        expect(response.status).toBe(422)
        expect(await prismaHttpTest.report.count()).toBe(MAX_MANUAL_REPORTS_PER_USER)
    })

    it("excluir um relatório libera espaço para outro", async () => {
        const { token, propertyId } = await setupProperty()
        const owner = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        await fillHistory(owner.id, propertyId, "MANUAL")
        const one = await prismaHttpTest.report.findFirstOrThrow({ where: { userId: owner.id } })
        await prismaHttpTest.report.delete({ where: { id: one.id } })

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))

        expect(response.status).toBe(201)
    })

    it("os relatórios agendados não entram na conta do teto", async () => {
        const { token, propertyId } = await setupProperty()
        const owner = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        await fillHistory(owner.id, propertyId, "SCHEDULED")

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${token}`)
            .send(monthly(propertyId, "CSV"))

        expect(response.status).toBe(201)
    })

    it("o teto é de cada usuário", async () => {
        const first = await setupProperty(validUser)
        const owner = await prismaHttpTest.user.findFirstOrThrow({
            where: { email: validUser.email },
        })
        await fillHistory(owner.id, first.propertyId, "MANUAL")
        const second = await setupProperty(anotherUser)

        const response = await request(app)
            .post("/api/reports")
            .set("Authorization", `Bearer ${second.token}`)
            .send(monthly(second.propertyId, "CSV"))

        expect(response.status).toBe(201)
    })
})
