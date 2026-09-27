import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { emptyOptionalAvgFields } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import type { Prisma } from "@/generated/prisma/client.js"

const meterReadingRepository = new MeterReadingRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

/** Insere uma linha de `meter_readings` com valores plausíveis, sobrescrevíveis por teste. */
async function insertReading(
    meterId: string,
    minuteStart: Date,
    overrides: Partial<Prisma.MeterReadingUncheckedCreateInput> = {},
): Promise<void> {
    await prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart,
            kwhConsumed: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1000,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
            ...emptyOptionalAvgFields(),
            ...overrides,
        },
    })
}

async function setupMeter(): Promise<string> {
    const user = await userService.createUser({
        email: "joao@example.com",
        password: "Senha@123",
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "João",
        lastName: "Silva",
        cpf: "529.982.247-25",
    })

    const distributor = await prismaTest.energyDistributor.create({
        data: {
            name: "CEMIG",
            cnpj: "06.981.180/0001-16",
            state: "MG",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.18,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        },
    })

    const property = await prismaTest.property.create({
        data: {
            userId: user.id,
            distributorId: distributor.id,
            name: "Casa",
            electricalSystem: "MONOPHASIC",
        },
    })

    const meter = await prismaTest.meter.create({
        data: {
            name: "Medidor",
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            host: "localhost",
            port: 1883,
            topic: "lumitrack/meter",
        },
    })

    return meter.id
}

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("MeterReadingRepository.upsertMinute", () => {
    it("cria uma nova leitura quando não existe para (meterId, minuteStart)", async () => {
        const meterId = await setupMeter()
        const minuteStart = new Date("2026-01-15T14:37:00.000Z")

        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart,
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 0.9,
            sampleCount: 30,
            secondsCovered: 30,
        })

        const reading = await prismaTest.meterReading.findUniqueOrThrow({
            where: { meterId_minuteStart: { meterId, minuteStart } },
        })

        expect(+reading.kwhConsumed).toBeCloseTo(0.01)
        expect(reading.sampleCount).toBe(30)
        expect(reading.secondsCovered).toBe(30)
    })

    it("faz merge ponderado ao chamar duas vezes para o mesmo minuto (restart no meio do minuto)", async () => {
        const meterId = await setupMeter()
        const minuteStart = new Date("2026-01-15T14:37:00.000Z")

        // Primeira metade do minuto: 30s, 30 amostras, 220V, 0.01 kWh.
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart,
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 0.9,
            sampleCount: 30,
            secondsCovered: 30,
        })

        // Servidor reinicia — segunda metade do minuto: 30s, 30 amostras, 240V, 0.012 kWh.
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart,
            energyKwh: 0.012,
            avgVoltage: 240,
            avgCurrent: 5,
            avgPowerW: 1200,
            avgPowerFactor: 0.9,
            sampleCount: 30,
            secondsCovered: 30,
        })

        const reading = await prismaTest.meterReading.findUniqueOrThrow({
            where: { meterId_minuteStart: { meterId, minuteStart } },
        })

        // Energia SOMA (não é média) — não perde nem duplica.
        expect(+reading.kwhConsumed).toBeCloseTo(0.022)
        // Tensão é média ponderada por segundos: (220*30 + 240*30) / 60 = 230.
        expect(+reading.avgVoltage).toBeCloseTo(230)
        expect(reading.sampleCount).toBe(60)
        expect(reading.secondsCovered).toBe(60)

        // Ainda uma única linha — não duplicou o registro.
        const count = await prismaTest.meterReading.count({ where: { meterId, minuteStart } })
        expect(count).toBe(1)
    })

    it("duas chamadas concorrentes para o mesmo minuto não perdem dado nem duplicam a linha (issue #313)", async () => {
        const meterId = await setupMeter()
        const minuteStart = new Date("2026-01-15T14:37:00.000Z")

        // Dispara as duas ao mesmo tempo (sem await entre elas) — o cenário
        // TOCTOU real: check-then-write teria as duas lendo "não existe" e
        // as duas tentando create(), uma delas falhando por violação da
        // constraint única (meterId, minuteStart).
        const [a, b] = await Promise.allSettled([
            meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                sampleCount: 30,
                secondsCovered: 30,
            }),
            meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.012,
                avgVoltage: 240,
                avgCurrent: 5,
                avgPowerW: 1200,
                avgPowerFactor: 0.9,
                sampleCount: 30,
                secondsCovered: 30,
            }),
        ])

        expect(a.status).toBe("fulfilled")
        expect(b.status).toBe("fulfilled")

        const count = await prismaTest.meterReading.count({ where: { meterId, minuteStart } })
        expect(count).toBe(1)

        const reading = await prismaTest.meterReading.findUniqueOrThrow({
            where: { meterId_minuteStart: { meterId, minuteStart } },
        })

        // As duas contribuições precisam estar refletidas — nenhuma foi
        // perdida por uma sobrescrever a outra.
        expect(+reading.kwhConsumed).toBeCloseTo(0.022)
        expect(reading.sampleCount).toBe(60)
        expect(reading.secondsCovered).toBe(60)
        expect(+reading.avgVoltage).toBeCloseTo(230) // (220*30 + 240*30) / 60
    })

    it("mantém leituras de minutos diferentes separadas", async () => {
        const meterId = await setupMeter()

        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T14:37:00.000Z"),
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T14:38:00.000Z"),
            energyKwh: 0.02,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })

        const count = await prismaTest.meterReading.count({ where: { meterId } })
        expect(count).toBe(2)
    })

    describe("grandezas por fase (ADR-0022)", () => {
        it("persiste grandezas por fase informadas e mantém as demais nulas", async () => {
            const meterId = await setupMeter()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            await meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                avgVoltagePhaseA: 219,
                avgFrequencyHz: 60,
                sampleCount: 30,
                secondsCovered: 30,
            })

            const reading = await prismaTest.meterReading.findUniqueOrThrow({
                where: { meterId_minuteStart: { meterId, minuteStart } },
            })

            expect(reading.avgVoltagePhaseA).toBeCloseTo(219)
            expect(reading.avgFrequencyHz).toBeCloseTo(60)
            expect(reading.avgVoltagePhaseB).toBeNull()
            expect(reading.avgVoltageUnbalance).toBeNull()
        })

        it("merge ponderado de uma grandeza por fase presente nos dois flushes", async () => {
            const meterId = await setupMeter()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            await meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                avgVoltagePhaseA: 218,
                sampleCount: 30,
                secondsCovered: 30,
            })
            await meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                avgVoltagePhaseA: 222,
                sampleCount: 30,
                secondsCovered: 30,
            })

            const reading = await prismaTest.meterReading.findUniqueOrThrow({
                where: { meterId_minuteStart: { meterId, minuteStart } },
            })

            // (218*30 + 222*30) / 60 = 220
            expect(reading.avgVoltagePhaseA).toBeCloseTo(220)
        })

        it("mantém o valor já persistido de uma grandeza quando o flush seguinte não a reporta", async () => {
            const meterId = await setupMeter()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            await meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                avgVoltagePhaseA: 218,
                sampleCount: 30,
                secondsCovered: 30,
            })
            // Segundo flush não traz avgVoltagePhaseA (fica null no snapshot) —
            // o merge não deve apagar o valor já conhecido do primeiro flush.
            await meterReadingRepository.upsertMinute({
                meterId,
                ...emptyOptionalAvgFields(),
                minuteStart,
                energyKwh: 0.01,
                avgVoltage: 220,
                avgCurrent: 5,
                avgPowerW: 1100,
                avgPowerFactor: 0.9,
                sampleCount: 30,
                secondsCovered: 30,
            })

            const reading = await prismaTest.meterReading.findUniqueOrThrow({
                where: { meterId_minuteStart: { meterId, minuteStart } },
            })

            expect(reading.avgVoltagePhaseA).toBeCloseTo(218)
        })

        it("duas chamadas concorrentes com a mesma grandeza por fase não perdem dado nem duplicam a linha", async () => {
            const meterId = await setupMeter()
            const minuteStart = new Date("2026-01-15T14:37:00.000Z")

            const [a, b] = await Promise.allSettled([
                meterReadingRepository.upsertMinute({
                    meterId,
                    ...emptyOptionalAvgFields(),
                    minuteStart,
                    energyKwh: 0.01,
                    avgVoltage: 220,
                    avgCurrent: 5,
                    avgPowerW: 1100,
                    avgPowerFactor: 0.9,
                    avgVoltagePhaseA: 218,
                    sampleCount: 30,
                    secondsCovered: 30,
                }),
                meterReadingRepository.upsertMinute({
                    meterId,
                    ...emptyOptionalAvgFields(),
                    minuteStart,
                    energyKwh: 0.012,
                    avgVoltage: 240,
                    avgCurrent: 5,
                    avgPowerW: 1200,
                    avgPowerFactor: 0.9,
                    avgVoltagePhaseA: 222,
                    sampleCount: 30,
                    secondsCovered: 30,
                }),
            ])

            expect(a.status).toBe("fulfilled")
            expect(b.status).toBe("fulfilled")

            const count = await prismaTest.meterReading.count({ where: { meterId, minuteStart } })
            expect(count).toBe(1)

            const reading = await prismaTest.meterReading.findUniqueOrThrow({
                where: { meterId_minuteStart: { meterId, minuteStart } },
            })
            expect(reading.avgVoltagePhaseA).toBeCloseTo(220) // (218*30 + 222*30) / 60
        })
    })
})

describe("MeterReadingRepository.findAggregated", () => {
    it("granularidade minute: um balde por minuto, avgPowerW igual ao da linha crua", async () => {
        const meterId = await setupMeter()
        const minuteStart = new Date("2026-01-15T14:37:00.000Z")

        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart,
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1100,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })

        const buckets = await meterReadingRepository.findAggregated(
            meterId,
            "minute",
            new Date("2026-01-15T14:00:00.000Z"),
            new Date("2026-01-15T15:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.avgPowerW).toBeCloseTo(1100)
    })

    it("granularidade hour: agrega minutos da mesma hora, ponderado por secondsCovered", async () => {
        const meterId = await setupMeter()

        // Dois minutos dentro de 14h (UTC), pesos iguais (60s cada) — média simples.
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T14:10:00.000Z"),
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 1000,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T14:20:00.000Z"),
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 2000,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })
        // Minuto de outra hora — não deve entrar no balde das 14h.
        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T15:05:00.000Z"),
            energyKwh: 0.05,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 9999,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })

        const buckets = await meterReadingRepository.findAggregated(
            meterId,
            "hour",
            new Date("2026-01-15T14:00:00.000Z"),
            new Date("2026-01-15T15:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.avgPowerW).toBeCloseTo(1500) // (1000*60 + 2000*60) / 120
    })

    it("respeita from/to — leituras fora da janela não aparecem", async () => {
        const meterId = await setupMeter()

        await meterReadingRepository.upsertMinute({
            meterId,
            ...emptyOptionalAvgFields(),
            minuteStart: new Date("2026-01-15T10:00:00.000Z"),
            energyKwh: 0.01,
            avgVoltage: 220,
            avgCurrent: 5,
            avgPowerW: 500,
            avgPowerFactor: 0.9,
            sampleCount: 60,
            secondsCovered: 60,
        })

        const buckets = await meterReadingRepository.findAggregated(
            meterId,
            "minute",
            new Date("2026-01-15T14:00:00.000Z"),
            new Date("2026-01-15T15:00:00.000Z"),
        )

        expect(buckets).toHaveLength(0)
    })

    it("sem nenhuma leitura no medidor, devolve array vazio", async () => {
        const meterId = await setupMeter()

        const buckets = await meterReadingRepository.findAggregated(
            meterId,
            "hour",
            new Date("2026-01-15T00:00:00.000Z"),
            new Date("2026-01-16T00:00:00.000Z"),
        )

        expect(buckets).toEqual([])
    })
})

describe("MeterReadingRepository.findSeries", () => {
    it("minuto único (aggregationMinutes=1): mín=média=máx do próprio minuto", async () => {
        const meterId = await setupMeter()
        await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"), { avgVoltage: 219 })

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "tensao",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.min).toBeCloseTo(219)
        expect(buckets[0]!.avg).toBeCloseTo(219)
        expect(buckets[0]!.max).toBeCloseTo(219)
    })

    it.each([
        [1, 3],
        [5, 1],
        [15, 1],
        [30, 1],
    ] as const)(
        "window=hora, aggregationMinutes=%d: agrega %d balde(s) com min/média/máx corretos",
        async (aggregationMinutes, expectedBucketCount) => {
            const meterId = await setupMeter()
            await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"), { avgVoltage: 210 })
            await insertReading(meterId, new Date("2026-01-15T17:01:00.000Z"), { avgVoltage: 220 })
            await insertReading(meterId, new Date("2026-01-15T17:02:00.000Z"), { avgVoltage: 230 })

            const buckets = await meterReadingRepository.findSeries(
                meterId,
                "tensao",
                "hora",
                aggregationMinutes,
                new Date("2026-01-15T17:00:00.000Z"),
                new Date("2026-01-15T18:00:00.000Z"),
            )

            expect(buckets).toHaveLength(expectedBucketCount)
            const totals = buckets.reduce(
                (acc, b) => ({
                    min: Math.min(acc.min, b.min!),
                    max: Math.max(acc.max, b.max!),
                }),
                { min: Infinity, max: -Infinity },
            )
            expect(totals.min).toBeCloseTo(210)
            expect(totals.max).toBeCloseTo(230)
            // Média ponderada por segundos (pesos iguais aqui): (210+220+230)/3 = 220.
            const weightedAvg =
                buckets.reduce((sum, b) => sum + b.avg! * 60, 0) / (buckets.length * 60)
            expect(weightedAvg).toBeCloseTo(220)
        },
    )

    it("window=dia: agrupa em baldes de 1h (date_trunc puro)", async () => {
        const meterId = await setupMeter()
        await insertReading(meterId, new Date("2026-01-15T17:05:00.000Z"), { avgVoltage: 210 })
        await insertReading(meterId, new Date("2026-01-15T17:35:00.000Z"), { avgVoltage: 230 })
        await insertReading(meterId, new Date("2026-01-15T23:10:00.000Z"), { avgVoltage: 240 })

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "tensao",
            "dia",
            undefined,
            new Date("2026-01-15T03:00:00.000Z"),
            new Date("2026-01-16T03:00:00.000Z"),
        )

        expect(buckets).toHaveLength(2)
        const bucket14h = buckets.find(
            (b) => b.bucketStart.getTime() === new Date("2026-01-15T14:00:00.000Z").getTime(),
        )!
        expect(bucket14h.min).toBeCloseTo(210)
        expect(bucket14h.avg).toBeCloseTo(220)
        expect(bucket14h.max).toBeCloseTo(230)
        const bucket20h = buckets.find(
            (b) => b.bucketStart.getTime() === new Date("2026-01-15T20:00:00.000Z").getTime(),
        )!
        expect(bucket20h.min).toBeCloseTo(240)
        expect(bucket20h.max).toBeCloseTo(240)
    })

    it("metric=thdv: valor do balde é a média das 3 fases", async () => {
        const meterId = await setupMeter()
        await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"), {
            avgThdVoltagePhaseA: 2,
            avgThdVoltagePhaseB: 3,
            avgThdVoltagePhaseC: 4,
        })

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "thdv",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.avg).toBeCloseTo(3)
    })

    it("metric=thdi: valor do balde é a média das 3 fases de corrente", async () => {
        const meterId = await setupMeter()
        await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"), {
            avgThdCurrentPhaseA: 4,
            avgThdCurrentPhaseB: 5,
            avgThdCurrentPhaseC: 6,
        })

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "thdi",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.avg).toBeCloseTo(5)
    })

    it("grandeza nunca reportada pelo medidor (coluna NULL em todas as linhas do balde): devolve null, não 0", async () => {
        const meterId = await setupMeter()
        // As 3 fases de THD ficam null por padrão (emptyOptionalAvgFields) — o
        // medidor deste teste nunca reportou essa grandeza.
        await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"))

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "thdv",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.min).toBeNull()
        expect(buckets[0]!.avg).toBeNull()
        expect(buckets[0]!.max).toBeNull()
    })

    it("balde com dado parcial nas 3 fases de thd (só 2 de 3) não inventa média com dado incompleto", async () => {
        const meterId = await setupMeter()
        await insertReading(meterId, new Date("2026-01-15T17:00:00.000Z"), {
            avgThdVoltagePhaseA: 2,
            avgThdVoltagePhaseB: 3,
            // avgThdVoltagePhaseC fica null
        })

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "thdv",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toHaveLength(1)
        expect(buckets[0]!.avg).toBeNull()
    })

    it("sem nenhuma leitura no medidor no período, devolve array vazio (quem preenche os baldes é fillMissingBuckets)", async () => {
        const meterId = await setupMeter()

        const buckets = await meterReadingRepository.findSeries(
            meterId,
            "tensao",
            "hora",
            1,
            new Date("2026-01-15T17:00:00.000Z"),
            new Date("2026-01-15T18:00:00.000Z"),
        )

        expect(buckets).toEqual([])
    })
})
