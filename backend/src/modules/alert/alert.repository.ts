import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateAlertInput, UpdateAlertInput } from "@/modules/alert/alert.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaAlert = NonNullable<Awaited<ReturnType<PrismaClient["alert"]["findUnique"]>>>

export type AlertResponse = PrismaAlert

/** Acesso a alertas por faixa de potência persistidos. */
export class AlertRepository {
    /** @param prisma - Cliente Prisma para a tabela `alert`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um alerta pelo id, sem checagem de ownership.
     *
     * @param id - Id do alerta.
     * @returns O alerta, ou `null` se não existir.
     */
    async findById(id: string): Promise<AlertResponse | null> {
        return this.prisma.alert.findUnique({ where: { id } })
    }

    /**
     * Lista paginada dos alertas de um usuário, mais recentes primeiro.
     *
     * @param userId - Id do usuário dono dos alertas.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de alertas do usuário.
     */
    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<AlertResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.alert.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            this.prisma.alert.count({ where: { userId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Todos os alertas de um usuário, sem paginação — usado só pela
     * exportação LGPD (Art. 18), que precisa de todos os alertas do titular
     * de uma vez.
     *
     * @param userId - Id do usuário dono dos alertas.
     * @returns Todos os alertas do usuário.
     */
    async findAllByUser(userId: string): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    }

    /**
     * KPI "alertas ativos" do painel (`GET /api/alerts/stats`) — substitui a
     * listagem de página cheia que o frontend fazia só pra contar `enabled`
     * no cliente.
     *
     * @param userId - Id do usuário dono dos alertas.
     * @returns Quantidade de alertas habilitados do usuário.
     */
    async countEnabledByUser(userId: string): Promise<number> {
        return this.prisma.alert.count({ where: { userId, enabled: true } })
    }

    /**
     * Todos os alertas habilitados de todos os usuários — usado só pelo
     * `AlertEvaluator` para popular o cache (meterId → Alert[]) no boot.
     *
     * @returns Todos os alertas habilitados.
     */
    async findAllEnabled(): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { enabled: true } })
    }

    /**
     * Alertas habilitados de um medidor específico — usado pelo
     * `AlertEvaluator` para recarregar o cache após create/update/delete/toggle.
     *
     * @param meterId - Id do medidor.
     * @returns Alertas habilitados do medidor.
     */
    async findAllEnabledByMeter(meterId: string): Promise<AlertResponse[]> {
        return this.prisma.alert.findMany({ where: { meterId, enabled: true } })
    }

    /**
     * Cria um alerta.
     *
     * @param userId - Id do usuário dono do alerta.
     * @param data - Dados já validados do alerta.
     * @returns O alerta criado.
     */
    async create(userId: string, data: CreateAlertInput): Promise<AlertResponse> {
        return this.prisma.alert.create({
            data: {
                userId,
                meterId: data.meterId,
                name: data.name,
                referencePowerKw: data.referencePowerKw,
                tolerancePercent: data.tolerancePercent,
                enabled: data.enabled ?? true,
            },
        })
    }

    /**
     * Atualiza um alerta, ignorando campos `undefined` do input.
     *
     * @param id - Id do alerta.
     * @param data - Campos já validados a atualizar.
     * @returns O alerta atualizado.
     */
    async update(id: string, data: UpdateAlertInput): Promise<AlertResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        return this.prisma.alert.update({ where: { id }, data: cleanData })
    }

    /**
     * Remove um alerta.
     *
     * @param id - Id do alerta.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.alert.delete({ where: { id } })
    }
}
