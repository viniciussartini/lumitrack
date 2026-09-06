import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { classifyPost, type PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidays } from "@/shared/time/holidays.js"

const consumptionRepository = new ConsumptionRepository(prismaTest)
const userRepository = new UserRepository(prismaTest)
const userService = new UserService(userRepository)

const PEAK_WINDOW: PeakWindowConfig = { peakWindowStartHour: 18, peakWindowEndHour: 21 }
const HOLIDAYS_2026 = getNationalHolidays(2026)

// São Paulo é UTC-3 o ano inteiro (RN26, sem horário de verão desde 2019).
// `minuteStart` é persistido em UTC (é isso que `localTsExpr()` converte na
// consulta) — estes helpers evitam confundir "hora local pretendida" com
// "hora UTC bruta" ao montar as fixtures do teste, o mesmo tipo de erro que
// motiva o teste de "virada de dia" abaixo.
const SP_OFFSET_HOURS = 3

/** Instante local (ano, mês 0-indexado, dia, hora, minuto) como se fosse UTC — usado como entrada de `classifyPost`, que já espera os campos UTC do `Date` representando a hora local. */
function localWallClock(year: number, month: number, day: number, hour: number, minute = 0): Date {
    return new Date(Date.UTC(year, month, day, hour, minute))
}

/** Converte um "instante local" (ver `localWallClock`) no timestamp UTC real gravado em `minuteStart`. */
function toStoredUtc(local: Date): Date {
    return new Date(local.getTime() + SP_OFFSET_HOURS * 60 * 60 * 1000)
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
            name: "Celesc Distribuição",
            cnpj: "08.336.783/0001-90",
            state: "SC",
            tusdPerKwh: 0.3,
            tePerKwh: 0.3,
            icmsRate: 0.17,
            pisRate: 0.0165,
            cofinsRate: 0.076,
            peakWindowStartHour: PEAK_WINDOW.peakWindowStartHour,
            peakWindowEndHour: PEAK_WINDOW.peakWindowEndHour,
        },
    })

    const property = await prismaTest.property.create({
        data: {
            userId: user.id,
            distributorId: distributor.id,
            name: "Metalúrgica",
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            billingClass: null,
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

// Cria uma leitura de 1 minuto com um consumo (kWh) fácil de somar no
// esperado do teste — os outros campos são irrelevantes para a classificação
// por posto.
async function createReading(meterId: string, minuteStart: Date, kwhConsumed: number) {
    await prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart,
            kwhConsumed,
            avgVoltage: 220,
            avgCurrent: 10,
            avgPowerW: 2200,
            avgPowerFactor: 0.98,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })
}

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("ConsumptionRepository.findKwhByPost", () => {
    it("classifica leituras em PEAK/OFF_PEAK conforme dia da semana, feriado e janela de ponta", async () => {
        const meterId = await setupMeter()

        // 2026-09-08 (terça, dia útil): 19h dentro da ponta, 10h fora dela.
        await createReading(meterId, toStoredUtc(localWallClock(2026, 8, 8, 19)), 5)
        await createReading(meterId, toStoredUtc(localWallClock(2026, 8, 8, 10)), 7)
        // 2026-09-05 (sábado): mesmo dentro do horário de ponta, é OFF_PEAK (RN25).
        await createReading(meterId, toStoredUtc(localWallClock(2026, 8, 5, 19)), 3)
        // Carnaval 2026 (2026-02-17, terça): seria PEAK se não fosse feriado móvel.
        await createReading(meterId, toStoredUtc(localWallClock(2026, 1, 17, 19)), 11)

        const from = new Date(Date.UTC(2026, 0, 1))
        const to = new Date(Date.UTC(2027, 0, 1))

        const result = await consumptionRepository.findKwhByPost(
            meterId,
            from,
            to,
            PEAK_WINDOW,
            HOLIDAYS_2026,
        )

        const byPost = Object.fromEntries(result.map((r) => [r.post, r.kwhConsumed]))
        // PEAK: só a leitura de terça às 19h fora do feriado (5). As outras 3
        // (fora da janela, fim de semana, feriado móvel) são todas OFF_PEAK.
        expect(byPost["PEAK"]).toBe(5)
        expect(byPost["OFF_PEAK"]).toBe(7 + 3 + 11)
    })

    it("não confunde a virada de dia local com a data UTC bruta (armadilha de fuso)", async () => {
        const meterId = await setupMeter()

        // 2026-09-04 22h em São Paulo (sexta-feira, dia útil) vira
        // 2026-09-05 01h em UTC (sábado) na coluna `minuteStart`. Uma janela
        // de ponta que alcança 22h-24h expõe a armadilha: se o dia da semana
        // fosse extraído do timestamp UTC bruto em vez de `localTsExpr()`, a
        // leitura viraria "sábado" (fim de semana, RN25) e seria classificada
        // OFF_PEAK por engano — a leitura é, na verdade, sexta-feira às 22h,
        // dentro da ponta.
        const LATE_PEAK_WINDOW: PeakWindowConfig = {
            peakWindowStartHour: 22,
            peakWindowEndHour: 24,
        }
        const fridayTenPmLocal = localWallClock(2026, 8, 4, 22)

        await createReading(meterId, toStoredUtc(fridayTenPmLocal), 9)

        const result = await consumptionRepository.findKwhByPost(
            meterId,
            new Date(Date.UTC(2026, 8, 1)),
            new Date(Date.UTC(2026, 8, 10)),
            LATE_PEAK_WINDOW,
            HOLIDAYS_2026,
        )

        expect(result).toEqual([{ post: "PEAK", kwhConsumed: 9 }])
    })

    it("usa classifyPost (mesma regra pura) como oráculo para um conjunto maior de leituras", async () => {
        const meterId = await setupMeter()

        const localTimestamps = [
            localWallClock(2026, 8, 8, 18), // terça, início exato da ponta
            localWallClock(2026, 8, 8, 20, 59), // terça, ainda dentro
            localWallClock(2026, 8, 8, 21), // terça, fim exato (exclusivo) — OFF_PEAK
            localWallClock(2026, 8, 6, 19), // domingo — OFF_PEAK
            localWallClock(2026, 8, 7, 19), // segunda, Independência — OFF_PEAK
        ]

        const expectedTotals: Record<string, number> = { PEAK: 0, OFF_PEAK: 0 }
        for (const [index, localTimestamp] of localTimestamps.entries()) {
            const kwh = index + 1
            await createReading(meterId, toStoredUtc(localTimestamp), kwh)
            const expectedPost = classifyPost(localTimestamp, PEAK_WINDOW, HOLIDAYS_2026)
            expectedTotals[expectedPost] = (expectedTotals[expectedPost] ?? 0) + kwh
        }

        const result = await consumptionRepository.findKwhByPost(
            meterId,
            new Date(Date.UTC(2026, 8, 1)),
            new Date(Date.UTC(2026, 8, 10)),
            PEAK_WINDOW,
            HOLIDAYS_2026,
        )

        const byPost = Object.fromEntries(result.map((r) => [r.post, r.kwhConsumed]))
        expect(byPost["PEAK"] ?? 0).toBe(expectedTotals["PEAK"])
        expect(byPost["OFF_PEAK"] ?? 0).toBe(expectedTotals["OFF_PEAK"])
    })

    it("retorna lista vazia quando não há leituras no período", async () => {
        const meterId = await setupMeter()

        const result = await consumptionRepository.findKwhByPost(
            meterId,
            new Date(Date.UTC(2026, 0, 1)),
            new Date(Date.UTC(2026, 0, 2)),
            PEAK_WINDOW,
            HOLIDAYS_2026,
        )

        expect(result).toEqual([])
    })
})
