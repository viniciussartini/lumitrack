import { describe, it, expect, beforeEach, vi } from "vitest"

const { warn, error } = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }))

vi.mock("@/shared/logger/logger.js", () => ({
    logger: { child: () => ({ warn, error, info: vi.fn() }) },
}))

import {
    MAX_RUN_ATTEMPTS,
    ReportScheduleRunner,
} from "@/modules/report-schedule/ReportScheduleRunner.js"
import type {
    ReportScheduleRecord,
    ReportScheduleRepository,
} from "@/modules/report-schedule/report-schedule.repository.js"
import { UnsupportedReportTargetError } from "@/modules/report/report.errors.js"
import { ForbiddenError, ValidationError } from "@/shared/errors/AppError.js"

const ADDRESS = "financeiro@example.com"

const SCHEDULE: ReportScheduleRecord = {
    id: "sch-1",
    userId: "user-1",
    targetType: "PROPERTY",
    targetId: "8f3c1a52-6c1e-4d0a-9d55-3f0f0b1f7a10",
    type: "CONSUMPTION",
    format: "CSV",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: [ADDRESS],
    active: true,
    nextRunAt: new Date("2026-03-05T09:00:00.000Z"),
    failedAttempts: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

const RENDERED = {
    period: {
        from: new Date("2026-02-05T03:00:00.000Z"),
        to: new Date("2026-03-05T03:00:00.000Z"),
    },
    content: Buffer.from("x"),
    contentType: "text/csv",
    fileName: "a.csv",
}

function buildRepository(failedAttempts: number) {
    return {
        findDue: vi.fn().mockResolvedValue([SCHEDULE]),
        incrementFailedAttempts: vi.fn().mockResolvedValue(failedAttempts),
        skipRun: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        completeRun: vi.fn().mockResolvedValue(true),
    }
}

function buildRunner(
    repository: ReturnType<typeof buildRepository>,
    sendEmail: () => Promise<void>,
    render: () => Promise<typeof RENDERED> = () => Promise.resolve(RENDERED),
) {
    return new ReportScheduleRunner(
        repository as unknown as ReportScheduleRepository,
        { render },
        sendEmail,
        { record: vi.fn() },
        () => new Date("2026-03-05T09:05:00.000Z"),
    )
}

// Tudo que foi para o log, serializado: o teste procura o endereço em qualquer
// lugar. `JSON.stringify` descarta a mensagem de um `Error`, que é justamente
// onde um servidor SMTP repete o endereço; por isso ela entra explicitamente.
const logged = (): string =>
    JSON.stringify([...warn.mock.calls, ...error.mock.calls], (_key, value: unknown) =>
        value instanceof Error ? { name: value.name, message: value.message } : value,
    )

// Mensagem típica de um servidor SMTP, que repete o endereço do destinatário.
const smtpRejection = () =>
    Promise.reject(
        Object.assign(new Error(`550 5.1.1 <${ADDRESS}>: Recipient address rejected`), {
            code: "EENVELOPE",
        }),
    )

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ReportScheduleRunner — o endereço do destinatário nunca vai para o log", () => {
    it("na falha que será tentada de novo", async () => {
        await buildRunner(buildRepository(1), smtpRejection).runDue()

        expect(warn).toHaveBeenCalled()
        expect(logged()).not.toContain("example.com")
        expect(logged()).toContain("EENVELOPE")
    })

    it("no descarte depois de esgotar as tentativas", async () => {
        const repository = buildRepository(MAX_RUN_ATTEMPTS)

        await buildRunner(repository, smtpRejection).runDue()

        expect(repository.skipRun).toHaveBeenCalled()
        expect(error).toHaveBeenCalled()
        expect(logged()).not.toContain("example.com")
    })

    it("quando o erro é de outro tipo e carrega o endereço na mensagem", async () => {
        const repository = buildRepository(1)

        await buildRunner(repository, () =>
            Promise.reject(new Error(`falhou para ${ADDRESS}`)),
        ).runDue()

        expect(logged()).not.toContain("example.com")
    })
})

describe("ReportScheduleRunner — alvo de outro dono", () => {
    it("pausa a configuração quando a posse do alvo não confere, sem enviar", async () => {
        const repository = buildRepository(0)
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(repository, sendEmail, () =>
            Promise.reject(new ForbiddenError("Acesso negado")),
        ).runDue()

        expect(repository.pause).toHaveBeenCalledWith(SCHEDULE.id)
        expect(sendEmail).not.toHaveBeenCalled()
        expect(repository.incrementFailedAttempts).not.toHaveBeenCalled()
    })
})

describe("ReportScheduleRunner — falhas que não se resolvem tentando de novo", () => {
    it("descarta a execução de uma vez quando o relatório é grande demais, sem repetir a geração", async () => {
        const repository = buildRepository(0)
        const render = vi.fn().mockRejectedValue(new ValidationError("Há mais de 1000 episódios"))
        const sendEmail = vi.fn().mockResolvedValue(undefined)

        await buildRunner(repository, sendEmail, render).runDue()

        expect(render).toHaveBeenCalledTimes(1)
        expect(repository.skipRun).toHaveBeenCalledWith(
            SCHEDULE.id,
            SCHEDULE.nextRunAt,
            expect.any(Date),
        )
        expect(repository.incrementFailedAttempts).not.toHaveBeenCalled()
        expect(repository.pause).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalled()
    })

    it("pausa, e não só descarta, quando o alvo deixou de comportar o tipo", async () => {
        const repository = buildRepository(0)

        await buildRunner(repository, vi.fn(), () =>
            Promise.reject(new UnsupportedReportTargetError("Grupo A")),
        ).runDue()

        expect(repository.pause).toHaveBeenCalledWith(SCHEDULE.id)
        expect(repository.skipRun).not.toHaveBeenCalled()
    })

    it("falha de envio continua sendo tentada de novo", async () => {
        const repository = buildRepository(1)

        await buildRunner(repository, () => Promise.reject(new Error("smtp"))).runDue()

        expect(repository.incrementFailedAttempts).toHaveBeenCalledWith(SCHEDULE.id)
        expect(repository.skipRun).not.toHaveBeenCalled()
    })
})
