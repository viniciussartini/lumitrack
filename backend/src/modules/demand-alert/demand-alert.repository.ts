import { PrismaClient } from "@/generated/prisma/client.js"
import type {
    CreateDemandAlertInput,
    UpdateDemandAlertInput,
} from "@/modules/demand-alert/demand-alert.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaDemandAlert = NonNullable<Awaited<ReturnType<PrismaClient["demandAlert"]["findUnique"]>>>

export type DemandAlertResponse = PrismaDemandAlert

/** Acesso a alertas de ultrapassagem de demanda contratada persistidos. */
export class DemandAlertRepository {
    /** @param prisma - Cliente Prisma para a tabela `demand_alerts`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um alerta pelo id, sem checagem de ownership.
     *
     * @param id - Id do alerta.
     * @returns O alerta, ou `null` se não existir.
     */
    async findById(id: string): Promise<DemandAlertResponse | null> {
        return this.prisma.demandAlert.findUnique({ where: { id } })
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
    ): Promise<Paginated<DemandAlertResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.demandAlert.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            this.prisma.demandAlert.count({ where: { userId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Todos os alertas de um usuário, sem paginação — usado pela exportação
     * LGPD (Art. 18), mesmo padrão de `AlertRepository.findAllByUser`.
     *
     * @param userId - Id do usuário dono dos alertas.
     * @returns Todos os alertas do usuário.
     */
    async findAllByUser(userId: string): Promise<DemandAlertResponse[]> {
        return this.prisma.demandAlert.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        })
    }

    /**
     * Todos os alertas habilitados — lidos a cada tick pelo
     * `DemandAlertScheduler` (1x/minuto, sem cache em memória: diferente do
     * `AlertEvaluator`, que avalia por amostra, uma query direta por tick
     * é simples o bastante aqui).
     *
     * @returns Todos os alertas habilitados.
     */
    async findAllEnabled(): Promise<DemandAlertResponse[]> {
        return this.prisma.demandAlert.findMany({ where: { enabled: true } })
    }

    /**
     * Cria um alerta.
     *
     * @param userId - Id do usuário dono do alerta.
     * @param data - Dados já validados do alerta.
     * @returns O alerta criado.
     */
    async create(userId: string, data: CreateDemandAlertInput): Promise<DemandAlertResponse> {
        return this.prisma.demandAlert.create({
            data: {
                userId,
                meterId: data.meterId,
                name: data.name,
                thresholdPercent: data.thresholdPercent,
                enabled: data.enabled ?? true,
            },
        })
    }

    /**
     * Atualiza um alerta, ignorando campos `undefined` do input. Usado tanto
     * pelo CRUD do titular (`UpdateDemandAlertInput`) quanto pelo
     * `DemandAlertScheduler` para persistir `lastNotifiedPeriodStart` após
     * disparar uma notificação.
     *
     * @param id - Id do alerta.
     * @param data - Campos já validados a atualizar.
     * @returns O alerta atualizado.
     */
    async update(
        id: string,
        data: UpdateDemandAlertInput | { lastNotifiedPeriodStart: Date },
    ): Promise<DemandAlertResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        return this.prisma.demandAlert.update({ where: { id }, data: cleanData })
    }

    /**
     * Remove um alerta.
     *
     * @param id - Id do alerta.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.demandAlert.delete({ where: { id } })
    }
}
