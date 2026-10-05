import { describe, it, expect, vi } from "vitest"
import { GoalConsumptionReader } from "@/modules/goal/goal-consumption.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// 15/06/2026 12:00 em São Paulo.
const JUNE_2026 = new Date("2026-06-15T15:00:00.000Z")
const PROPERTY = "3f2b8c1e-9d4a-4c6e-8f21-0a1b2c3d4e5f"

// O balde mensal chega como a hora de parede de São Paulo lida como UTC.
const bucket = (year: number, month: number, costBrl: number) => ({
    bucketStart: new Date(Date.UTC(year, month, 1)),
    kwhConsumed: 100,
    costBrl,
    avgPowerW: 500,
})

const listResult = (items: ReturnType<typeof bucket>[]) => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 12,
    granularity: "month" as const,
})

const buildReader = (list: ConsumptionService["list"]) =>
    new GoalConsumptionReader(
        {} as MeterRepository,
        {} as ConsumptionRepository,
        { list } as Pick<ConsumptionService, "list">,
    )

describe("GoalConsumptionReader — custo (R$)", () => {
    it("lê o custo de cada mês do cálculo de consumo, por ano e mês", async () => {
        const list = vi
            .fn()
            .mockResolvedValue(listResult([bucket(2026, 0, 310.5), bucket(2026, 2, 280)]))

        const monthly = await buildReader(list).monthlyValues(
            "user-1",
            PROPERTY,
            2026,
            "BRL",
            JUNE_2026,
        )

        const months = monthly.forYear(2026)
        expect(months[0]).toBe(310.5)
        expect(months[1]).toBeNull()
        expect(months[2]).toBe(280)
    })

    it("pede ao cálculo de consumo a propriedade, por mês, em ordem, com o dono da meta", async () => {
        const list = vi.fn().mockResolvedValue(listResult([]))

        await buildReader(list).monthlyValues("user-1", PROPERTY, 2025, "BRL", JUNE_2026)

        expect(list).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                targetType: "PROPERTY",
                targetId: PROPERTY,
                granularity: "month",
                order: "asc",
            }),
        )
    })

    it("anos passados pedem os 12 meses; o ano corrente, só até o fim do mês corrente", async () => {
        const list = vi.fn().mockResolvedValue(listResult([]))

        await buildReader(list).monthlyValues("user-1", PROPERTY, 2025, "BRL", JUNE_2026)

        expect(list).toHaveBeenCalledTimes(2)
        const windows = list.mock.calls.map(([, query]) => ({
            from: (query as { from: Date }).from.toISOString(),
            to: (query as { to: Date }).to.toISOString(),
        }))
        // 2025 inteiro (meia-noite de São Paulo = 03:00 UTC)...
        expect(windows).toContainEqual({
            from: "2025-01-01T03:00:00.000Z",
            to: "2026-01-01T03:00:00.000Z",
        })
        // ...e 2026 só de janeiro até 1º de julho (fim de junho).
        expect(windows).toContainEqual({
            from: "2026-01-01T03:00:00.000Z",
            to: "2026-07-01T03:00:00.000Z",
        })
    })

    it("junta os anos pedidos num só resultado", async () => {
        const list = vi.fn((_userId: string, query: unknown) => {
            const from = (query as { from: Date }).from
            const year = from.getUTCFullYear()
            return Promise.resolve(listResult([bucket(year, 0, year === 2025 ? 100 : 200)]))
        })

        const monthly = await buildReader(
            list as unknown as ConsumptionService["list"],
        ).monthlyValues("user-1", PROPERTY, 2025, "BRL", JUNE_2026)

        expect(monthly.forYear(2025)[0]).toBe(100)
        expect(monthly.forYear(2026)[0]).toBe(200)
    })

    it("custo não calculável vira ausência, não erro", async () => {
        for (const error of [
            new ValidationError("Grupo A sem apuração"),
            new NotFoundError("Sem medidor"),
        ]) {
            const list = vi.fn().mockRejectedValue(error)

            const monthly = await buildReader(list).monthlyValues(
                "user-1",
                PROPERTY,
                2026,
                "BRL",
                JUNE_2026,
            )

            expect(monthly.forYear(2026).every((value) => value === null)).toBe(true)
        }
    })

    it("outros erros sobem", async () => {
        const list = vi.fn().mockRejectedValue(new Error("banco fora"))

        await expect(
            buildReader(list).monthlyValues("user-1", PROPERTY, 2026, "BRL", JUNE_2026),
        ).rejects.toThrow("banco fora")
    })

    it("ano inicial depois do ano corrente não consulta nada", async () => {
        const list = vi.fn()

        const monthly = await buildReader(list).monthlyValues(
            "user-1",
            PROPERTY,
            2027,
            "BRL",
            JUNE_2026,
        )

        expect(list).not.toHaveBeenCalled()
        expect(monthly.forYear(2027).every((value) => value === null)).toBe(true)
    })

    it("o realizado em kWh não passa pelo cálculo de custo", async () => {
        const list = vi.fn()
        const reader = new GoalConsumptionReader(
            { findByTarget: vi.fn().mockResolvedValue(null) } as unknown as MeterRepository,
            {} as ConsumptionRepository,
            { list } as Pick<ConsumptionService, "list">,
        )

        await reader.monthlyValues("user-1", PROPERTY, 2026, "KWH", JUNE_2026)

        expect(list).not.toHaveBeenCalled()
    })
})
