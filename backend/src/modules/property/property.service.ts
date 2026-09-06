import { createPropertySchema, updatePropertySchema } from "@/modules/property/property.schema.js"
import type { UpdatePropertyInput } from "@/modules/property/property.schema.js"
import type {
    PropertyRepository,
    PropertyResponse,
    ResolvedTariffGroupFields,
} from "@/modules/property/property.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { BillingClass, TariffModality, TariffSubgroup } from "@/generated/prisma/client.js"
import { NotFoundError, ForbiddenError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { paginationQuerySchema, type Paginated } from "@/shared/pagination.js"

/** Regras de negócio de imóveis — ownership do titular e existência da distribuidora vinculada. */
export class PropertyService {
    /**
     * @param propertyRepository - Acesso a imóveis persistidos.
     * @param distributorRepository - Usado para validar que o distributorId informado existe no catálogo global (distribuidora não tem dono — é um catálogo somente leitura compartilhado).
     */
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
    ) {}

    private async validateDistributorExists(distributorId: string): Promise<void> {
        const exists = await this.distributorRepository.exists(distributorId)

        if (!exists) {
            throw new NotFoundError("Distribuidora não encontrada")
        }
    }

    // Regra cruzada por grupo tarifário (RF25/ADR-0019): Grupo A exige
    // subgrupo+modalidade e não aceita classe de faturamento Grupo B; Grupo B
    // exige classe de faturamento (default B1, preservando o comportamento
    // anterior à Fase 19) e não aceita subgrupo/modalidade do Grupo A. O
    // schema sozinho (campos individualmente opcionais) não expressa essa
    // obrigatoriedade condicional — mesmo padrão de RN01 do Medidor
    // (meter.service.ts).
    private resolveTariffGroupFields(fields: {
        tariffGroup: "GROUP_A" | "GROUP_B"
        billingClass: BillingClass | undefined
        tariffSubgroup: TariffSubgroup | undefined
        tariffModality: TariffModality | undefined
    }): ResolvedTariffGroupFields {
        if (fields.tariffGroup === "GROUP_A") {
            if (!fields.tariffSubgroup) {
                throw new ValidationError("Subgrupo é obrigatório para propriedades do Grupo A")
            }
            if (!fields.tariffModality) {
                throw new ValidationError(
                    "Modalidade tarifária é obrigatória para propriedades do Grupo A",
                )
            }
            if (fields.billingClass) {
                throw new ValidationError(
                    "Classe de faturamento não se aplica a propriedades do Grupo A",
                )
            }
            return {
                billingClass: null,
                tariffSubgroup: fields.tariffSubgroup,
                tariffModality: fields.tariffModality,
            }
        }

        if (fields.tariffSubgroup) {
            throw new ValidationError("Subgrupo só se aplica a propriedades do Grupo A")
        }
        if (fields.tariffModality) {
            throw new ValidationError("Modalidade tarifária só se aplica a propriedades do Grupo A")
        }
        return {
            billingClass: fields.billingClass ?? "B1",
            tariffSubgroup: null,
            tariffModality: null,
        }
    }

    /**
     * Cria um imóvel do titular, validando antes que a distribuidora
     * informada exista no catálogo.
     *
     * @param userId - Id do usuário dono do imóvel.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O imóvel criado.
     */
    async create(userId: string, input: unknown): Promise<PropertyResponse> {
        const data = parseOrThrow(createPropertySchema, input)

        await this.validateDistributorExists(data.distributorId)

        const tariffGroupFields = this.resolveTariffGroupFields({
            tariffGroup: data.tariffGroup,
            billingClass: data.billingClass,
            tariffSubgroup: data.tariffSubgroup,
            tariffModality: data.tariffModality,
        })

        return this.propertyRepository.create(userId, data, tariffGroupFields)
    }

    /**
     * Busca um imóvel garantindo que ele pertence ao usuário requisitante.
     *
     * @param id - Id do imóvel.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     * @returns O imóvel, se existir e pertencer ao requisitante.
     */
    async findById(id: string, requestingUserId: string): Promise<PropertyResponse> {
        const property = await this.propertyRepository.findById(id)

        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }

        if (property.userId !== requestingUserId) {
            throw new ForbiddenError("Acesso negado")
        }

        return property
    }

    /**
     * Lista paginada dos imóveis do titular.
     *
     * @param userId - Id do usuário dono dos imóveis.
     * @param query - Query string bruta de paginação, validada aqui.
     * @returns Página de imóveis do usuário.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<PropertyResponse>> {
        const data = parseOrThrow(paginationQuerySchema, query)

        return this.propertyRepository.findAllByUserPaginated(userId, data)
    }

    // Carrega um campo do imóvel existente só quando o grupo tarifário NÃO
    // está mudando — ao trocar de grupo, o campo do grupo anterior deixa de
    // fazer sentido e precisa vir de novo em `data` (nunca do que já estava
    // gravado para o outro grupo).
    private carryOverIfSameGroup<T>(
        newValue: T | undefined,
        existingValue: T | null | undefined,
        keepsExistingGroup: boolean,
    ): T | undefined {
        return newValue ?? (keepsExistingGroup ? (existingValue ?? undefined) : undefined)
    }

    // Só reavalia a regra cruzada de grupo tarifário quando a atualização toca
    // algum dos 4 campos envolvidos — trocar só o nome, por exemplo, não deve
    // exigir reenviar subgrupo/modalidade/classe já existentes.
    private resolveUpdateTariffGroupFields(
        data: UpdatePropertyInput,
        existing: PropertyResponse,
    ): ResolvedTariffGroupFields | undefined {
        const touchesTariffGroup =
            data.tariffGroup !== undefined ||
            data.billingClass !== undefined ||
            data.tariffSubgroup !== undefined ||
            data.tariffModality !== undefined

        if (!touchesTariffGroup) {
            return undefined
        }

        const resolvedGroup = data.tariffGroup ?? existing.tariffGroup
        const keepsExistingGroup = resolvedGroup === existing.tariffGroup

        return this.resolveTariffGroupFields({
            tariffGroup: resolvedGroup,
            billingClass: this.carryOverIfSameGroup(
                data.billingClass,
                existing.billingClass,
                keepsExistingGroup,
            ),
            tariffSubgroup: this.carryOverIfSameGroup(
                data.tariffSubgroup,
                existing.tariffSubgroup,
                keepsExistingGroup,
            ),
            tariffModality: this.carryOverIfSameGroup(
                data.tariffModality,
                existing.tariffModality,
                keepsExistingGroup,
            ),
        })
    }

    /**
     * Atualiza um imóvel do titular, validando ownership e, se a
     * distribuidora for trocada, que a nova distribuidora exista.
     *
     * @param id - Id do imóvel a atualizar.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O imóvel atualizado.
     */
    async update(id: string, requestingUserId: string, input: unknown): Promise<PropertyResponse> {
        const existing = await this.findById(id, requestingUserId)

        const data = parseOrThrow(updatePropertySchema, input)

        if (data.distributorId !== undefined) {
            await this.validateDistributorExists(data.distributorId)
        }

        const tariffGroupFields = this.resolveUpdateTariffGroupFields(data, existing)

        return this.propertyRepository.update(id, data, tariffGroupFields)
    }

    /**
     * Remove um imóvel do titular, validando ownership antes de excluir.
     *
     * @param id - Id do imóvel a remover.
     * @param requestingUserId - Id do usuário autenticado que fez a requisição.
     */
    async delete(id: string, requestingUserId: string): Promise<void> {
        await this.findById(id, requestingUserId)
        await this.propertyRepository.delete(id)
    }
}
