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

    const alertCount = await prisma.alert.count({
        where: { userId: { in: [residentialUserId, commercialUserId] } },
    })

    console.log("\n=== Seed de demonstração concluído ===")
    console.log(`Medidores criados: ${meters.length}`)
    for (const meter of meters) {
        console.log(`  - [${meter.targetType}] ${meter.name} (tópico: ${meter.topic})`)
    }

    console.log(`\nAlertas configurados: ${alertCount}`)
    console.log(
        "Nenhuma leitura foi gerada — o histórico nasce da ingestão IoT real, a partir do deploy.",
    )

    console.log("\nCredenciais de login:")
    if (process.env["DEMO_SEED_PASSWORD"]) {
        // O operador já definiu a senha (é o valor de DEMO_SEED_PASSWORD) —
        // reimprimi-la aqui só duplicaria a exposição num log de CI/deploy
        // sem necessidade nenhuma.
        console.log(`  Residencial: ${DEMO_RESIDENTIAL_EMAIL}`)
        console.log(`  Comercial:   ${DEMO_COMMERCIAL_EMAIL}`)
        console.log("  (senha: a definida em DEMO_SEED_PASSWORD)")
    } else {
        // Saída de desenvolvimento (console local ou log de CI/deploy) —
        // nunca persistida em arquivo. Com DEMO_PASSWORD gerada
        // (constants.ts), este é o único lugar onde ela aparece.
        console.log(`  Residencial: ${DEMO_RESIDENTIAL_EMAIL} / ${DEMO_PASSWORD}`)
        console.log(`  Comercial:   ${DEMO_COMMERCIAL_EMAIL} / ${DEMO_PASSWORD}`)
    }
}
