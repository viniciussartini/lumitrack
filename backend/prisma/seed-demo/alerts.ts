import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { prisma } from "@/shared/database/prisma.js"
import type { AnomalyMeterKey } from "./anomalies.js"

const alertRepository = new AlertRepository(prisma)

export type DemoAlertMap = Record<AnomalyMeterKey, string> // meterKey → alertId

// 3 alertas (1 residencial, 2 comercial) com faixa de referência calibrada
// para o pico normal de cada perfil de carga (ver consumptionGen.ts) — os 6
// episódios de anomalia (anomalies.ts) usam multiplicadores de 2.1x-3.5x,
// bem acima da faixa de tolerância normal.
export async function createDemoAlerts(
    residentialUserId: string,
    residentialMeterId: string,
    commercialUserId: string,
    commercialGeneralMeterId: string,
    ovenMeterId: string,
): Promise<DemoAlertMap> {
    const residentialAlert = await alertRepository.create(residentialUserId, {
        name: "Pico de consumo residencial",
        meterId: residentialMeterId,
        referencePowerKw: 4,
        tolerancePercent: 25,
    })

    const commercialGeneralAlert = await alertRepository.create(commercialUserId, {
        name: "Pico de consumo geral",
        meterId: commercialGeneralMeterId,
        referencePowerKw: 11,
        tolerancePercent: 20,
    })

    const ovenAlert = await alertRepository.create(commercialUserId, {
        name: "Pico de consumo do forno",
        meterId: ovenMeterId,
        referencePowerKw: 5,
        tolerancePercent: 15,
    })

    return {
        residential: residentialAlert.id,
        commercialGeneral: commercialGeneralAlert.id,
        oven: ovenAlert.id,
    }
}
