import {
    toPublicGoal,
    type GoalPublicRecord,
    type GoalRecord,
    type GoalRepository,
} from "@/modules/goal/goal.repository.js"
import {
    REFERENCE_BEFORE_YEAR_MESSAGE,
    createGoalBodySchema,
    goalIdParamsSchema,
    listGoalsQuerySchema,
    updateGoalBodySchema,
} from "@/modules/goal/goal.schema.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import type { Paginated } from "@/shared/pagination.js"
import { toSaoPauloLocal } from "@/shared/time/localTime.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"

/** Meta como a API a devolve: sem o `userId` do dono nem as marcas internas dos avisos. */
export type GoalResponse = GoalPublicRecord

const PAST_GOAL_MESSAGE = "Metas de anos anteriores não podem ser alteradas nem excluídas"

/**
 * CRUD das metas anuais de consumo. A posse da propriedade é conferida em
 * toda escrita e a imutabilidade das metas de ano passado é imposta aqui, não
 * só na tela.
 */
export class GoalService {
    /**
     * @param goalRepository - Persistência das metas.
     * @param propertyRepository - Confirma que a propriedade existe e é do usuário.
     * @param now - Relógio injetável, para os testes fixarem "agora" (e a virada do ano).
     */
    constructor(
        private readonly goalRepository: GoalRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Cria a meta de um ano para uma propriedade do usuário.
     *
     * @param userId - Id do usuário autenticado.
     * @param body - Corpo bruto, validado aqui.
     * @returns A meta criada.
     * @throws {NotFoundError} Propriedade inexistente ou de outro usuário — indistinguíveis de propósito.
     * @throws {ValidationError} Ano anterior ao corrente.
     * @throws {ConflictError} A propriedade já tem meta nesse ano.
     */
    async create(userId: string, body: unknown): Promise<GoalResponse> {
        const data = parseOrThrow(createGoalBodySchema, body)
        await this.assertOwnsProperty(userId, data.propertyId)

        if (data.year < this.currentYear()) {
            throw new ValidationError("Não é possível criar meta para um ano que já passou")
        }

        const created = await this.goalRepository.create(userId, data)
        if (!created) {
            throw new ConflictError("Esta propriedade já tem uma meta para esse ano")
        }
        return this.toResponse(created)
    }

    /**
     * Metas de uma propriedade, do ano mais recente para o mais antigo.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta (`propertyId`, `page`, `pageSize`), validada aqui.
     * @returns Página de metas; vazia se a propriedade não é do usuário.
     */
    async list(userId: string, query: unknown): Promise<Paginated<GoalResponse>> {
        const { propertyId, ...pagination } = parseOrThrow(listGoalsQuerySchema, query)
        const page = await this.goalRepository.findAllByPropertyPaginated(
            userId,
            propertyId,
            pagination,
        )
        return { ...page, items: page.items.map((item) => this.toResponse(item)) }
    }

    /**
     * Substitui os valores editáveis de uma meta do ano corrente ou de um ano futuro.
     *
     * @param userId - Id do usuário autenticado.
     * @param params - Parâmetros de rota brutos (`id`), validados aqui.
     * @param body - Corpo bruto, validado aqui.
     * @returns A meta atualizada.
     * @throws {NotFoundError} Meta inexistente ou de outro usuário — indistinguíveis de propósito.
     * @throws {ConflictError} Meta de ano passado.
     * @throws {ValidationError} Ano de referência que não é anterior ao ano da meta.
     */
    async update(userId: string, params: unknown, body: unknown): Promise<GoalResponse> {
        const { id } = parseOrThrow(goalIdParamsSchema, params)
        const data = parseOrThrow(updateGoalBodySchema, body)

        const existing = await this.getEditableGoal(id, userId)
        if (data.referenceYear >= existing.year) {
            throw new ValidationError(REFERENCE_BEFORE_YEAR_MESSAGE)
        }

        const updated = await this.goalRepository.update(id, userId, data)
        if (!updated) throw new NotFoundError("Meta não encontrada")
        return this.toResponse(updated)
    }

    /**
     * Exclui uma meta do ano corrente ou de um ano futuro.
     *
     * @param userId - Id do usuário autenticado.
     * @param params - Parâmetros de rota brutos (`id`), validados aqui.
     * @throws {NotFoundError} Meta inexistente ou de outro usuário — indistinguíveis de propósito.
     * @throws {ConflictError} Meta de ano passado.
     */
    async remove(userId: string, params: unknown): Promise<void> {
        const { id } = parseOrThrow(goalIdParamsSchema, params)
        await this.getEditableGoal(id, userId)

        const deleted = await this.goalRepository.deleteByIdAndUser(id, userId)
        if (!deleted) throw new NotFoundError("Meta não encontrada")
    }

    private async assertOwnsProperty(userId: string, propertyId: string): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)
        if (property?.userId !== userId) throw new NotFoundError("Propriedade não encontrada")
    }

    private async getEditableGoal(id: string, userId: string): Promise<GoalRecord> {
        const goal = await this.goalRepository.findByIdAndUser(id, userId)
        if (!goal) throw new NotFoundError("Meta não encontrada")
        if (goal.year < this.currentYear()) throw new ConflictError(PAST_GOAL_MESSAGE)
        return goal
    }

    // Ano civil de São Paulo: a meta vigora de 1º de janeiro a 31 de dezembro
    // no horário local, não no UTC.
    private currentYear(): number {
        return toSaoPauloLocal(this.now()).getUTCFullYear()
    }

    private toResponse(record: GoalRecord): GoalResponse {
        return toPublicGoal(record)
    }
}
