import bcrypt from "bcryptjs"
import { z } from "zod"
import { createUserSchema, updateUserSchema } from "@/modules/user/user.schema.js"
import type { UserRepository } from "@/modules/user/user.repository.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import { CURRENT_CONSENT_VERSION } from "@/shared/legal/consentVersion.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"

// Custo do bcrypt: quanto maior, mais lento o hash (e mais seguro).
// 12 é um bom equilíbrio entre segurança e performance.
const BCRYPT_ROUNDS = 12

export class UserService {
    // `registrationEnabled` é injetado (não lido de `env` direto aqui) para
    // o guard ficar testável sem mockar módulo — mesma "tomada elétrica"
    // de DI que o resto do service já usa para o repository. Default `true`
    // preserva o comportamento de todo chamador existente.
    constructor(
        private readonly userRepository: UserRepository,
        private readonly registrationEnabled: boolean = true,
    ) {}

    async createUser(input: unknown) {
        // ADR-0008: cadastro público fechado é a premissa de que o ambiente
        // de demo não trata dado pessoal real. Falha fechada, antes de
        // qualquer validação de payload.
        if (!this.registrationEnabled) {
            throw new ForbiddenError("Cadastro de novas contas está desabilitado neste ambiente")
        }

        const parsed = createUserSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        // acceptedTerms é apenas um sinal de aceite — não é uma coluna do banco.
        // O que persiste é o registro do consentimento (consentedAt/consentVersion).
        const { acceptedTerms: _acceptedTerms, ...data } = parsed.data

        const existingEmail = await this.userRepository.findByEmail(data.email)

        if (existingEmail) {
            throw new ConflictError("E-mail já cadastrado")
        }

        if (data.userType === "INDIVIDUAL" && data.cpf) {
            const existingCpf = await this.userRepository.findByCpf(data.cpf)

            if (existingCpf) {
                throw new ConflictError("CPF já cadastrado")
            }
        }

        if (data.userType === "COMPANY" && data.cnpj) {
            const existingCnpj = await this.userRepository.findByCnpj(data.cnpj)

            if (existingCnpj) {
                throw new ConflictError("CNPJ já cadastrado")
            }
        }

        const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

        return this.userRepository.create({
            ...data,
            password: hashedPassword,
            consentedAt: new Date(),
            consentVersion: CURRENT_CONSENT_VERSION,
        })
    }

    async findById(id: string) {
        const user = await this.userRepository.findById(id)

        if (!user) {
            throw new NotFoundError("Usuário não encontrado")
        }

        return user
    }

    async updateUser(id: string, input: unknown) {
        const existing = await this.userRepository.findById(id)

        if (!existing) {
            throw new NotFoundError("Usuário não encontrado")
        }

        // Contas de demonstração são somente leitura (ADR-0008 + achado de
        // segurança "credenciais demo hardcoded") — sem isso, quem loga na
        // conta demo pode trocar o e-mail e sequestrá-la permanentemente.
        if (DEMO_ACCOUNT_EMAILS.has(existing.email)) {
            throw new ForbiddenError("Conta de demonstração é somente leitura")
        }

        const parsed = updateUserSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        if (data.email && data.email !== existing.email) {
            const emailConflict = await this.userRepository.findByEmail(data.email)

            if (emailConflict) {
                throw new ConflictError("E-mail já cadastrado")
            }
        }

        return this.userRepository.update(id, data)
    }

    async deleteUser(id: string): Promise<void> {
        const existing = await this.userRepository.findById(id)

        if (!existing) {
            throw new NotFoundError("Usuário não encontrado")
        }

        // Mesma proteção de somente-leitura do updateUser — deletar
        // continua sendo uma escrita destrutiva sobre a conta pública.
        if (DEMO_ACCOUNT_EMAILS.has(existing.email)) {
            throw new ForbiddenError("Conta de demonstração é somente leitura")
        }

        await this.userRepository.delete(id)
    }
}
