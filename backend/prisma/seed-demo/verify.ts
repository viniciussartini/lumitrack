import { prisma } from "@/shared/database/prisma.js"
import { DEMO_PASSWORD, DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL } from "./constants.js"

export async function printSummary(residentialUserId: string, commercialUserId: string): Promise<void> {
    const meters = await prisma.meter.findMany({
        where: {
            OR: [
                { property: { userId: { in: [residentialUserId, commercialUserId] } } },
                { area: { property: { userId: { in: [residentialUserId, commercialUserId] } } } },
                { device: { area: { property: { userId: { in: [residentialUserId, commercialUserId] } } } } },
            ],
        },
        select: { name: true, targetType: true, topic: true },
        orderBy: { name: "asc" },
    })

    console.log("\n=== Seed de demonstração concluído ===")
    console.log(`Medidores criados: ${meters.length}`)
    for (const meter of meters) {
        console.log(`  - [${meter.targetType}] ${meter.name} (tópico: ${meter.topic})`)
    }

    console.log("\nCredenciais de login:")
    console.log(`  Residencial: ${DEMO_RESIDENTIAL_EMAIL} / ${DEMO_PASSWORD}`)
    console.log(`  Comercial:   ${DEMO_COMMERCIAL_EMAIL} / ${DEMO_PASSWORD}`)
}
