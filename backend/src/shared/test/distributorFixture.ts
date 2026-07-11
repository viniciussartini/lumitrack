import type { PrismaClient } from "@/generated/prisma/client.js"

// Distribuidora deixou de ser cadastrada por usuário (Fase 3.2) — é um
// catálogo global somente leitura, populado via seed em produção. Nos
// testes, cada suíte insere a(s) distribuidora(s) que precisa diretamente
// via Prisma (nunca via API — não há mais POST /api/distributors).
let cnpjCounter = 0

export function nextTestCnpj(): string {
    cnpjCounter += 1
    // CNPJs de teste não passam pela validação de dígito verificador (a
    // inserção é direta no banco, não via createDistributorSchema — que nem
    // existe mais) — só precisam ser únicos.
    return `00.000.${String(cnpjCounter).padStart(3, "0")}/0001-${String(cnpjCounter % 100).padStart(2, "0")}`
}

export type TestDistributorOverrides = Partial<{
    name: string
    cnpj: string
    state: string
    tusdPerKwh: number
    tePerKwh: number
    icmsRate: number
    pisRate: number
    cofinsRate: number
}>

// tusdPerKwh + tePerKwh = 0.6 e tributos ~27,25% (18% ICMS + 1,65% PIS +
// 7,6% COFINS) → tarifa efetiva ≈ R$ 0,8244/kWh antes da bandeira, valores
// redondos o suficiente para conferir cálculos nos testes.
export async function createTestDistributor(prismaClient: PrismaClient, overrides: TestDistributorOverrides = {}) {
    return prismaClient.energyDistributor.create({
        data: {
            name: overrides.name ?? "CEMIG Distribuição S.A.",
            cnpj: overrides.cnpj ?? nextTestCnpj(),
            state: overrides.state ?? "MG",
            tusdPerKwh: overrides.tusdPerKwh ?? 0.3,
            tePerKwh: overrides.tePerKwh ?? 0.3,
            icmsRate: overrides.icmsRate ?? 0.18,
            pisRate: overrides.pisRate ?? 0.0165,
            cofinsRate: overrides.cofinsRate ?? 0.076,
        },
    })
}

export async function createTestTariffFlagConfig(prismaClient: PrismaClient) {
    return prismaClient.tariffFlagConfig.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            currentFlag: "GREEN",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        },
    })
}
