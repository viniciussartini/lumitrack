import { describe, it, expect } from "vitest"
import {
    INITIAL_SCHEDULE_FORM,
    MAX_RECIPIENTS,
    applyScheduleFrequency,
    applyScheduleType,
    buildScheduleInput,
    describePeriodicity,
    describeSchedule,
    selectUpcomingSchedules,
    formatNextRun,
    isScheduleFormFilled,
    parseRecipients,
    scheduleToFormState,
    validateScheduleForm,
    type ScheduleFormState,
} from "@/lib/reportSchedule"
import type { ReportSchedule } from "@/types/report.types"

const TARGET = {
    key: "PROPERTY:prop-1",
    targetType: "PROPERTY" as const,
    targetId: "prop-1",
    label: "Casa",
}

const state = (overrides: Partial<ScheduleFormState> = {}): ScheduleFormState => ({
    ...INITIAL_SCHEDULE_FORM,
    recipients: "financeiro@example.com",
    ...overrides,
})

const SCHEDULE: ReportSchedule = {
    id: "sch-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "CONSUMPTION",
    format: "CSV",
    frequency: "WEEKLY",
    sendDay: 1,
    recipients: ["a@example.com", "b@example.com"],
    active: true,
    nextRunAt: "2026-07-13T09:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
}

describe("parseRecipients", () => {
    it("separa por vírgula, ponto e vírgula e quebra de linha, e limpa o texto", () => {
        expect(parseRecipients(" A@x.com, b@x.com;c@x.com\nD@x.com ,, ")).toEqual([
            "a@x.com",
            "b@x.com",
            "c@x.com",
            "d@x.com",
        ])
    })

    it("remove repetidos e devolve vazio para campo em branco", () => {
        expect(parseRecipients("a@x.com, A@X.com")).toEqual(["a@x.com"])
        expect(parseRecipients("  ")).toEqual([])
    })
})

describe("applyScheduleType", () => {
    it("o relatório mensal fixa a frequência mensal e dá um dia do mês", () => {
        const result = applyScheduleType(
            state({ type: "CONSUMPTION", frequency: "DAILY", sendDay: "" }),
            "MONTHLY",
        )
        expect(result).toMatchObject({ type: "MONTHLY", frequency: "MONTHLY", sendDay: "1" })
    })

    it("o de consumo mantém a frequência escolhida", () => {
        expect(applyScheduleType(state(), "CONSUMPTION")).toMatchObject({
            type: "CONSUMPTION",
            frequency: "MONTHLY",
        })
    })
})

describe("applyScheduleFrequency", () => {
    it("diária limpa o dia", () => {
        expect(applyScheduleFrequency(state({ sendDay: "15" }), "DAILY").sendDay).toBe("")
    })

    it("semanal mantém um dia válido da semana e reinicia um fora de 1–7", () => {
        expect(applyScheduleFrequency(state({ sendDay: "3" }), "WEEKLY").sendDay).toBe("3")
        expect(applyScheduleFrequency(state({ sendDay: "20" }), "WEEKLY").sendDay).toBe("1")
    })

    it("voltar de diária para uma de mês dá o dia 1", () => {
        expect(
            applyScheduleFrequency(state({ frequency: "DAILY", sendDay: "" }), "ANNUAL"),
        ).toMatchObject({
            frequency: "ANNUAL",
            sendDay: "1",
        })
    })
})

describe("validateScheduleForm", () => {
    it("aceita um rascunho válido", () => {
        expect(validateScheduleForm(state())).toBeNull()
    })

    it("aponta o e-mail inválido", () => {
        expect(validateScheduleForm(state({ recipients: "ok@x.com, sem-arroba" }))).toBe(
            "E-mail inválido: sem-arroba",
        )
    })

    it("respeita o teto de destinatários", () => {
        const many = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@x.com`).join(",")
        expect(validateScheduleForm(state({ recipients: many(MAX_RECIPIENTS) }))).toBeNull()
        expect(validateScheduleForm(state({ recipients: many(MAX_RECIPIENTS + 1) }))).toMatch(
            /No máximo 10/,
        )
    })

    it("valida o dia conforme a frequência", () => {
        expect(validateScheduleForm(state({ frequency: "WEEKLY", sendDay: "8" }))).toMatch(/1 e 7/)
        expect(validateScheduleForm(state({ sendDay: "32" }))).toMatch(/1 e 31/)
        expect(validateScheduleForm(state({ sendDay: "" }))).toMatch(/1 e 31/)
        expect(validateScheduleForm(state({ sendDay: "2.5" }))).toMatch(/1 e 31/)
        expect(validateScheduleForm(state({ frequency: "DAILY", sendDay: "" }))).toBeNull()
    })
})

describe("isScheduleFormFilled", () => {
    it("exige ao menos um destinatário", () => {
        expect(isScheduleFormFilled(state({ recipients: " ,; " }))).toBe(false)
        expect(isScheduleFormFilled(state())).toBe(true)
    })
})

describe("buildScheduleInput", () => {
    it("monta o corpo, com dia numérico e destinatários normalizados", () => {
        expect(
            buildScheduleInput(state({ sendDay: "5", recipients: "A@x.com; b@x.com" }), TARGET),
        ).toEqual({
            targetType: "PROPERTY",
            targetId: "prop-1",
            type: "MONTHLY",
            format: "PDF",
            frequency: "MONTHLY",
            sendDay: 5,
            recipients: ["a@x.com", "b@x.com"],
            active: true,
        })
    })

    it("diária manda dia nulo", () => {
        expect(
            buildScheduleInput(
                state({ type: "CONSUMPTION", frequency: "DAILY", sendDay: "" }),
                TARGET,
            ).sendDay,
        ).toBeNull()
    })
})

describe("scheduleToFormState", () => {
    it("volta ao rascunho, juntando os destinatários", () => {
        expect(scheduleToFormState(SCHEDULE)).toEqual({
            type: "CONSUMPTION",
            frequency: "WEEKLY",
            sendDay: "1",
            recipients: "a@example.com, b@example.com",
            format: "CSV",
            active: true,
        })
    })
})

describe("describePeriodicity", () => {
    it.each([
        ["DAILY", null, "Diária"],
        ["WEEKLY", 1, "Semanal · segunda-feira"],
        ["WEEKLY", 7, "Semanal · domingo"],
        ["MONTHLY", 5, "Mensal · dia 5"],
        ["QUARTERLY", 5, "Trimestral · dia 5 (jan, abr, jul, out)"],
        ["SEMIANNUAL", 5, "Semestral · dia 5 (jan, jul)"],
        ["ANNUAL", 5, "Anual · dia 5 de janeiro"],
    ] as const)("%s dia %s → %s", (frequency, sendDay, expected) => {
        expect(describePeriodicity(frequency, sendDay)).toBe(expected)
    })
})

describe("formatNextRun / describeSchedule", () => {
    it("mostra a data e a hora no horário de São Paulo", () => {
        expect(formatNextRun("2026-07-13T09:00:00.000Z")).toBe("13/07/2026 às 06:00")
    })

    it("monta título, meta e próxima execução; pausada não tem próxima execução", () => {
        const labels = new Map([["PROPERTY:prop-1", "Casa"]])

        expect(describeSchedule(SCHEDULE, labels)).toEqual({
            title: "Consumo · Casa",
            meta: "Semanal · segunda-feira · CSV · a@example.com, b@example.com",
            nextRun: "13/07/2026 às 06:00",
        })
        expect(
            describeSchedule({ ...SCHEDULE, active: false, nextRunAt: null }, labels).nextRun,
        ).toBe("")
        expect(describeSchedule({ ...SCHEDULE, targetId: "sumiu" }, labels).title).toBe(
            "Consumo · Alvo removido",
        )
    })
})

describe("selectUpcomingSchedules", () => {
    const NOW = new Date("2026-07-10T12:00:00.000Z")
    const at = (id: string, nextRunAt: string | null, active = true): ReportSchedule => ({
        ...SCHEDULE,
        id,
        active,
        nextRunAt,
    })

    it("mantém só as ativas com envio em até 15 dias, da mais próxima à mais distante", () => {
        const result = selectUpcomingSchedules(
            [
                at("longe", "2026-07-26T09:00:00.000Z"),
                at("dia-15", "2026-07-25T12:00:00.000Z"),
                at("amanha", "2026-07-11T09:00:00.000Z"),
                at("hoje", "2026-07-10T20:00:00.000Z"),
            ],
            NOW,
        )

        expect(result.map((item) => item.id)).toEqual(["hoje", "amanha", "dia-15"])
    })

    it("ignora as pausadas e as sem próxima execução", () => {
        const result = selectUpcomingSchedules(
            [at("pausada", "2026-07-11T09:00:00.000Z", false), at("sem-data", null)],
            NOW,
        )

        expect(result).toEqual([])
    })

    it("mantém a vencida que ainda não saiu (o servidor a envia na próxima passada)", () => {
        const result = selectUpcomingSchedules([at("atrasada", "2026-07-10T09:00:00.000Z")], NOW)

        expect(result.map((item) => item.id)).toEqual(["atrasada"])
    })
})
