import { describe, it, expect, vi } from "vitest"
import { DemandAlertScheduler } from "@/modules/iot/iot-worker/DemandAlertScheduler.js"
import type {
    DemandAlertRepository,
    DemandAlertResponse,
} from "@/modules/demand-alert/demand-alert.repository.js"
import type { MeterRepository, MeterWithTargetRow } from "@/modules/meter/meter.repository.js"
import type {
    MeterDemandRollupRepository,
    MeterDemandRollupResponse,
} from "@/modules/meter/meter-demand-rollup.repository.js"
import type { PropertyResponse } from "@/modules/property/property.repository.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"
import type { NotificationStore } from "@/shared/notifications/notification-store.js"

// Mesmo NOW de DemandRollupScheduler.test.ts — mês local é setembro/2026,
// período começa em 2026-09-01T03:00:00Z (meia-noite SP em UTC).
const NOW = new Date(Date.UTC(2026, 8, 8, 19, 5, 30))
const PERIOD_START = new Date(Date.UTC(2026, 8, 1, 3, 0))

function fakeProperty(overrides: Partial<PropertyResponse> = {}): PropertyResponse {
    return {
        id: "prop-1",
        userId: "user-1",
        tariffGroup: "GROUP_A",
        tariffModality: "GREEN",
        contractedDemandKw: 200,
        contractedDemandPeakKw: null,
        contractedDemandOffPeakKw: null,
        ...overrides,
    } as unknown as PropertyResponse
}

function fakeTargetRow(property: PropertyResponse | null): MeterWithTargetRow {
    return { meter: {} as never, property, area: null, device: null }
}

function fakeAlert(overrides: Partial<DemandAlertResponse> = {}): DemandAlertResponse {
    return {
        id: "alert-1",
        userId: "user-1",
        meterId: "meter-1",
        name: "Ultrapassagem",
        thresholdPercent: 100,
        enabled: true,
        lastNotifiedPeriodStart: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as unknown as DemandAlertResponse
}

function fakeRollupRow(
    overrides: Partial<MeterDemandRollupResponse> = {},
): MeterDemandRollupResponse {
    return {
        meterId: "meter-1",
        periodStart: PERIOD_START,
        post: "PEAK",
        maxAvgPowerW: 0,
        windowEndAt: NOW,
        ...overrides,
    }
}

type Fakes = {
    demandAlertRepository: DemandAlertRepository
    meterRepository: MeterRepository
    meterDemandRollupRepository: MeterDemandRollupRepository
    userEventHub: UserEventHub
    notificationStore: NotificationStore
    updateMock: ReturnType<typeof vi.fn>
    addMock: ReturnType<typeof vi.fn>
    emitMock: ReturnType<typeof vi.fn>
}

function buildFakes(overrides: {
    alerts?: DemandAlertResponse[]
    targets?: Map<string, MeterWithTargetRow>
    rollupRows?: MeterDemandRollupResponse[]
}): Fakes {
    const updateMock = vi.fn().mockResolvedValue(undefined)
    const addMock = vi.fn().mockReturnValue({ id: "notif-1" })
    const emitMock = vi.fn()

    const demandAlertRepository = {
        findAllEnabled: vi.fn().mockResolvedValue(overrides.alerts ?? []),
        update: updateMock,
    } as unknown as DemandAlertRepository

    const targets = overrides.targets ?? new Map()
    const meterRepository = {
        findManyByIdsWithTarget: vi.fn().mockResolvedValue(targets),
        findByIdWithTarget: vi
            .fn()
            .mockImplementation((meterId: string) => Promise.resolve(targets.get(meterId) ?? null)),
    } as unknown as MeterRepository

    const meterDemandRollupRepository = {
        findByMeterAndPeriod: vi.fn().mockResolvedValue(overrides.rollupRows ?? []),
    } as unknown as MeterDemandRollupRepository

    const userEventHub = { emit: emitMock } as unknown as UserEventHub
    const notificationStore = { add: addMock } as unknown as NotificationStore

    return {
        demandAlertRepository,
        meterRepository,
        meterDemandRollupRepository,
        userEventHub,
        notificationStore,
        updateMock,
        addMock,
        emitMock,
    }
}

function buildScheduler(fakes: Fakes): DemandAlertScheduler {
    return new DemandAlertScheduler(
        fakes.demandAlertRepository,
        fakes.meterRepository,
        fakes.meterDemandRollupRepository,
        { meterRepository: fakes.meterRepository },
        fakes.userEventHub,
        fakes.notificationStore,
    )
}

describe("DemandAlertScheduler.tick", () => {
    it("não faz nada quando não há alertas habilitados", async () => {
        const fakes = buildFakes({ alerts: [] })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.meterRepository.findManyByIdsWithTarget).not.toHaveBeenCalled()
    })

    it("dispara notificação quando a demanda medida atinge o limiar (Verde)", async () => {
        const targets = new Map([["meter-1", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            alerts: [fakeAlert({ thresholdPercent: 100 })],
            targets,
            rollupRows: [fakeRollupRow({ post: "PEAK", maxAvgPowerW: 210_000 })], // 210 kW > 200 kW contratados
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).toHaveBeenCalledTimes(1)
        expect(fakes.addMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ alertId: "alert-1", meterId: "meter-1" }),
        )
        expect(fakes.emitMock).toHaveBeenCalledWith("user-1", "notification", { id: "notif-1" })
        expect(fakes.updateMock).toHaveBeenCalledWith("alert-1", {
            lastNotifiedPeriodStart: PERIOD_START,
        })
    })

    it("não dispara quando a demanda medida fica abaixo do limiar", async () => {
        const targets = new Map([["meter-1", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            alerts: [fakeAlert({ thresholdPercent: 105 })],
            targets,
            rollupRows: [fakeRollupRow({ post: "PEAK", maxAvgPowerW: 200_000 })], // exatamente 100%, abaixo de 105%
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).not.toHaveBeenCalled()
        expect(fakes.updateMock).not.toHaveBeenCalled()
    })

    it("não dispara quando ainda não há rollup no ciclo corrente", async () => {
        const targets = new Map([["meter-1", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({ alerts: [fakeAlert()], targets, rollupRows: [] })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).not.toHaveBeenCalled()
    })

    it("não duplica notificação já disparada no mesmo ciclo de faturamento", async () => {
        const targets = new Map([["meter-1", fakeTargetRow(fakeProperty())]])
        const fakes = buildFakes({
            alerts: [fakeAlert({ lastNotifiedPeriodStart: PERIOD_START })],
            targets,
            rollupRows: [fakeRollupRow({ post: "PEAK", maxAvgPowerW: 300_000 })],
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).not.toHaveBeenCalled()
        expect(fakes.meterDemandRollupRepository.findByMeterAndPeriod).not.toHaveBeenCalled()
    })

    it("Azul: dispara pelo posto que cruzou o limiar mesmo com o outro dentro do contratado", async () => {
        const targets = new Map([
            [
                "meter-1",
                fakeTargetRow(
                    fakeProperty({
                        tariffModality: "BLUE",
                        contractedDemandKw: null,
                        contractedDemandPeakKw: 150,
                        contractedDemandOffPeakKw: 400,
                    }),
                ),
            ],
        ])
        const fakes = buildFakes({
            alerts: [fakeAlert({ thresholdPercent: 100 })],
            targets,
            rollupRows: [
                fakeRollupRow({ post: "PEAK", maxAvgPowerW: 160_000 }), // 160/150 = 106,7% > 100%
                fakeRollupRow({ post: "OFF_PEAK", maxAvgPowerW: 350_000 }), // 350/400 = 87,5% < 100%
            ],
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).toHaveBeenCalledTimes(1)
        expect(fakes.addMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ message: expect.stringContaining("posto ponta") }),
        )
    })

    it("pula (fail-closed) quando a propriedade não é mais Grupo A", async () => {
        const targets = new Map([
            ["meter-1", fakeTargetRow(fakeProperty({ tariffGroup: "GROUP_B" }))],
        ])
        const fakes = buildFakes({
            alerts: [fakeAlert()],
            targets,
            rollupRows: [fakeRollupRow({ maxAvgPowerW: 999_000 })],
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).not.toHaveBeenCalled()
    })

    it("pula (fail-closed) quando a modalidade não tem cálculo de demanda implementado", async () => {
        const targets = new Map([
            ["meter-1", fakeTargetRow(fakeProperty({ tariffModality: "CONVENTIONAL_BINOMIAL" }))],
        ])
        const fakes = buildFakes({
            alerts: [fakeAlert()],
            targets,
            rollupRows: [fakeRollupRow({ maxAvgPowerW: 999_000 })],
        })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).not.toHaveBeenCalled()
    })

    it("continua avaliando os demais alertas quando um deles falha", async () => {
        const targets = new Map([
            ["meter-ok", fakeTargetRow(fakeProperty())],
            ["meter-fail", fakeTargetRow(fakeProperty())],
        ])
        const fakes = buildFakes({
            alerts: [
                fakeAlert({ id: "alert-ok", meterId: "meter-ok", thresholdPercent: 100 }),
                fakeAlert({ id: "alert-fail", meterId: "meter-fail", thresholdPercent: 100 }),
            ],
            targets,
        })
        fakes.meterDemandRollupRepository.findByMeterAndPeriod = vi
            .fn()
            .mockImplementation((meterId: string) => {
                if (meterId === "meter-fail") return Promise.reject(new Error("timeout"))
                return Promise.resolve([fakeRollupRow({ post: "PEAK", maxAvgPowerW: 300_000 })])
            })
        const scheduler = buildScheduler(fakes)

        await scheduler.tick(NOW)

        expect(fakes.addMock).toHaveBeenCalledTimes(1)
        expect(fakes.addMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ alertId: "alert-ok" }),
        )
    })
})
