import { prisma } from "@/shared/database/prisma.js"
import { DEMO_PASSWORD, DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL } from "./constants.js"

export async function printSummary(
    residentialUserId: string,
    commercialUserId: string,
): Promise<void> {
    const meters = await prisma.meter.findMany({
        where: {
            OR: [
                { property: { userId: { in: [residentialUserId, commercialUserId] } } },
                { area: { property: { userId: { in: [residentialUserId, commercialUserId] } } } },
                {
                    device: {
                        area: {
                            property: { userId: { in: [residentialUserId, commercialUserId] } },
                        },
                    },
                },
            ],
        },
        select: { id: true, name: true, targetType: true, topic: true },
        orderBy: { name: "asc" },
    })

    console.log("\n=== Seed de demonstração concluído ===")
    console.log(`Medidores criados: ${meters.length}`)
    for (const meter of meters) {
        const [{ _count, _sum, _avg }] = await Promise.all([
            prisma.meterReading.aggregate({
                where: { meterId: meter.id },
                _count: { _all: true },
                _sum: { kwhConsumed: true },
                _avg: { avgPowerW: true },
            }),
        ])
        const readingCount = _count._all
        const totalKwh = (_sum.kwhConsumed ?? 0).toFixed(1)
        const avgPowerW = (_avg.avgPowerW ?? 0).toFixed(0)
        console.log(
            `  - [${meter.targetType}] ${meter.name} (tópico: ${meter.topic}) — ` +
                `${readingCount} leituras, ${totalKwh} kWh, ${avgPowerW}W médios`,
        )
    }

    const events = await prisma.alertTriggerEvent.findMany({
        where: { alert: { userId: { in: [residentialUserId, commercialUserId] } } },
        include: { alert: { select: { name: true } } },
        orderBy: { startedAt: "asc" },
    })

    console.log(`\nEpisódios de anomalia gerados: ${events.length}`)
    for (const event of events) {
        console.log(
            `  - ${event.alert.name}: ${event.startedAt.toISOString()} → ${event.durationSeconds}s, ` +
                `pico ${event.maxPowerW.toFixed(0)}W (média ${event.avgPowerW.toFixed(0)}W)`,
        )
    }

    console.log("\nCredenciais de login:")
    console.log(`  Residencial: ${DEMO_RESIDENTIAL_EMAIL} / ${DEMO_PASSWORD}`)
    console.log(`  Comercial:   ${DEMO_COMMERCIAL_EMAIL} / ${DEMO_PASSWORD}`)
}
