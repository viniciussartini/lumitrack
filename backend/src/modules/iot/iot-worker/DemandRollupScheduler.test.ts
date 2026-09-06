import { describe, it, expect, vi } from "vitest"
import { DemandRollupScheduler } from "@/modules/iot/iot-worker/DemandRollupScheduler.js"
import type { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import type { MeterRepository, MeterWithTargetRow } from "@/modules/meter/meter.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { MeterDemandRollupRepository } from "@/modules/meter/meter-demand-rollup.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"

const MINUTE_MS = 60 * 1000

// now() é sempre 19:05 UTC de uma terça (2026-09-08) — target minute (o
// minuto cheio anterior) é 19:04 UTC, que em São Paulo (UTC-3) é 16:04, fora
// da janela de ponta 18h-21h. Os testes que querem PEAK ajustam `now`.
const NOW = new Date(Date.UTC(2026, 8, 8, 19, 5, 30))

function contiguousReadings(end: Date, powerW = 5000) {
    return Array.from({ length: 15 }, (_, i) => ({
        minuteStart: new Date(end.getTime() - i * MINUTE_MS),
        avgPowerW: powerW,
        secondsCovered: 60,
    }))
}

function fakeProperty(overrides: Partial<PropertyResponse> = {}): PropertyResponse {
    return {
        id: "prop-1",
        userId: "user-1",
        distributorId: "dist-1",
        tariffGroup: "GROUP_A",
        ...overrides,
    } as unknown as PropertyResponse
}

function fakeDistributor(overrides: Partial<DistributorResponse> = {}): DistributorResponse {
    return {
        id: "dist-1",
        peakWindowStartHour: 18,
        peakWindowEndHour: 21,
        ...overrides,
    } as unknown as DistributorResponse
}

function fakeTargetRow(property: PropertyResponse | null): MeterWithTargetRow {
    return { meter: {} as never, property, area: null, device: null }
}

type Fakes = {
    meterReadingRepository: MeterReadingRepository
    meterRepository: MeterRepository
    distributorRepository: DistributorRepository
    demandRollupRepository: MeterDemandRollupRepository
}

function buildFakes(overrides: {
    meterIds?: string[]
    targets?: Map<string, MeterWithTargetRow>
    distributor?: DistributorResponse | null
    trailingReadings?: ReturnType<typeof contiguousReadings>
}): Fakes {
    const meterReadingRepository = {
        findMeterIdsWithReadingsSince: vi.fn().mockResolvedValue(overrides.meterIds ?? []),
        findTrailingReadings: vi.fn().mockResolvedValue(overrides.trailingReadings ?? []),
    } as unknown as MeterReadingRepository

    const meterRepository = {
        findManyByIdsWithTarget: vi.fn().mockResolvedValue(overrides.targets ?? new Map()),
    } as unknown as MeterRepository

    const distributorRepository = {
        findById: vi.fn().mockResolvedValue(overrides.distributor ?? null),
    } as unknown as DistributorRepository

    const demandRollupRepository = {
        upsertIfGreater: vi.fn().mockResolvedValue(undefined),
    } as unknown as MeterDemandRollupRepository

    return {
        meterReadingRepository,
        meterRepository,
        distributorRepository,
        demandRollupRepository,
    }
}

describe("DemandRollupScheduler.tick", () => {
    it("não faz nada quando nenhum medidor teve leitura recente", async () => {
        const fakes = buildFakes({ meterIds: [] })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(fakes.meterRepository.findManyByIdsWithTarget).not.toHaveBeenCalled()
    })

    it("pula medidores do Grupo B (RN23 — só Grupo A tem demanda)", async () => {
        const targets = new Map([
            ["meter-b", fakeTargetRow(fakeProperty({ tariffGroup: "GROUP_B" }))],
        ])
        const fakes = buildFakes({ meterIds: ["meter-b"], targets })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(fakes.distributorRepository.findById).not.toHaveBeenCalled()
        expect(fakes.demandRollupRepository.upsertIfGreater).not.toHaveBeenCalled()
    })

    it("pula um medidor sem propriedade resolvida (alvo órfão)", async () => {
        const targets = new Map([["meter-x", fakeTargetRow(null)]])
        const fakes = buildFakes({ meterIds: ["meter-x"], targets })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(fakes.demandRollupRepository.upsertIfGreater).not.toHaveBeenCalled()
    })

    it("pula (fail-closed) quando a distribuidora não tem janela de ponta configurada", async () => {
        const targets = new Map([["meter-a", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            meterIds: ["meter-a"],
            targets,
            distributor: fakeDistributor({ peakWindowStartHour: null, peakWindowEndHour: null }),
            trailingReadings: contiguousReadings(new Date(NOW.getTime() - MINUTE_MS)),
        })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(fakes.demandRollupRepository.upsertIfGreater).not.toHaveBeenCalled()
    })

    it("ignora silenciosamente uma janela incompleta, sem chamar upsertIfGreater", async () => {
        const targets = new Map([["meter-a", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            meterIds: ["meter-a"],
            targets,
            distributor: fakeDistributor(),
            trailingReadings: contiguousReadings(new Date(NOW.getTime() - MINUTE_MS)).slice(0, 10),
        })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(fakes.demandRollupRepository.upsertIfGreater).not.toHaveBeenCalled()
    })

    it("classifica PEAK e grava o rollup quando a janela cai dentro do horário de ponta", async () => {
        // now = 19:05 UTC terça → target minute = 19:04 UTC → local 16:04,
        // fora da ponta. Ajustamos now para 22:05 UTC → target 22:04 UTC →
        // local 19:04, dentro de 18h-21h.
        const peakNow = new Date(Date.UTC(2026, 8, 8, 22, 5, 0))
        const targetMinute = new Date(Date.UTC(2026, 8, 8, 22, 4, 0))

        const targets = new Map([["meter-a", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            meterIds: ["meter-a"],
            targets,
            distributor: fakeDistributor(),
            trailingReadings: contiguousReadings(targetMinute, 8000),
        })
        const scheduler = new DemandRollupScheduler(
            fakes.meterReadingRepository,
            fakes.meterRepository,
            fakes.distributorRepository,
            fakes.demandRollupRepository,
        )

        await scheduler.tick(peakNow)

        expect(fakes.demandRollupRepository.upsertIfGreater).toHaveBeenCalledWith(
            "meter-a",
            new Date(Date.UTC(2026, 8, 1, 3, 0)), // início do mês local, em UTC real
            "PEAK",
            8000,
            targetMinute,
        )
    })

    it("continua processando os demais medidores quando um deles falha", async () => {
        const targets = new Map([
            ["meter-ok", fakeTargetRow(fakeProperty({ distributorId: "dist-1" }))],
            ["meter-fail", fakeTargetRow(fakeProperty({ distributorId: "dist-broken" }))],
        ])
        // NOW tem segundos (:30) — o scheduler trunca ao minuto cheio antes
        // de subtrair 1 minuto; a fixture precisa do mesmo instante exato,
        // senão `computeTrailingWindowAverage` rejeita a janela por não
        // bater com o `windowEndMinute` que o scheduler realmente calcula.
        const targetMinute = new Date(Date.UTC(2026, 8, 8, 19, 4, 0))

        const meterReadingRepository = {
            findMeterIdsWithReadingsSince: vi.fn().mockResolvedValue(["meter-ok", "meter-fail"]),
            findTrailingReadings: vi.fn().mockResolvedValue(contiguousReadings(targetMinute)),
        } as unknown as MeterReadingRepository

        const meterRepository = {
            findManyByIdsWithTarget: vi.fn().mockResolvedValue(targets),
        } as unknown as MeterRepository

        const distributorRepository = {
            findById: vi.fn().mockImplementation((id: string) => {
                if (id === "dist-broken") return Promise.reject(new Error("timeout"))
                return Promise.resolve(fakeDistributor())
            }),
        } as unknown as DistributorRepository

        const demandRollupRepository = {
            upsertIfGreater: vi.fn().mockResolvedValue(undefined),
        } as unknown as MeterDemandRollupRepository

        const scheduler = new DemandRollupScheduler(
            meterReadingRepository,
            meterRepository,
            distributorRepository,
            demandRollupRepository,
        )

        await scheduler.tick(NOW)

        expect(demandRollupRepository.upsertIfGreater).toHaveBeenCalledTimes(1)
        expect(demandRollupRepository.upsertIfGreater).toHaveBeenCalledWith(
            "meter-ok",
            expect.any(Date),
            expect.any(String),
            5000,
            targetMinute,
        )
    })
})
