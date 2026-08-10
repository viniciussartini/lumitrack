import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { prisma } from "@/shared/database/prisma.js"
import type { MeteredPoint } from "./topology.js"

const alertRepository = new AlertRepository(prisma)

// Um alerta por medidor informado, com a referência/tolerância que a própria
// topologia já carrega (ver MeteredPoint em topology.ts) — sem histórico
// gerado (ver seed-demo.ts), então não há AlertTriggerEvent a semear aqui;
// só a configuração, pronta para disparar quando a ingestão IoT real chegar.
async function createAlertsFor(userId: string, meters: readonly MeteredPoint[]): Promise<void> {
    for (const meter of meters) {
        await alertRepository.create(userId, {
            name: `Pico de consumo — ${meter.meterName}`,
            meterId: meter.meterId,
            referencePowerKw: meter.referencePowerKw,
            tolerancePercent: meter.tolerancePercent,
        })
    }
}

// Residencial: alerta em todos os cômodos (não no medidor geral). Comercial:
// alerta em todos os medidores, incluindo o geral.
export async function createDemoAlerts(
    residentialUserId: string,
    residentialRoomMeters: readonly MeteredPoint[],
    commercialUserId: string,
    commercialMeters: readonly MeteredPoint[],
): Promise<void> {
    await createAlertsFor(residentialUserId, residentialRoomMeters)
    await createAlertsFor(commercialUserId, commercialMeters)
}
