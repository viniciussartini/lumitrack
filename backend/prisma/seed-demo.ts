import "dotenv/config"

// Script MANUAL e opcional de seed de demonstração — nunca roda em
// `prisma migrate reset` (não está em prisma.config.ts). Uso:
//   npm run db:seed:demo
//
// Cria dois usuários de demonstração (residencial e comercial) com
// propriedade/área/dispositivo/medidor completos, reaproveitando os
// services reais do backend (mesma criptografia/validação/hash de um
// cadastro de verdade). Idempotente: apaga e recria do zero a cada run.
//
// Este script NUNCA deve rodar contra produção real — os documentos
// (CPF/CNPJ) são 100% sintéticos e a senha é fixa e pública neste arquivo.
import { prisma } from "@/shared/database/prisma.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"
import { createDemoAlerts } from "./seed-demo/alerts.js"
import { createDemoCommercialUser, createDemoResidentialUser } from "./seed-demo/identities.js"
import { generateYearOfReadings, type MeterGenerationSpec } from "./seed-demo/readings.js"
import { createCommercialTopology, createResidentialTopology } from "./seed-demo/topology.js"
import { printSummary } from "./seed-demo/verify.js"

async function assertDistributorCatalogSeeded(): Promise<void> {
    const distributorCount = await prisma.energyDistributor.count()

    if (distributorCount === 0) {
        throw new Error(
            "Catálogo de distribuidoras vazio. Rode `npm run db:seed` antes do seed de demonstração.",
        )
    }
}

// Cascade do schema (User → Property/Area/Device → Meter →
// MeterReading/Alert → AlertTriggerEvent) cuida do resto — rodar 2x nunca
// duplica.
async function resetDemoData(): Promise<void> {
    await prisma.user.deleteMany({ where: { email: { in: [...DEMO_ACCOUNT_EMAILS] } } })
}

async function main(): Promise<void> {
    try {
        await assertDistributorCatalogSeeded()
        await resetDemoData()

        const residential = await createDemoResidentialUser()
        const residentialTopology = await createResidentialTopology(residential.id)

        const commercial = await createDemoCommercialUser()
        const commercialTopology = await createCommercialTopology(commercial.id)

        const alerts = await createDemoAlerts(
            residential.id,
            residentialTopology.meters.general.id,
            commercial.id,
            commercialTopology.meters.general.id,
            commercialTopology.meters.oven.id,
        )

        const specs: MeterGenerationSpec[] = [
            {
                rngSeedKey: "residential",
                meterId: residentialTopology.meters.general.id,
                profile: "RESIDENTIAL",
                anomaly: { meterKey: "residential", alertId: alerts.residential },
            },
            {
                rngSeedKey: "commercialGeneral",
                meterId: commercialTopology.meters.general.id,
                profile: "COMMERCIAL_GENERAL",
                anomaly: { meterKey: "commercialGeneral", alertId: alerts.commercialGeneral },
            },
            {
                rngSeedKey: "salesArea",
                meterId: commercialTopology.meters.salesArea.id,
                profile: "SALES_AREA",
            },
            {
                rngSeedKey: "oven",
                meterId: commercialTopology.meters.oven.id,
                profile: "OVEN",
                anomaly: { meterKey: "oven", alertId: alerts.oven },
            },
        ]

        console.log("Gerando 1 ano de leituras (isso pode levar alguns minutos)...")
        const readingsStartedAt = Date.now()
        await generateYearOfReadings(specs)
        console.log(`Leituras geradas em ${((Date.now() - readingsStartedAt) / 1000).toFixed(1)}s`)

        await printSummary(residential.id, commercial.id)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Seed de demonstração falhou:", error)
    process.exit(1)
})
