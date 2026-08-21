import { Prisma } from "@/generated/prisma/client.js"

// `("minuteStart" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'` é o
// idioma padrão do Postgres para converter um timestamp SEM fuso (a coluna
// `minuteStart`, que guarda o instante de recebimento em UTC) para o horário
// de parede de São Paulo: a primeira conversão marca o valor como UTC
// (produz timestamptz), a segunda projeta esse instante para o fuso de SP
// (produz de volta um timestamp sem fuso, agora com os dígitos em hora
// local). Sem isso, o "dia"/"hora" viraria às 21h/24h (UTC-3) em vez de
// meia-noite/hora cheia local.
//
// Compartilhado entre `consumption.repository.ts` e `meter-reading.repository.ts`
// — os dois agregam `meter_readings` por `date_trunc`, só a unidade e as
// colunas somadas mudam.
export function localTsExpr(): Prisma.Sql {
    return Prisma.sql`(("minuteStart" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`
}

export function rangeFilter(from: Date | undefined, to: Date | undefined): Prisma.Sql {
    const conditions: Prisma.Sql[] = []
    if (from) conditions.push(Prisma.sql`"minuteStart" >= ${from}`)
    if (to) conditions.push(Prisma.sql`"minuteStart" < ${to}`)
    if (conditions.length === 0) return Prisma.empty
    return Prisma.sql`AND ${Prisma.join(conditions, " AND ")}`
}
