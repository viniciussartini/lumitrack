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

    // Regra cruzada de demanda contratada por modalidade (dentro do Grupo A):
    // Azul usa duas demandas (ponta/fora de ponta), demanda única (Verde,
    // Convencional Binômia) usa uma só — os dois formatos são mutuamente
    // exclusivos, nunca os dois preenchidos nem os dois vazios.
    private resolveContractedDemandFields(fields: {
        tariffModality: TariffModality
        contractedDemandKw: number | undefined
        contractedDemandPeakKw: number | undefined
        contractedDemandOffPeakKw: number | undefined
    }): Pick<
        ResolvedTariffGroupFields,
        "contractedDemandKw" | "contractedDemandPeakKw" | "contractedDemandOffPeakKw"
    > {
        if (fields.tariffModality === "BLUE") {
            if (fields.contractedDemandPeakKw === undefined) {
                throw new ValidationError(
                    "Demanda contratada na ponta é obrigatória para a modalidade Azul",
                )
            }
            if (fields.contractedDemandOffPeakKw === undefined) {
                throw new ValidationError(
                    "Demanda contratada fora de ponta é obrigatória para a modalidade Azul",
                )
            }
            if (fields.contractedDemandKw !== undefined) {
                throw new ValidationError(
                    "Demanda contratada única não se aplica à modalidade Azul",
                )
            }
            return {
                contractedDemandKw: null,
                contractedDemandPeakKw: fields.contractedDemandPeakKw,
                contractedDemandOffPeakKw: fields.contractedDemandOffPeakKw,
            }
        }

        if (fields.contractedDemandKw === undefined) {
            throw new ValidationError(
                "Demanda contratada é obrigatória para propriedades do Grupo A",
            )
        }
        if (
            fields.contractedDemandPeakKw !== undefined ||
            fields.contractedDemandOffPeakKw !== undefined
        ) {
            throw new ValidationError(
                "Demanda contratada por posto (ponta/fora de ponta) só se aplica à modalidade Azul",
            )
        }
        return {
            contractedDemandKw: fields.contractedDemandKw,
            contractedDemandPeakKw: null,
            contractedDemandOffPeakKw: null,
        }
    }

    // Regra cruzada por grupo tarifário (ADR-0019): Grupo A exige
    // subgrupo+modalidade+demanda contratada e não aceita classe de
    // faturamento Grupo B; Grupo B exige classe de faturamento (default B1,
    // preservando o comportamento anterior à Fase 19) e não aceita
    // subgrupo/modalidade/demanda do Grupo A. O schema sozinho (campos
    // individualmente opcionais) não expressa essa obrigatoriedade
    // condicional — mesmo padrão de validação cruzada em serviço já usado
    // para a posse exclusiva do Medidor (`meter.service.ts`), não no schema.
    private resolveTariffGroupFields(fields: {
        tariffGroup: "GROUP_A" | "GROUP_B"
        billingClass: BillingClass | undefined
        tariffSubgroup: TariffSubgroup | undefined
        tariffModality: TariffModality | undefined
        contractedDemandKw: number | undefined
        contractedDemandPeakKw: number | undefined
        contractedDemandOffPeakKw: number | undefined
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
            const contractedDemandFields = this.resolveContractedDemandFields({
                tariffModality: fields.tariffModality,
                contractedDemandKw: fields.contractedDemandKw,
                contractedDemandPeakKw: fields.contractedDemandPeakKw,
                contractedDemandOffPeakKw: fields.contractedDemandOffPeakKw,
            })
            return {
                billingClass: null,
                tariffSubgroup: fields.tariffSubgroup,
                tariffModality: fields.tariffModality,
                ...contractedDemandFields,
            }
        }

        if (fields.tariffSubgroup) {
            throw new ValidationError("Subgrupo só se aplica a propriedades do Grupo A")
        }
        if (fields.tariffModality) {
            throw new ValidationError("Modalidade tarifária só se aplica a propriedades do Grupo A")
        }
        if (fields.contractedDemandKw !== undefined) {
            throw new ValidationError("Demanda contratada só se aplica a propriedades do Grupo A")
        }
        if (
            fields.contractedDemandPeakKw !== undefined ||
            fields.contractedDemandOffPeakKw !== undefined
        ) {
            throw new ValidationError(
                "Demanda contratada por posto só se aplica a propriedades do Grupo A",
            )
        }
        return {
            billingClass: fields.billingClass ?? "B1",
            tariffSubgroup: null,
            tariffModality: null,
            contractedDemandKw: null,
            contractedDemandPeakKw: null,
            contractedDemandOffPeakKw: null,
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
            contractedDemandKw: data.contractedDemandKw,
            contractedDemandPeakKw: data.contractedDemandPeakKw,
            contractedDemandOffPeakKw: data.contractedDemandOffPeakKw,
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
    // algum dos 6 campos envolvidos — trocar só o nome, por exemplo, não deve
    // exigir reenviar subgrupo/modalidade/classe/demanda já existentes.
    private touchesTariffGroupFields(data: UpdatePropertyInput): boolean {
        return (
            data.tariffGroup !== undefined ||
            data.billingClass !== undefined ||
            data.tariffSubgroup !== undefined ||
            data.tariffModality !== undefined ||
            data.contractedDemandKw !== undefined ||
            data.contractedDemandPeakKw !== undefined ||
            data.contractedDemandOffPeakKw !== undefined
        )
    }

    // As 3 demandas (kw único, ponta, fora-ponta) só podem ser carregadas do
    // que já estava gravado quando a modalidade também não mudou — o formato
    // de demanda é definido pela modalidade (Azul usa 2 campos, as demais
    // usam 1), então trocar de modalidade sem reenviar a demanda no novo
    // formato falha fechado em vez de misturar valores do formato anterior
    // (mesma classe de bug que o formulário do frontend já corrige ao trocar
    // de grupo tarifário).
    private keepsExistingModality(
        data: UpdatePropertyInput,
        existing: PropertyResponse,
        keepsExistingGroup: boolean,
    ): boolean {
        if (!keepsExistingGroup) {
            return false
        }
        const resolvedModality = data.tariffModality ?? existing.tariffModality ?? undefined
        return resolvedModality === existing.tariffModality
    }

    private resolveUpdateTariffGroupFields(
        data: UpdatePropertyInput,
        existing: PropertyResponse,
    ): ResolvedTariffGroupFields | undefined {
        if (!this.touchesTariffGroupFields(data)) {
            return undefined
        }

        const resolvedGroup = data.tariffGroup ?? existing.tariffGroup
        const keepsExistingGroup = resolvedGroup === existing.tariffGroup
        const keepsExistingModality = this.keepsExistingModality(data, existing, keepsExistingGroup)

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
            contractedDemandKw: this.carryOverIfSameGroup(
                data.contractedDemandKw,
                existing.contractedDemandKw,
                keepsExistingModality,
            ),
            contractedDemandPeakKw: this.carryOverIfSameGroup(
                data.contractedDemandPeakKw,
                existing.contractedDemandPeakKw,
                keepsExistingModality,
            ),
            contractedDemandOffPeakKw: this.carryOverIfSameGroup(
                data.contractedDemandOffPeakKw,
                existing.contractedDemandOffPeakKw,
                keepsExistingModality,
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
