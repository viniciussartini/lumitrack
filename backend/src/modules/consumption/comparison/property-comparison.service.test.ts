import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { createBillCalculators } from "@/modules/consumption/billing/createBillCalculators.js"
import {
    PropertyComparisonService,
    resolveComparisonSign,
} from "@/modules/consumption/comparison/property-comparison.service.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { ConsumptionService } from "@/modules/consumption/consumption.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { PldQuoteRepository } from "@/modules/pld-quote/pld-quote.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { UserRepository } from "@/modules/user/user.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { countQueries } from "@/shared/database/queryCounter.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { TariffService } from "@/shared/tariff/tariff.service.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const meterRepository = new MeterRepository(prismaTest)
const propertyRepository = new PropertyRepository(prismaTest)
const distributorRepository = new DistributorRepository(prismaTest)
const propertyService = new PropertyService(propertyRepository, distributorRepository)
const areaRepository = new AreaRepository(prismaTest)
const deviceRepository = new DeviceRepository(prismaTest)
const tariffFlagRepository = new TariffFlagRepository(prismaTest)
const tariffCatalogRepository = new TariffCatalogRepository(prismaTest)
const consumptionRepository = new ConsumptionRepository(prismaTest)
const meterDemandRollupRepository = new MeterDemandRollupRepository(prismaTest)
const aclContractRepository = new AclContractRepository(prismaTest)
const pldQuoteRepository = new PldQuoteRepository(prismaTest)
const userService = new UserService(new UserRepository(prismaTest))

const tariffService = new TariffService()
const billCalculators = createBillCalculators(
    consumptionRepository,
    tariffCatalogRepository,
    meterDemandRollupRepository,
    aclContractRepository,
    tariffService,
)

const propertyComparisonService = new PropertyComparisonService(
    propertyRepository,
    meterRepository,
    distributorRepository,
    tariffFlagRepository,
    tariffCatalogRepository,
    aclContractRepository,
    pldQuoteRepository,
    consumptionRepository,
    billCalculators.groupA,
    tariffService,
)

// Usado só para conferir que o total da comparação bate com o que `list()` calcula.
const consumptionService = new ConsumptionService(
    consumptionRepository,
    meterRepository,
    propertyRepository,
    areaRepository,
    deviceRepository,
    distributorRepository,
    tariffFlagRepository,
    billCalculators,
    tariffService,
)

async function insertReading(
    meterId: string,
    minuteStart: string,
    kwhConsumed: number,
    avgPowerW: number,
) {
    return prismaTest.meterReading.create({
        data: {
            meterId,
            minuteStart: new Date(minuteStart),
            kwhConsumed,
            avgVoltage: 220,
            avgCurrent: avgPowerW / 220,
            avgPowerW,
            avgPowerFactor: 1,
            sampleCount: 60,
            secondsCovered: 60,
        },
    })
}

const MONTHS_2026 = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]

/** Uma leitura de ponta e uma fora de ponta em cada mês, com consumos que diferem por mês. */
async function insertReadingsForMonths(meterId: string, months: string[]) {
    for (const [i, month] of months.entries()) {
        await insertReading(meterId, `${month}-11T22:00:00Z`, 20 + i, 10_000) // 19h SP
        await insertReading(meterId, `${month}-11T20:00:00Z`, 30 + i, 10_000) // 17h SP
        await insertReading(meterId, `${month}-11T13:00:00Z`, 200 + i * 10, 10_000) // 10h SP
    }
}

beforeEach(async () => {
    await cleanDatabase()
})
afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("resolveComparisonSign", () => {
    it("retorna 1 quando o primeiro cenário custa mais que meio centavo além do segundo", () => {
        expect(resolveComparisonSign(0.01)).toBe(1)
        expect(resolveComparisonSign(1000)).toBe(1)
    })

    it("retorna -1 quando o primeiro cenário custa mais que meio centavo abaixo do segundo", () => {
        expect(resolveComparisonSign(-0.01)).toBe(-1)
        expect(resolveComparisonSign(-1000)).toBe(-1)
    })

    it("retorna 0 para diferença exatamente zero", () => {
        expect(resolveComparisonSign(0)).toBe(0)
    })

    // O caso real que motivou a tolerância: soma de vários meses deixando
    // um resíduo de ponto flutuante em vez de zero exato — sem tolerância,
    // isto seria classificado como "mais barato" por uma fração de
    // centavo que não aparece na tela (formatada em 2 casas decimais).
    it("retorna 0 para um resíduo de ponto flutuante abaixo de meio centavo", () => {
        const residue = 0.1 + 0.2 - 0.3 // ≈ 5.55e-17 em JS
        expect(resolveComparisonSign(residue)).toBe(0)
        expect(resolveComparisonSign(0.004)).toBe(0)
        expect(resolveComparisonSign(-0.004)).toBe(0)
    })

    it("não trata a própria tolerância como diferença relevante (limite exclusivo)", () => {
        expect(resolveComparisonSign(0.005)).toBe(0)
        expect(resolveComparisonSign(-0.005)).toBe(0)
    })
})

describe("ConsumptionService.compareAclToAcr — comparação ACR × ACL", () => {
    // Duas propriedades do mesmo usuário/distribuidora/catálogo — uma ACR
    // (sem contrato) e uma ACL (com contrato) — recebendo o MESMO consumo
    // real. `list()` de cada uma é o caminho já coberto acima; comparar o
    // resultado de `compareAclToAcr` contra os dois `list()` prova que
    // forçar o ambiente (parâmetro `environment`, em vez de ler
    // `property.contractingEnvironment` direto) reproduz o mesmo cálculo
    // que a propriedade real faria naquele ambiente — o único risco real
    // introduzido por este método.
    async function setupComparisonFixture(
        overrides: { contractPricePerMwh?: number; contractValidFrom?: Date } = {},
    ) {
        const user = await userService.createUser({
            email: "comparacao@example.com",
            password: "Senha@123",
            userType: "COMPANY",
            acceptedTerms: true,
            companyName: "Comparação Livre Ltda",
            cnpj: "33.444.555/0001-81",
        })
        const distributor = await createTestDistributor(prismaTest, {
            icmsRate: 0.17,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        })
        await prismaTest.energyDistributor.update({
            where: { id: distributor.id },
            data: { peakWindowStartHour: 18, peakWindowEndHour: 21 },
        })
        // Bandeira vermelha proposital — só o cenário ACR paga (ADR-0021).
        await prismaTest.tariffFlagConfig.upsert({
            where: { id: 1 },
            update: { currentFlag: "RED_P2" },
            create: {
                id: 1,
                currentFlag: "RED_P2",
                greenPer100Kwh: 0,
                yellowPer100Kwh: 1.885,
                redP1Per100Kwh: 4.463,
                redP2Per100Kwh: 7.877,
            },
        })
        await prismaTest.tariffEnergyRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: "PEAK",
                tusdPerKwh: 0.75,
                tePerKwh: 0.55,
            },
        })
        await prismaTest.tariffEnergyRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: "OFF_PEAK",
                tusdPerKwh: 0.12,
                tePerKwh: 0.28,
            },
        })
        await prismaTest.tariffDemandRate.create({
            data: {
                distributorId: distributor.id,
                subgroup: "A4",
                modality: "GREEN",
                post: null,
                tusdPerKw: 18.0,
            },
        })

        const propertyAcr = await propertyService.create(user.id, {
            name: "Indústria ACR",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
            publicLightingFeeBrl: 250,
        })
        const meterAcr = await prismaTest.meter.create({
            data: {
                name: "Medidor ACR",
                targetType: "PROPERTY",
                propertyId: propertyAcr.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "industria/comparacao-acr",
            },
        })

        const propertyAcl = await propertyService.create(user.id, {
            name: "Indústria ACL",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
            publicLightingFeeBrl: 250,
            contractingEnvironment: "ACL",
        })
        const meterAcl = await prismaTest.meter.create({
            data: {
                name: "Medidor ACL",
                targetType: "PROPERTY",
                propertyId: propertyAcl.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "industria/comparacao-acl",
            },
        })
        await prismaTest.aclContract.create({
            data: {
                userId: user.id,
                propertyId: propertyAcl.id,
                retailerName: "Comerc Energia",
                submarket: "SOUTHEAST_CENTER_WEST",
                energySource: "CONVENTIONAL",
                energyPricePerMwh: overrides.contractPricePerMwh ?? 300,
                contractedVolumeMwh: 30,
                validFrom: overrides.contractValidFrom ?? new Date("2026-01-01"),
                validTo: null,
            },
        })

        return { user, propertyAcr, meterAcr, propertyAcl, meterAcl }
    }

    async function insertComparisonReadings(meterId: string) {
        await insertReading(meterId, "2026-08-04T22:00:00Z", 800, 100_000) // ponta
        await insertReading(meterId, "2026-08-04T13:00:00Z", 28_000, 100_000) // fora de ponta
    }

    it("reproduz o total que list() calcularia para cada propriedade no seu próprio ambiente, com o veredito coerente com a diferença real", async () => {
        const { user, propertyAcr, meterAcr, propertyAcl, meterAcl } =
            await setupComparisonFixture()
        await insertComparisonReadings(meterAcr.id)
        await insertComparisonReadings(meterAcl.id)

        const [realAcr, realAcl] = await Promise.all([
            consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: propertyAcr.id,
                granularity: "month",
            }),
            consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: propertyAcl.id,
                granularity: "month",
            }),
        ])

        const comparison = await propertyComparisonService.compareAclToAcr(user.id, {
            propertyId: propertyAcl.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months).toHaveLength(1)
        expect(comparison.months[0]!.acrBrl).toBeCloseTo(realAcr.items[0]!.costBrl!, 2)
        expect(comparison.months[0]!.aclBrl).toBeCloseTo(realAcl.items[0]!.costBrl!, 2)
        expect(comparison.totalAcrBrl).toBeCloseTo(realAcr.items[0]!.costBrl!, 2)
        expect(comparison.totalAclBrl).toBeCloseTo(realAcl.items[0]!.costBrl!, 2)

        const expectedDiff = realAcr.items[0]!.costBrl! - realAcl.items[0]!.costBrl!
        expect(comparison.totalDiffBrl).toBeCloseTo(expectedDiff, 2)
        expect(comparison.diffPercent).toBeCloseTo(
            (expectedDiff / realAcr.items[0]!.costBrl!) * 100,
            2,
        )
        expect(comparison.verdict).toBe(
            expectedDiff > 0 ? "ACL_CHEAPER" : expectedDiff < 0 ? "ACR_CHEAPER" : "EQUIVALENT",
        )
    })

    it("aponta ACR_CHEAPER quando o preço negociado no contrato é bem mais caro que o catálogo", async () => {
        const { user, propertyAcr, meterAcr, propertyAcl, meterAcl } = await setupComparisonFixture(
            { contractPricePerMwh: 1500 }, // R$ 1,50/kWh — bem acima do catálogo (0,55/0,28)
        )
        await insertComparisonReadings(meterAcr.id)
        await insertComparisonReadings(meterAcl.id)

        const [realAcr, realAcl] = await Promise.all([
            consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: propertyAcr.id,
                granularity: "month",
            }),
            consumptionService.list(user.id, {
                targetType: "PROPERTY",
                targetId: propertyAcl.id,
                granularity: "month",
            }),
        ])

        const comparison = await propertyComparisonService.compareAclToAcr(user.id, {
            propertyId: propertyAcl.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        expect(realAcl.items[0]!.costBrl!).toBeGreaterThan(realAcr.items[0]!.costBrl!)
        expect(comparison.verdict).toBe("ACR_CHEAPER")
        expect(comparison.totalDiffBrl).toBeLessThan(0)
    })

    it("soma corretamente vários meses na mesma janela", async () => {
        const { user, propertyAcl, meterAcl } = await setupComparisonFixture()
        await insertReading(meterAcl.id, "2026-07-04T13:00:00Z", 10_000, 100_000)
        await insertComparisonReadings(meterAcl.id)

        const comparison = await propertyComparisonService.compareAclToAcr(user.id, {
            propertyId: propertyAcl.id,
            from: new Date("2026-07-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months).toHaveLength(2)
        const sumAcl = comparison.months.reduce((sum, m) => sum + m.aclBrl, 0)
        const sumAcr = comparison.months.reduce((sum, m) => sum + m.acrBrl, 0)
        expect(comparison.totalAclBrl).toBeCloseTo(sumAcl, 6)
        expect(comparison.totalAcrBrl).toBeCloseTo(sumAcr, 6)
        expect(comparison.totalDiffBrl).toBeCloseTo(sumAcr - sumAcl, 6)
    })

    it("exclui da comparação os meses sem contrato vigente, sem derrubar os meses que têm", async () => {
        const { user, propertyAcl, meterAcl } = await setupComparisonFixture({
            contractValidFrom: new Date("2026-08-01"), // só cobre agosto
        })
        await insertReading(meterAcl.id, "2026-07-04T13:00:00Z", 10_000, 100_000)
        await insertComparisonReadings(meterAcl.id)

        // Julho não tem contrato vigente — não pode aparecer como se fosse
        // um mês "ACL" fictício (mentiria a diferença como zero); só agosto
        // entra na comparação, sem lançar erro pela janela inteira.
        const comparison = await propertyComparisonService.compareAclToAcr(user.id, {
            propertyId: propertyAcl.id,
            from: new Date("2026-07-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months).toHaveLength(1)
        expect(comparison.months[0]!.monthStart).toEqual(new Date("2026-08-01"))
    })

    it("lança ForbiddenError para propriedade de outro usuário", async () => {
        const { propertyAcl } = await setupComparisonFixture()
        const otherUser = await userService.createUser({
            email: "outra@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Outra",
            lastName: "Pessoa",
            cpf: "529.982.247-25",
        })

        await expect(
            propertyComparisonService.compareAclToAcr(otherUser.id, {
                propertyId: propertyAcl.id,
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("lança ValidationError para propriedade que não está em ACL", async () => {
        const { user, propertyAcr } = await setupComparisonFixture()

        await expect(
            propertyComparisonService.compareAclToAcr(user.id, {
                propertyId: propertyAcr.id,
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(ValidationError)
    })

    it("lança NotFoundError quando não há contrato ACL vigente cobrindo o período pedido", async () => {
        const { user, propertyAcl, meterAcl } = await setupComparisonFixture({
            contractValidFrom: new Date("2026-09-01"), // começa depois do mês comparado
        })
        await insertComparisonReadings(meterAcl.id)

        await expect(
            propertyComparisonService.compareAclToAcr(user.id, {
                propertyId: propertyAcl.id,
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(NotFoundError)
    })

    it("retorna o PLD do submercado do contrato como contexto informativo, sem misturar outro submercado ou período fora da janela", async () => {
        const { user, propertyAcl, meterAcl } = await setupComparisonFixture()
        await insertComparisonReadings(meterAcl.id)
        await prismaTest.pldQuote.create({
            data: {
                submarket: "SOUTHEAST_CENTER_WEST",
                referencePeriod: new Date("2026-08-01"),
                valuePerMwh: 186.4,
            },
        })
        await prismaTest.pldQuote.create({
            data: {
                submarket: "SOUTH", // submercado diferente do contrato — não deve aparecer
                referencePeriod: new Date("2026-08-01"),
                valuePerMwh: 99.9,
            },
        })
        await prismaTest.pldQuote.create({
            data: {
                submarket: "SOUTHEAST_CENTER_WEST",
                referencePeriod: new Date("2025-01-01"), // fora da janela — não deve aparecer
                valuePerMwh: 50,
            },
        })

        const comparison = await propertyComparisonService.compareAclToAcr(user.id, {
            propertyId: propertyAcl.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.pldContext).toHaveLength(1)
        expect(comparison.pldContext[0]).toMatchObject({
            submarket: "SOUTHEAST_CENTER_WEST",
            valuePerMwh: 186.4,
        })
    })
})

describe("ConsumptionService.compareBrancaToConvencional — comparação Convencional × Branca", () => {
    // Mesma distribuidora/catálogo do Exemplo 3 (ver "ConsumptionService.list
    // — Tarifa Branca" acima): Ponta R$1,20/kWh, Intermediário R$0,75/kWh,
    // Fora de Ponta R$0,45/kWh, Convencional R$0,60/kWh (tusd+te 0,30 cada),
    // ICMS 18%/PIS 1,65%/COFINS 7,6% (defaults de createTestDistributor),
    // bandeira amarela, CIP R$18. O documento de referência dá o oráculo
    // qualitativo dos dois lados: 450 kWh deslocado (30 ponta + 50
    // intermediário + 370 fora) sai mais barato na Branca; o mesmo total
    // concentrado na ponta (100 ponta + 350 fora, sem intermediário) sai
    // mais caro — é o contraexemplo explícito do documento.
    async function setupBrancaComparisonFixture() {
        const user = await userService.createUser({
            email: "comparacao.branca@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "João",
            lastName: "Silva",
            cpf: "529.982.247-25",
        })
        const distributor = await createTestDistributor(prismaTest)
        await prismaTest.energyDistributor.update({
            where: { id: distributor.id },
            data: { peakWindowStartHour: 18, peakWindowEndHour: 21 },
        })
        await prismaTest.tariffFlagConfig.upsert({
            where: { id: 1 },
            update: { currentFlag: "YELLOW" },
            create: {
                id: 1,
                currentFlag: "YELLOW",
                greenPer100Kwh: 0,
                yellowPer100Kwh: 1.885,
                redP1Per100Kwh: 4.463,
                redP2Per100Kwh: 7.877,
            },
        })
        await prismaTest.groupBEnergyRate.createMany({
            data: [
                {
                    distributorId: distributor.id,
                    modality: "WHITE",
                    post: "PEAK",
                    tusdPerKwh: 0.6,
                    tePerKwh: 0.6,
                },
                {
                    distributorId: distributor.id,
                    modality: "WHITE",
                    post: "INTERMEDIATE",
                    tusdPerKwh: 0.375,
                    tePerKwh: 0.375,
                },
                {
                    distributorId: distributor.id,
                    modality: "WHITE",
                    post: "OFF_PEAK",
                    tusdPerKwh: 0.225,
                    tePerKwh: 0.225,
                },
            ],
        })

        const property = await propertyService.create(user.id, {
            name: "Casa",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC", // piso de 100 kWh
            billingClass: "B1",
            groupBModality: "WHITE",
            publicLightingFeeBrl: 18,
        })
        const meter = await prismaTest.meter.create({
            data: {
                name: "Medidor",
                targetType: "PROPERTY",
                propertyId: property.id,
                protocol: "MQTT",
                host: "localhost",
                port: 1883,
                topic: "casa-branca/comparacao",
            },
        })

        return { user, property, meter, distributor }
    }

    it("aponta BRANCA_CHEAPER para o perfil deslocado do Exemplo 3 (30 ponta + 50 intermediário + 370 fora)", async () => {
        const { user, meter, property } = await setupBrancaComparisonFixture()
        await insertReading(meter.id, "2026-08-04T22:00:00Z", 30, 10_000) // 19h SP — ponta
        await insertReading(meter.id, "2026-08-04T20:00:00Z", 50, 10_000) // 17h SP — intermediário
        await insertReading(meter.id, "2026-08-04T13:00:00Z", 370, 10_000) // 10h SP — fora de ponta

        const comparison = await propertyComparisonService.compareBrancaToConvencional(user.id, {
            propertyId: property.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months).toHaveLength(1)
        expect(comparison.months[0]!.brancaBrl).toBeCloseTo(359.5567, 2)
        const expectedConvencionalBrl =
            (450 * 0.6 + 450 * (1.885 / 100)) / (1 - (0.18 + 0.0165 + 0.076)) + 18
        expect(comparison.months[0]!.convencionalBrl).toBeCloseTo(expectedConvencionalBrl, 2)
        expect(comparison.totalDiffBrl).toBeGreaterThan(0)
        expect(comparison.verdict).toBe("BRANCA_CHEAPER")
    })

    it("aponta CONVENCIONAL_CHEAPER para o contraexemplo do documento (100 ponta + 350 fora, sem deslocar consumo)", async () => {
        const { user, meter, property } = await setupBrancaComparisonFixture()
        await insertReading(meter.id, "2026-08-04T22:00:00Z", 100, 10_000) // 19h SP — ponta
        await insertReading(meter.id, "2026-08-04T13:00:00Z", 350, 10_000) // 10h SP — fora de ponta

        const comparison = await propertyComparisonService.compareBrancaToConvencional(user.id, {
            propertyId: property.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        // 100×1,20 + 350×0,45 = R$ 277,50 sem tributos — o próprio contraexemplo do documento.
        expect(comparison.months[0]!.brancaBrl).toBeCloseTo(
            (277.5 + 450 * (1.885 / 100)) / (1 - (0.18 + 0.0165 + 0.076)) + 18,
            2,
        )
        expect(comparison.totalDiffBrl).toBeLessThan(0)
        expect(comparison.verdict).toBe("CONVENCIONAL_CHEAPER")
    })

    it("abaixo do piso de disponibilidade, os dois cenários convergem para a mesma conta (diferença zero)", async () => {
        const { user, meter, property } = await setupBrancaComparisonFixture()
        await insertReading(meter.id, "2026-08-04T13:00:00Z", 80, 10_000) // fora de ponta, 80 kWh (< piso 100)

        const comparison = await propertyComparisonService.compareBrancaToConvencional(user.id, {
            propertyId: property.id,
            from: new Date("2026-08-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months[0]!.diffBrl).toBeCloseTo(0, 6)
        expect(comparison.verdict).toBe("EQUIVALENT")
    })

    it("soma corretamente vários meses na mesma janela", async () => {
        const { user, meter, property } = await setupBrancaComparisonFixture()
        await insertReading(meter.id, "2026-07-04T13:00:00Z", 300, 10_000) // fora de ponta
        await insertReading(meter.id, "2026-08-04T22:00:00Z", 30, 10_000)
        await insertReading(meter.id, "2026-08-04T20:00:00Z", 50, 10_000)
        await insertReading(meter.id, "2026-08-04T13:00:00Z", 370, 10_000)

        const comparison = await propertyComparisonService.compareBrancaToConvencional(user.id, {
            propertyId: property.id,
            from: new Date("2026-07-01"),
            to: new Date("2026-08-01"),
        })

        expect(comparison.months).toHaveLength(2)
        const sumConvencional = comparison.months.reduce((sum, m) => sum + m.convencionalBrl, 0)
        const sumBranca = comparison.months.reduce((sum, m) => sum + m.brancaBrl, 0)
        expect(comparison.totalConvencionalBrl).toBeCloseTo(sumConvencional, 6)
        expect(comparison.totalBrancaBrl).toBeCloseTo(sumBranca, 6)
        expect(comparison.totalDiffBrl).toBeCloseTo(sumConvencional - sumBranca, 6)
    })

    it("a comparação de vários meses é igual à de cada mês isolado, num lote de queries de teto fixo", async () => {
        const { user, meter, property } = await setupBrancaComparisonFixture()
        await insertReadingsForMonths(meter.id, MONTHS_2026)

        const { result: whole, queryCount } = await countQueries(() =>
            propertyComparisonService.compareBrancaToConvencional(user.id, {
                propertyId: property.id,
                from: new Date("2026-03-01"),
                to: new Date("2026-08-01"),
            }),
        )
        const oneByOne = []
        for (const month of MONTHS_2026) {
            const single = await propertyComparisonService.compareBrancaToConvencional(user.id, {
                propertyId: property.id,
                from: new Date(`${month}-01`),
                to: new Date(`${month}-01`),
            })
            oneByOne.push(...single.months)
        }

        expect(whole.months).toHaveLength(MONTHS_2026.length)
        expect(whole.months).toEqual(oneByOne)
        // Teto medido para 6 meses: as queries do lote não dependem do número de meses.
        expect(queryCount).toBeLessThanOrEqual(6)
    })

    it("lança ForbiddenError para propriedade de outro usuário", async () => {
        const { property } = await setupBrancaComparisonFixture()
        const otherUser = await userService.createUser({
            email: "outra.branca@example.com",
            password: "Senha@123",
            userType: "INDIVIDUAL",
            acceptedTerms: true,
            firstName: "Outra",
            lastName: "Pessoa",
            cpf: "111.444.777-35",
        })

        await expect(
            propertyComparisonService.compareBrancaToConvencional(otherUser.id, {
                propertyId: property.id,
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(ForbiddenError)
    })

    it("lança ValidationError para propriedade que não está na Tarifa Branca", async () => {
        const { user, distributor } = await setupBrancaComparisonFixture()
        const conventionalProperty = await propertyService.create(user.id, {
            name: "Casa Convencional",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            billingClass: "B1",
        })

        await expect(
            propertyComparisonService.compareBrancaToConvencional(user.id, {
                propertyId: conventionalProperty.id,
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(ValidationError)
    })

    it("lança NotFoundError para propriedade inexistente", async () => {
        const { user } = await setupBrancaComparisonFixture()

        await expect(
            propertyComparisonService.compareBrancaToConvencional(user.id, {
                propertyId: "00000000-0000-0000-0000-000000000000",
                from: new Date("2026-08-01"),
                to: new Date("2026-08-01"),
            }),
        ).rejects.toThrow(NotFoundError)
    })
})
