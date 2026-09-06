import { randomUUID } from "crypto"
import { PrismaClient, type TariffPost } from "@/generated/prisma/client.js"

export type MeterDemandRollupResponse = {
    meterId: string
    periodStart: Date
    post: TariffPost
    maxAvgPowerW: number
    windowEndAt: Date
}

/**
 * Persistência do rollup incremental de demanda medida (RN19) — uma linha
 * por medidor × mês (hora local) × posto tarifário, mantendo só o máximo já
 * observado. Nunca lido/escrito por varredura de `meter_readings`: quem
 * calcula a janela de 15 min é `DemandRollupScheduler`, este repository só
 * guarda o resultado.
 */
export class MeterDemandRollupRepository {
    /** @param prisma - Cliente Prisma usado para ler e gravar o rollup de demanda. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Atualiza o máximo de demanda de (medidor, período, posto) se a nova
     * janela superar o valor já registrado — nunca reduz. `INSERT ... ON
     * CONFLICT DO UPDATE` atômico (mesmo padrão de
     * `MeterReadingRepository.upsertMinute`): comparar em JS e depois
     * escrever reabriria a mesma corrida entre ticks concorrentes que o
     * upsert atômico evita.
     *
     * @param meterId - Id do medidor.
     * @param periodStart - Início do mês (hora local) da janela.
     * @param post - Posto tarifário da janela (classificado pelo minuto final).
     * @param avgPowerW - Potência média (W) da janela de 15 min.
     * @param windowEndAt - `minuteStart` do fim da janela.
     */
    async upsertIfGreater(
        meterId: string,
        periodStart: Date,
        post: TariffPost,
        avgPowerW: number,
        windowEndAt: Date,
    ): Promise<void> {
        await this.prisma.$executeRaw`
            INSERT INTO "meter_demand_rollups" (
                "id", "meterId", "periodStart", "post", "maxAvgPowerW", "windowEndAt", "updatedAt"
            )
            VALUES (
                ${randomUUID()}, ${meterId}, ${periodStart}, ${post}::"tariff_post", ${avgPowerW}, ${windowEndAt}, now()
            )
            ON CONFLICT ("meterId", "periodStart", "post") DO UPDATE SET
                "maxAvgPowerW" = GREATEST("meter_demand_rollups"."maxAvgPowerW", EXCLUDED."maxAvgPowerW"),
                "windowEndAt" = CASE
                    WHEN EXCLUDED."maxAvgPowerW" > "meter_demand_rollups"."maxAvgPowerW" THEN EXCLUDED."windowEndAt"
                    ELSE "meter_demand_rollups"."windowEndAt"
                END,
                "updatedAt" = now()
        `
    }

    /**
     * Lê o rollup de demanda de um medidor num período — uma linha por posto
     * com alguma janela válida já observada.
     *
     * @param meterId - Id do medidor.
     * @param periodStart - Início do mês (hora local) a consultar.
     * @returns As linhas de demanda do período, uma por posto.
     */
    async findByMeterAndPeriod(
        meterId: string,
        periodStart: Date,
    ): Promise<MeterDemandRollupResponse[]> {
        const rows = await this.prisma.meterDemandRollup.findMany({
            where: { meterId, periodStart },
        })

        return rows.map((r) => ({
            meterId: r.meterId,
            periodStart: r.periodStart,
            post: r.post,
            maxAvgPowerW: r.maxAvgPowerW,
            windowEndAt: r.windowEndAt,
        }))
    }
}
