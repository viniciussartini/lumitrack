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

// Janela de ponta — "geralmente 18h–21h" é o próprio padrão nacional
// citado no documento de referência; aplicada às 11 distribuidoras do seed
// pela mesma ressalva de aproximação já registrada acima (um catálogo
// editável com vigência, ainda sem fase, é quem permitirá diferenciar por
// distribuidora).
const PEAK_WINDOW_START_HOUR = 18
const PEAK_WINDOW_END_HOUR = 21

// Reaproveitada pelo catálogo Grupo A (seedGroupATariffCatalog) — mesma
// distribuidora já semeada abaixo, sem duplicar registro.
const CELESC_CNPJ = "08.336.783/0001-90"

// Reaproveitada pelo catálogo Grupo A Azul (seedBlueA4TariffCatalog, Fase 20)
// — fonte do Exemplo 7 (frigorífico A4 Azul, Cuiabá/MT).
const ENERGISA_MT_CNPJ = "03.467.321/0001-99"

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
        cnpj: CELESC_CNPJ,
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
    {
        name: "Energisa Mato Grosso",
        cnpj: ENERGISA_MT_CNPJ,
        state: "MT",
        icmsRate: 0.195,
        targetEffectiveTariff: 0.8,
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
                peakWindowStartHour: PEAK_WINDOW_START_HOUR,
                peakWindowEndHour: PEAK_WINDOW_END_HOUR,
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
                peakWindowStartHour: PEAK_WINDOW_START_HOUR,
                peakWindowEndHour: PEAK_WINDOW_END_HOUR,
            },
        })
    }

    console.log(`Distribuidoras: ${DISTRIBUTORS.length} registros garantidos (upsert por CNPJ).`)
}

// Tarifas de energia (TUSD+TE por posto) do Exemplo 6 de
// `.claude/docs/O-Sistema-Eletrico-Brasileiro.md` — Fora de Ponta TUSD 0,12
// + TE 0,28 = R$ 0,40/kWh; Ponta TUSD 0,75 + TE 0,55 = R$ 1,30/kWh.
async function seedGreenA4EnergyRates(distributorId: string): Promise<void> {
    const rates = [
        { post: "PEAK", tusdPerKwh: 0.75, tePerKwh: 0.55 },
        { post: "OFF_PEAK", tusdPerKwh: 0.12, tePerKwh: 0.28 },
    ] as const

    for (const rate of rates) {
        await prisma.tariffEnergyRate.upsert({
            where: {
                distributorId_subgroup_modality_post: {
                    distributorId,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: rate.post,
                },
            },
            update: { tusdPerKwh: rate.tusdPerKwh, tePerKwh: rate.tePerKwh },
            create: {
                distributorId,
                subgroup: "A4",
                modality: "GREEN",
                post: rate.post,
                tusdPerKwh: rate.tusdPerKwh,
                tePerKwh: rate.tePerKwh,
            },
        })
    }
}

// Demanda única da Verde (post nulo) — R$ 18,00/kW, Exemplo 6.
// upsert() não serve aqui: o Prisma recusa `null` num membro de chave única
// composta na cláusula where ("Argument `post` must not be null"), então o
// find-then-write manual abaixo é o que mantém a operação idempotente.
async function seedGreenA4DemandRate(distributorId: string): Promise<void> {
    const existing = await prisma.tariffDemandRate.findFirst({
        where: { distributorId, subgroup: "A4", modality: "GREEN", post: null },
    })

    if (existing) {
        await prisma.tariffDemandRate.update({
            where: { id: existing.id },
            data: { tusdPerKw: 18.0 },
        })
    } else {
        await prisma.tariffDemandRate.create({
            data: { distributorId, subgroup: "A4", modality: "GREEN", post: null, tusdPerKw: 18.0 },
        })
    }
}

// Tarifas de energia (TUSD+TE por posto) do Exemplo 7 — o documento só dá o
// valor combinado ("TUSD+TE energia Ponta: R$ 1,48/kWh", Fora Ponta R$ 0,57)
// sem separar as duas parcelas; dividido meio a meio, mesma aproximação já
// usada por `deriveTusdTe` para o catálogo Grupo B (a soma é o que entra na
// fórmula de parcelaConsumo, então a divisão interna não afeta o cálculo).
async function seedBlueA4EnergyRates(distributorId: string): Promise<void> {
    const rates = [
        { post: "PEAK", combined: 1.48 },
        { post: "OFF_PEAK", combined: 0.57 },
    ] as const

    for (const rate of rates) {
        const half = round6(rate.combined / 2)

        await prisma.tariffEnergyRate.upsert({
            where: {
                distributorId_subgroup_modality_post: {
                    distributorId,
                    subgroup: "A4",
                    modality: "BLUE",
                    post: rate.post,
                },
            },
            update: { tusdPerKwh: half, tePerKwh: half },
            create: {
                distributorId,
                subgroup: "A4",
                modality: "BLUE",
                post: rate.post,
                tusdPerKwh: half,
                tePerKwh: half,
            },
        })
    }
}

// Demandas contratadas da Azul (post PEAK/OFF_PEAK, nunca nulo) — R$ 45,00/kW
// na ponta e R$ 15,00/kW fora de ponta, Exemplo 7. Diferente da Verde
// (post nulo), o upsert nativo funciona aqui porque nenhum membro da chave
// composta é `null`.
async function seedBlueA4DemandRates(distributorId: string): Promise<void> {
    const rates = [
        { post: "PEAK", tusdPerKw: 45.0 },
        { post: "OFF_PEAK", tusdPerKw: 15.0 },
    ] as const

    for (const rate of rates) {
        await prisma.tariffDemandRate.upsert({
            where: {
                distributorId_subgroup_modality_post: {
                    distributorId,
                    subgroup: "A4",
                    modality: "BLUE",
                    post: rate.post,
                },
            },
            update: { tusdPerKw: rate.tusdPerKw },
            create: {
                distributorId,
                subgroup: "A4",
                modality: "BLUE",
                post: rate.post,
                tusdPerKw: rate.tusdPerKw,
            },
        })
    }
}

// Catálogo tarifário Grupo A (ADR-0019) — Celesc, subgrupo A4, Horária
// Verde, valores citados do Exemplo 6 (metalúrgica A4 Verde em Joinville/SC,
// mesma UF/ICMS 17% já usada na Celesc do Grupo B acima). Energisa MT,
// subgrupo A4, Horária Azul, valores citados do Exemplo 7 (frigorífico A4
// Azul em Cuiabá/MT) — fundação de modelo da Fase 20.
async function seedGroupATariffCatalog(): Promise<void> {
    const celesc = await prisma.energyDistributor.findUniqueOrThrow({
        where: { cnpj: CELESC_CNPJ },
    })

    await seedGreenA4EnergyRates(celesc.id)
    await seedGreenA4DemandRate(celesc.id)

    console.log(
        "Catálogo tarifário Grupo A: Celesc/A4/Horária Verde garantido (upsert, Exemplo 6).",
    )

    const energisaMt = await prisma.energyDistributor.findUniqueOrThrow({
        where: { cnpj: ENERGISA_MT_CNPJ },
    })

    await seedBlueA4EnergyRates(energisaMt.id)
    await seedBlueA4DemandRates(energisaMt.id)

    console.log(
        "Catálogo tarifário Grupo A: Energisa MT/A4/Horária Azul garantido (upsert, Exemplo 7).",
    )
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

// PLD (Preço de Liquidação das Diferenças) por submercado — catálogo de
// apoio à comparação ACR × ACL (Fase 21), sem ingestão automática da CCEE
// nesta fase. Valores ILUSTRATIVOS (mesma ressalva de aproximação do
// catálogo tarifário acima) — a estrutura (SE/CO tipicamente mais líquido,
// N/NE com maior variação hidrológica) é plausível, não homologada.
interface PldQuoteSeed {
    submarket: "NORTH" | "NORTHEAST" | "SOUTHEAST_CENTER_WEST" | "SOUTH"
    referencePeriod: Date // primeiro dia do mês, hora local
    valuePerMwh: number
}

const PLD_QUOTES: PldQuoteSeed[] = [
    {
        submarket: "SOUTHEAST_CENTER_WEST",
        referencePeriod: new Date("2026-06-01"),
        valuePerMwh: 98.75,
    },
    {
        submarket: "SOUTHEAST_CENTER_WEST",
        referencePeriod: new Date("2026-07-01"),
        valuePerMwh: 154.22,
    },
    {
        submarket: "SOUTHEAST_CENTER_WEST",
        referencePeriod: new Date("2026-08-01"),
        valuePerMwh: 186.4,
    },
    { submarket: "SOUTH", referencePeriod: new Date("2026-06-01"), valuePerMwh: 91.3 },
    { submarket: "SOUTH", referencePeriod: new Date("2026-07-01"), valuePerMwh: 142.6 },
    { submarket: "SOUTH", referencePeriod: new Date("2026-08-01"), valuePerMwh: 179.85 },
    { submarket: "NORTHEAST", referencePeriod: new Date("2026-06-01"), valuePerMwh: 105.4 },
    { submarket: "NORTHEAST", referencePeriod: new Date("2026-07-01"), valuePerMwh: 161.9 },
    { submarket: "NORTHEAST", referencePeriod: new Date("2026-08-01"), valuePerMwh: 193.15 },
    { submarket: "NORTH", referencePeriod: new Date("2026-06-01"), valuePerMwh: 88.6 },
    { submarket: "NORTH", referencePeriod: new Date("2026-07-01"), valuePerMwh: 138.75 },
    { submarket: "NORTH", referencePeriod: new Date("2026-08-01"), valuePerMwh: 172.3 },
]

async function seedPldQuotes(): Promise<void> {
    for (const quote of PLD_QUOTES) {
        await prisma.pldQuote.upsert({
            where: {
                submarket_referencePeriod: {
                    submarket: quote.submarket,
                    referencePeriod: quote.referencePeriod,
                },
            },
            update: { valuePerMwh: quote.valuePerMwh },
            create: quote,
        })
    }

    console.log(`PLD: ${PLD_QUOTES.length} cotações garantidas (upsert, 4 submercados × 3 meses).`)
}

async function main(): Promise<void> {
    try {
        await seedDistributors()
        await seedGroupATariffCatalog()
        await seedTariffFlag()
        await seedPldQuotes()
        console.log("Seed concluído.")
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Seed falhou:", error)
    process.exit(1)
})
