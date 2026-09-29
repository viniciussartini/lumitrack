import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { createReportService } from "@/modules/report/report.routes.js"
import { ReportScheduleRepository } from "@/modules/report-schedule/report-schedule.repository.js"
import {
    MAX_RUN_ATTEMPTS,
    ReportScheduleRunner,
    type SendScheduledReportEmailFn,
} from "@/modules/report-schedule/ReportScheduleRunner.js"

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

// 06:00 em São Paulo = 09:00 UTC
const at = (isoLocal: string, time = "09:00") => new Date(`${isoLocal}T${time}:00.000Z`)

async function setup() {
    await request(app).post("/api/users").send(user)
    const login = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password, channel: "MOBILE" })
    const token = login.body.data.token as string
    const distributor = await createTestDistributor(prismaHttpTest)
    const property = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa", distributorId: distributor.id, electricalSystem: "TRIPHASIC" })
    const propertyId = property.body.data.id as string
    await prismaHttpTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "casa/geral",
        },
    })
    const owner = await prismaHttpTest.user.findFirstOrThrow({ where: { email: user.email } })
    return { userId: owner.id, propertyId }
}

async function createSchedule(
    ids: { userId: string; propertyId: string },
    override: Record<string, unknown> = {},
) {
    return prismaHttpTest.reportSchedule.create({
        data: {
            userId: ids.userId,
            targetType: "PROPERTY",
            targetId: ids.propertyId,
            type: "CONSUMPTION",
            format: "CSV",
            frequency: "MONTHLY",
            sendDay: 31,
            recipients: ["financeiro@example.com", "sindico@example.com"],
            nextRunAt: at("2026-03-31"),
            ...override,
        },
    })
}

function buildRunner(now: Date, sendEmail: SendScheduledReportEmailFn) {
    return new ReportScheduleRunner(
        new ReportScheduleRepository(prismaHttpTest),
        createReportService(prismaHttpTest),
        sendEmail,
        { record: vi.fn().mockResolvedValue(undefined) },
        () => now,
    )
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

describe("ReportScheduleRunner", () => {
    it("envia o anexo, grava no histórico como agendado e avança a próxima execução", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids)
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2026-03-31", "09:05"), sendEmail).runDue()

        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(sendEmail.mock.calls[0]![0]).toMatchObject({
            recipients: ["financeiro@example.com", "sindico@example.com"],
            contentType: "text/csv; charset=utf-8",
        })
        const reports = await prismaHttpTest.report.findMany({ where: { userId: ids.userId } })
        expect(reports).toHaveLength(1)
        expect(reports[0]).toMatchObject({ origin: "SCHEDULED", type: "CONSUMPTION" })
        const updated = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        // Abril tem 30 dias: o dia 31 cai no último dia (30/04).
        expect(updated.nextRunAt).toEqual(at("2026-04-30"))
    })

    it("período do consumo termina à meia-noite local do dia do envio", async () => {
        const ids = await setup()
        await createSchedule(ids)

        await buildRunner(at("2026-03-31", "09:05"), vi.fn().mockResolvedValue(undefined)).runDue()

        const report = await prismaHttpTest.report.findFirstOrThrow({
            where: { userId: ids.userId },
        })
        expect(report.periodStart).toEqual(at("2026-02-28", "03:00"))
        expect(report.periodEnd).toEqual(at("2026-03-31", "03:00"))
    })

    it("não duplica o envio ao repetir a passada (reinício do servidor)", async () => {
        const ids = await setup()
        await createSchedule(ids)
        const sendEmail = vi.fn().mockResolvedValue(undefined)
        const now = at("2026-03-31", "09:05")

        await buildRunner(now, sendEmail).runDue()
        await buildRunner(now, sendEmail).runDue()

        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(await prismaHttpTest.report.count()).toBe(1)
    })

    it("dia 31 em fevereiro envia em 28/02, e em 29/02 no ano bissexto", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids, { nextRunAt: at("2028-01-31") })

        await buildRunner(at("2028-01-31", "09:05"), vi.fn().mockResolvedValue(undefined)).runDue()

        const updated = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(updated.nextRunAt).toEqual(at("2028-02-29"))
    })

    it("recupera uma execução perdida com o servidor fora do ar, enviando uma única vez", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids, {
            frequency: "DAILY",
            sendDay: null,
            nextRunAt: at("2026-03-10"),
        })
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2026-03-15", "12:00"), sendEmail).runDue()

        expect(sendEmail).toHaveBeenCalledTimes(1)
        const updated = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(updated.nextRunAt).toEqual(at("2026-03-16"))
    })

    it("falha de SMTP não grava nada, mantém a execução vencida e a próxima passada reenvia", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids)
        const now = at("2026-03-31", "09:05")

        await buildRunner(now, vi.fn().mockRejectedValue(new Error("smtp fora do ar"))).runDue()

        const failed = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(failed.nextRunAt).toEqual(at("2026-03-31"))
        expect(failed.failedAttempts).toBe(1)
        expect(await prismaHttpTest.report.count()).toBe(0)

        const sendEmail = vi.fn().mockResolvedValue(undefined)
        await buildRunner(at("2026-03-31", "09:20"), sendEmail).runDue()

        expect(sendEmail).toHaveBeenCalledTimes(1)
        const done = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(done.failedAttempts).toBe(0)
        expect(done.nextRunAt).toEqual(at("2026-04-30"))
    })

    it("descarta a execução depois de esgotar as tentativas e segue para a próxima", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids)
        const failing = vi.fn().mockRejectedValue(new Error("smtp fora do ar"))

        for (let attempt = 0; attempt < MAX_RUN_ATTEMPTS; attempt++) {
            await buildRunner(at("2026-03-31", "09:05"), failing).runDue()
        }

        const updated = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(updated.nextRunAt).toEqual(at("2026-04-30"))
        expect(updated.failedAttempts).toBe(0)
        expect(updated.active).toBe(true)
        expect(await prismaHttpTest.report.count()).toBe(0)
    })

    it("pausa a configuração cujo alvo foi excluído, sem enviar nem derrubar as demais", async () => {
        const ids = await setup()
        const orphan = await createSchedule(ids, {
            targetId: "00000000-0000-4000-8000-000000000000",
        })
        const healthy = await createSchedule(ids)
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2026-03-31", "09:05"), sendEmail).runDue()

        const paused = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: orphan.id },
        })
        expect(paused).toMatchObject({ active: false, nextRunAt: null })
        expect(sendEmail).toHaveBeenCalledTimes(1)
        const sent = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: healthy.id },
        })
        expect(sent.nextRunAt).toEqual(at("2026-04-30"))
    })

    it("não executa configurações pausadas nem ainda não vencidas", async () => {
        const ids = await setup()
        await createSchedule(ids, { active: false, nextRunAt: null })
        await createSchedule(ids, { nextRunAt: at("2026-04-30") })
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2026-03-31", "09:05"), sendEmail).runDue()

        expect(sendEmail).not.toHaveBeenCalled()
    })

    it("inicializa a próxima execução de configuração sem ela, sem enviar nada", async () => {
        const ids = await setup()
        const schedule = await createSchedule(ids, { nextRunAt: null })
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2026-03-10", "12:00"), sendEmail).runDue()

        expect(sendEmail).not.toHaveBeenCalled()
        const updated = await prismaHttpTest.reportSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
        })
        expect(updated.nextRunAt).toEqual(at("2026-03-31"))
    })

    it("anual cobre 12 meses de consumo dentro do teto de período", async () => {
        const ids = await setup()
        await createSchedule(ids, {
            frequency: "ANNUAL",
            sendDay: 1,
            format: "PDF",
            nextRunAt: at("2027-01-01"),
        })
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(at("2027-01-01", "09:05"), sendEmail).runDue()

        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(sendEmail.mock.calls[0]![0].contentType).toBe("application/pdf")
        const report = await prismaHttpTest.report.findFirstOrThrow({
            where: { userId: ids.userId },
        })
        expect(report.periodStart).toEqual(at("2026-01-01", "03:00"))
    })
})
