import type { ITariffFlagSource } from "@/modules/tariff-flag/sync/ITariffFlagSource.js"
import type {
    TariffFlagRepository,
    TariffFlagConfigResponse,
} from "@/modules/tariff-flag/tariff-flag.repository.js"
import type { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "TariffFlagSyncService" })

function sameValues(
    current: TariffFlagConfigResponse,
    snapshot: Awaited<ReturnType<ITariffFlagSource["fetchCurrent"]>>,
): boolean {
    return (
        current.currentFlag === snapshot.flag &&
        current.greenPer100Kwh === snapshot.greenPer100Kwh &&
        current.yellowPer100Kwh === snapshot.yellowPer100Kwh &&
        current.redP1Per100Kwh === snapshot.redP1Per100Kwh &&
        current.redP2Per100Kwh === snapshot.redP2Per100Kwh
    )
}

/**
 * Orquestra a sincronização automática da bandeira vigente (#143, ADR-0007).
 * `syncOnce()` nunca lança — qualquer falha da fonte é capturada e logada,
 * e o config existente permanece intocado (falha fechada: mantém o último
 * valor conhecido, nunca zera nem adivinha).
 */
export class TariffFlagSyncService {
    constructor(
        private readonly source: ITariffFlagSource,
        private readonly tariffFlagRepository: TariffFlagRepository,
        private readonly tariffFlagHistoryRepository: TariffFlagHistoryRepository,
    ) {}

    private async readCurrentConfig(): Promise<TariffFlagConfigResponse | null> {
        let current: TariffFlagConfigResponse | null
        try {
            current = await this.tariffFlagRepository.get()
        } catch (err) {
            log.error({ err }, "Falha ao ler a configuração vigente antes da sincronização")
            return null
        }

        if (!current) {
            log.error(
                "Configuração de bandeira tarifária não encontrada — sincronização automática ignorada",
            )
            return null
        }

        return current
    }

    async syncOnce(): Promise<void> {
        const current = await this.readCurrentConfig()
        if (!current) return

        let snapshot
        try {
            snapshot = await this.source.fetchCurrent()
        } catch (err) {
            log.error(
                { err },
                "Falha ao obter a bandeira vigente da fonte oficial — mantendo o último valor conhecido",
            )
            return
        }

        if (sameValues(current, snapshot)) {
            log.info(
                { flag: current.currentFlag },
                "Bandeira vigente já está atualizada, nada a sincronizar",
            )
            return
        }

        await this.tariffFlagRepository.update({
            currentFlag: snapshot.flag,
            greenPer100Kwh: snapshot.greenPer100Kwh,
            yellowPer100Kwh: snapshot.yellowPer100Kwh,
            redP1Per100Kwh: snapshot.redP1Per100Kwh,
            redP2Per100Kwh: snapshot.redP2Per100Kwh,
        })

        await this.tariffFlagHistoryRepository.create({
            previousFlag: current.currentFlag,
            newFlag: snapshot.flag,
            previousValues: {
                greenPer100Kwh: current.greenPer100Kwh,
                yellowPer100Kwh: current.yellowPer100Kwh,
                redP1Per100Kwh: current.redP1Per100Kwh,
                redP2Per100Kwh: current.redP2Per100Kwh,
            },
            newValues: {
                greenPer100Kwh: snapshot.greenPer100Kwh,
                yellowPer100Kwh: snapshot.yellowPer100Kwh,
                redP1Per100Kwh: snapshot.redP1Per100Kwh,
                redP2Per100Kwh: snapshot.redP2Per100Kwh,
            },
            source: "AUTO",
            changedByUserId: null,
        })

        log.info(
            { previousFlag: current.currentFlag, newFlag: snapshot.flag },
            "Bandeira tarifária sincronizada automaticamente",
        )
    }
}
