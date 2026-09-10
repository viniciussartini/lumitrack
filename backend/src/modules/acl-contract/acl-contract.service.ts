import {
    createAclContractSchema,
    updateAclContractSchema,
    listAclContractQuerySchema,
} from "@/modules/acl-contract/acl-contract.schema.js"
import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { Paginated } from "@/shared/pagination.js"

/**
 * CRUD de contratos de energia do Mercado Livre (ACL) — cada contrato
 * pertence a uma propriedade já marcada com o ambiente de contratação livre;
 * `propertyId` é imutável após a criação, mesmo padrão de `meterId` em
 * `DemandAlertService`.
 */
export class AclContractService {
    /**
     * @param aclContractRepository - Acesso a contratos persistidos.
     * @param propertyRepository - Usado para validar, na criação, que a propriedade existe, pertence ao usuário e está marcada como ACL.
     */
    constructor(
        private readonly aclContractRepository: AclContractRepository,
        private readonly propertyRepository: PropertyRepository,
    ) {}

    private async getOwnedContract(id: string, userId: string): Promise<AclContractResponse> {
        const contract = await this.aclContractRepository.findById(id)
        if (!contract) {
            throw new NotFoundError("Contrato não encontrado")
        }
        if (contract.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        return contract
    }

    /**
     * Valida que a propriedade existe, pertence ao usuário e já está
     * marcada com o ambiente de contratação livre — sem isso o contrato não
     * teria a que se vincular (a propriedade some do mercado livre não é
     * corrigida por um contrato órfão).
     *
     * @param propertyId - Id da propriedade informada na criação do contrato.
     * @param userId - Id do usuário autenticado.
     */
    private async assertPropertyAcceptsAclContract(
        propertyId: string,
        userId: string,
    ): Promise<void> {
        const property = await this.propertyRepository.findById(propertyId)
        if (!property) {
            throw new NotFoundError("Propriedade não encontrada")
        }
        if (property.userId !== userId) {
            throw new ForbiddenError("Acesso negado")
        }
        if (property.contractingEnvironment !== "ACL") {
            throw new ValidationError(
                "A propriedade precisa estar no ambiente de contratação livre (ACL) para receber um contrato",
            )
        }
    }

    /**
     * Cria um contrato de energia para a propriedade informada.
     *
     * @param userId - Id do usuário autenticado.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O contrato criado.
     */
    async create(userId: string, input: unknown): Promise<AclContractResponse> {
        const data = parseOrThrow(createAclContractSchema, input)
        await this.assertPropertyAcceptsAclContract(data.propertyId, userId)
        return this.aclContractRepository.create(userId, data)
    }

    /**
     * Lista paginada dos contratos do usuário, opcionalmente restrita a uma propriedade.
     *
     * @param userId - Id do usuário autenticado.
     * @param query - Query string bruta de paginação/filtro, validada aqui.
     * @returns Página de contratos do usuário.
     */
    async findAll(userId: string, query: unknown): Promise<Paginated<AclContractResponse>> {
        const data = parseOrThrow(listAclContractQuerySchema, query)
        return this.aclContractRepository.findAllByUserPaginated(userId, data, data.propertyId)
    }

    /**
     * Detalhe de um contrato do titular.
     *
     * @param id - Id do contrato.
     * @param userId - Id do usuário autenticado (dono do contrato).
     * @returns O contrato.
     */
    async findById(id: string, userId: string): Promise<AclContractResponse> {
        return this.getOwnedContract(id, userId)
    }

    /**
     * Atualiza um contrato do titular. `propertyId` é imutável — trocar de
     * propriedade é criar um contrato novo.
     *
     * @param id - Id do contrato.
     * @param userId - Id do usuário autenticado (dono do contrato).
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns O contrato atualizado.
     */
    async update(id: string, userId: string, input: unknown): Promise<AclContractResponse> {
        await this.getOwnedContract(id, userId)
        const data = parseOrThrow(updateAclContractSchema, input)
        return this.aclContractRepository.update(id, data)
    }

    /**
     * Remove um contrato do titular.
     *
     * @param id - Id do contrato.
     * @param userId - Id do usuário autenticado (dono do contrato).
     */
    async delete(id: string, userId: string): Promise<void> {
        await this.getOwnedContract(id, userId)
        await this.aclContractRepository.delete(id)
    }
}
