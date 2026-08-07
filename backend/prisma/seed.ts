import "dotenv/config"
import { prisma } from "@/shared/database/prisma.js"

// Seed do catálogo global de distribuidoras (Grupo B, baixa tensão) e da
// configuração de bandeira tarifária vigente.
//
// Idempotente: distribuidoras via `upsert` por `cnpj` (@unique) e a bandeira via
// `upsert` do singleton id = 1. Seguro rodar mais de uma vez — não duplica.
//
// ⚠️ Os valores tarifários são APROXIMAÇÕES REALISTAS calibradas para bater a
// tarifa efetiva ao consumidor (R$/kWh com tributos) de cada distribuidora em
// ~2026. Tarifas homologadas pela ANEEL variam a cada reajuste anual; os CNPJs
// também são aproximados e devem ser verificados antes de qualquer uso oficial.
//
// Modelo de tarifação (Grupo B, "cálculo por dentro"):
//   tarifaEfetiva = (tusd + te) / (1 − (icms + pis + cofins)) + bandeira
// Aqui invertemos para derivar (tusd + te) a partir da tarifa efetiva-alvo
// (sem bandeira, já que a bandeira vigente no seed é verde = 0):
//   (tusd + te) = tarifaEfetiva × (1 − (icms + pis + cofins))
// e dividimos meio a meio entre TUSD e TE.

// PIS/COFINS são federais e (nominalmente) iguais para todas as distribuidoras.
const PIS_RATE = 0.0165 // ~1,65%
const COFINS_RATE = 0.076 // ~7,6%

interface DistributorSeed {
    name: string
    cnpj: string // aproximado — verificar
    state: string // UF (define a alíquota de ICMS)
    icmsRate: number // alíquota de ICMS estadual sobre energia
    targetEffectiveTariff: number // R$/kWh efetivo ao consumidor (com tributos)
}

// ~11 distribuidoras reais, da mais barata (Celesc/SC) à mais cara (Equatorial
// PA). ICMS conforme a UF (ver wiki do projeto:
// https://github.com/viniciussartini/lumitrack/wiki/O-Sistema-Elétrico-Brasileiro).
const DISTRIBUTORS: DistributorSeed[] = [
    {
        name: "Enel Distribuição São Paulo",
        cnpj: "61.695.227/0001-93",
        state: "SP",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.64,
    },
    {
        name: "CPFL Paulista",
        cnpj: "33.050.196/0001-88",
        state: "SP",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.7,
    },
    {
        name: "Cemig Distribuição",
        cnpj: "06.981.180/0001-16",
        state: "MG",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.71,
    },
    {
        name: "Neoenergia Coelba",
        cnpj: "15.139.629/0001-94",
        state: "BA",
        icmsRate: 0.19,
        targetEffectiveTariff: 0.82,
    },
    {
        name: "Celesc Distribuição",
        cnpj: "08.336.783/0001-90",
        state: "SC",
        icmsRate: 0.17,
        targetEffectiveTariff: 0.53,
    },
    {
        name: "Light SESA",
        cnpj: "60.444.437/0001-46",
        state: "RJ",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.78,
    },
    {
        name: "Copel Distribuição",
        cnpj: "04.368.898/0001-06",
        state: "PR",
        icmsRate: 0.19,
        targetEffectiveTariff: 0.68,
    },
    {
        name: "Neoenergia Pernambuco",
        cnpj: "10.835.932/0001-08",
        state: "PE",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.77,
    },
    {
        name: "Equatorial Pará",
        cnpj: "04.895.728/0001-80",
        state: "PA",
        icmsRate: 0.19,
        targetEffectiveTariff: 0.94,
    },
    {
        name: "RGE Sul",
        cnpj: "02.016.440/0001-62",
        state: "RS",
        icmsRate: 0.17,
        targetEffectiveTariff: 0.72,
    },
    {
        name: "Neoenergia Distribuição Brasília",
        cnpj: "07.522.669/0001-92",
        state: "DF",
        icmsRate: 0.18,
        targetEffectiveTariff: 0.69,
    },
]

// Arredonda para 6 casas decimais (precisão de Decimal(10,6)).
function round6(value: number): number {
    return Math.round(value * 1e6) / 1e6
}

// Deriva (tusd, te) da tarifa efetiva-alvo, dividindo a base sem tributos
// meio a meio entre as duas parcelas.
function deriveTusdTe(
    targetEffectiveTariff: number,
    icmsRate: number,
): { tusd: number; te: number } {
    const base = targetEffectiveTariff * (1 - (icmsRate + PIS_RATE + COFINS_RATE))
    const half = round6(base / 2)
    return { tusd: half, te: half }
}

async function seedDistributors(): Promise<void> {
    for (const d of DISTRIBUTORS) {
        const { tusd, te } = deriveTusdTe(d.targetEffectiveTariff, d.icmsRate)

        await prisma.energyDistributor.upsert({
            where: { cnpj: d.cnpj },
            update: {
                name: d.name,
                state: d.state,
                tusdPerKwh: tusd,
                tePerKwh: te,
                icmsRate: d.icmsRate,
                pisRate: PIS_RATE,
                cofinsRate: COFINS_RATE,
            },
            create: {
                name: d.name,
                cnpj: d.cnpj,
                state: d.state,
                tusdPerKwh: tusd,
                tePerKwh: te,
                icmsRate: d.icmsRate,
                pisRate: PIS_RATE,
                cofinsRate: COFINS_RATE,
            },
        })
    }

    console.log(`Distribuidoras: ${DISTRIBUTORS.length} registros garantidos (upsert por CNPJ).`)
}

async function seedTariffFlag(): Promise<void> {
    // Bandeira vigente = verde. Valores de acréscimo em R$/100 kWh (2026).
    const flagValues = {
        currentFlag: "GREEN",
        greenPer100Kwh: 0,
        yellowPer100Kwh: 1.885,
        redP1Per100Kwh: 4.463,
        redP2Per100Kwh: 7.877,
    } as const

    await prisma.tariffFlagConfig.upsert({
        where: { id: 1 },
        update: flagValues,
        create: { id: 1, ...flagValues },
    })

    console.log("Bandeira tarifária: singleton (id=1) garantido, vigente = GREEN.")
}

async function main(): Promise<void> {
    try {
        await seedDistributors()
        await seedTariffFlag()
        console.log("Seed concluído.")
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Seed falhou:", error)
    process.exit(1)
})
