import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"

// Gera massa sintética de meter_readings no mesmo perfil da demonstração
// (iot-simulator/server/src/simulation/demoBootstrap.ts): 1 amostra/minuto
// por medidor, mesma cardinalidade usada para projetar o crescimento no
// laudo de desempenho de 2026-08-22 (11 medidores x 1.440 linhas/dia).
//
// Existe para dar volume realista a EXPLAIN (ANALYZE, BUFFERS) — sem massa,
// o planner do Postgres escolhe seq scan para tudo com poucas centenas de
// linhas, e nenhuma decisão de índice/retenção pode se apoiar nisso.
//
// NUNCA aponte para o banco de desenvolvimento: insere potencialmente
// milhões de linhas, não é idempotente entre execuções com --months
// diferentes, e não faz sentido conviver com dado real de teste manual.
// Roda contra PERFORMANCE_BASELINE_DATABASE_URL — uma variável própria,
// fora do envSchema da aplicação — nunca contra DATABASE_URL.
//
// Uso:
//   PERFORMANCE_BASELINE_DATABASE_URL=... npx tsx scripts/generate-performance-baseline-data.ts [--months=12] [--meters=11]

const READINGS_PER_DAY = 1_440 // 1 amostra/minuto — mesma cadência do MinuteRollupScheduler
const DAYS_PER_MONTH = 30 // aproximação deliberada — o objetivo é volume realista, não um calendário exato
const INSERT_BATCH_SIZE = 5_000

type ParsedArgs = { months: number; meters: number }

function parseArgs(argv: string[]): ParsedArgs {
    const options: ParsedArgs = { months: 12, meters: 11 }

    for (const arg of argv) {
        const match = /^--(months|meters)=(\d+)$/.exec(arg)
        if (match) {
            const [, key, value] = match as [string, "months" | "meters", string]
            options[key] = Number(value)
        }
    }

    return options
}

/**
 * Recusa rodar sem uma URL de banco descartável explicitamente configurada,
 * e recusa com ainda mais força se ela for igual à `DATABASE_URL` da
 * aplicação — mesmo padrão de separação que `DATABASE_TEST_URL` já usa em
 * `config/env.ts`, aplicado aqui porque este script não passa pelo
 * envSchema (não faz sentido exigir SMTP/JWT_SECRET/chaves de cifra só para
 * gerar dado sintético de uma tabela).
 */
function resolveDatabaseUrl(): string {
    const baselineUrl = process.env["PERFORMANCE_BASELINE_DATABASE_URL"]

    if (!baselineUrl) {
        console.error(
            "PERFORMANCE_BASELINE_DATABASE_URL não definida — aponte para um banco DESCARTÁVEL antes de rodar este script (ver backend/.env.example).",
        )
        process.exit(1)
    }

    if (baselineUrl === process.env["DATABASE_URL"]) {
        console.error(
            "PERFORMANCE_BASELINE_DATABASE_URL não pode ser igual a DATABASE_URL — este script insere massa sintética em massa, nunca no banco de desenvolvimento.",
        )
        process.exit(1)
    }

    return baselineUrl
}

function randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

async function ensureSyntheticMeter(prisma: PrismaClient, index: number) {
    const distributor = await prisma.energyDistributor.upsert({
        where: { cnpj: "00.000.000/0001-00" },
        update: {},
        create: {
            name: "Distribuidora Sintética (baseline de desempenho)",
            cnpj: "00.000.000/0001-00",
            state: "SP",
            tusdPerKwh: 0.3,
            tePerKwh: 0.25,
            icmsRate: 0.18,
            pisRate: 0.0165,
            cofinsRate: 0.076,
        },
    })

    const user = await prisma.user.upsert({
        where: { email: "perf-baseline@lumitrack.local" },
        update: {},
        create: {
            email: "perf-baseline@lumitrack.local",
            // Nunca autenticável de verdade — este usuário só existe para
            // satisfazer a FK de Property, o script não expõe login algum.
            password: "not-a-real-password-hash",
            userType: "INDIVIDUAL",
            firstName: "Baseline",
            lastName: "Desempenho",
        },
    })

    const property = await prisma.property.upsert({
        where: { id: `perf-baseline-property-${index}` },
        update: {},
        create: {
            id: `perf-baseline-property-${index}`,
            userId: user.id,
            distributorId: distributor.id,
            name: `Propriedade Sintética ${index}`,
            electricalSystem: "MONOPHASIC",
            billingClass: "B1",
        },
    })

    return prisma.meter.upsert({
        where: { propertyId: property.id },
        update: {},
        create: {
            name: `Medidor Sintético ${index}`,
            targetType: "PROPERTY",
            propertyId: property.id,
            protocol: "MQTT",
            topic: `perf-baseline/synthetic/${index}`,
        },
    })
}

/**
 * Gera e insere, em lotes, uma leitura por minuto entre `start` (inclusive) e
 * `end` (exclusive) para um medidor. `skipDuplicates` torna reexecuções
 * seguras — minuteStart é ancorado ao início do minuto UTC corrente, então
 * rodar de novo no mesmo minuto não duplica nada.
 */
async function generateReadingsForMeter(
    prisma: PrismaClient,
    meterId: string,
    start: Date,
    totalMinutes: number,
): Promise<number> {
    let inserted = 0
    let batch: Parameters<typeof prisma.meterReading.createMany>[0]["data"] = []

    for (let i = 0; i < totalMinutes; i++) {
        const minuteStart = new Date(start.getTime() + i * 60_000)

        batch.push({
            meterId,
            minuteStart,
            kwhConsumed: randomInRange(0.01, 0.08),
            avgVoltage: 220 + randomInRange(-3, 3),
            avgCurrent: randomInRange(1, 15),
            avgPowerW: randomInRange(200, 3500),
            avgPowerFactor: randomInRange(0.85, 0.98),
            sampleCount: 60,
            secondsCovered: 60,
        })

        if (batch.length >= INSERT_BATCH_SIZE) {
            const result = await prisma.meterReading.createMany({
                data: batch,
                skipDuplicates: true,
            })
            inserted += result.count
            batch = []
        }
    }

    if (batch.length > 0) {
        const result = await prisma.meterReading.createMany({ data: batch, skipDuplicates: true })
        inserted += result.count
    }

    return inserted
}

async function main() {
    const { months, meters } = parseArgs(process.argv.slice(2))
    const databaseUrl = resolveDatabaseUrl()

    const totalMinutesPerMeter = months * DAYS_PER_MONTH * READINGS_PER_DAY
    // Ancorado ao início do minuto UTC corrente — torna reexecuções no mesmo
    // minuto idempotentes via skipDuplicates, em vez de gerar uma janela
    // sempre ligeiramente diferente a cada chamada.
    const end = new Date(Math.floor(Date.now() / 60_000) * 60_000)
    const start = new Date(end.getTime() - totalMinutesPerMeter * 60_000)

    console.log(
        `Gerando massa sintética: ${meters} medidor(es) x ${months} mês(es) x ${READINGS_PER_DAY} leituras/dia ` +
            `(~${(meters * totalMinutesPerMeter).toLocaleString("pt-BR")} linhas totais). Banco: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`,
    )

    const pool = new Pool({ connectionString: databaseUrl })
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

    try {
        const meterIds: string[] = []

        for (let i = 0; i < meters; i++) {
            const meter = await ensureSyntheticMeter(prisma, i)
            meterIds.push(meter.id)
        }

        for (const meterId of meterIds) {
            const startedAt = Date.now()
            const inserted = await generateReadingsForMeter(
                prisma,
                meterId,
                start,
                totalMinutesPerMeter,
            )
            const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
            console.log(
                `  medidor ${meterId}: ${inserted.toLocaleString("pt-BR")} leitura(s) em ${elapsedSeconds}s.`,
            )
        }

        console.log("\nConcluído. IDs de medidor para EXPLAIN (consumption.repository.ts):")
        for (const meterId of meterIds) {
            console.log(`  ${meterId}`)
        }
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch((error: unknown) => {
    console.error("Geração de massa sintética falhou:", error)
    process.exit(1)
})
