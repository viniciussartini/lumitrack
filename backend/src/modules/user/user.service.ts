import bcrypt from "bcryptjs"
import { z } from "zod"
import { createUserSchema, updateUserSchema } from "@/modules/user/user.schema.js"
import type { UserRepository } from "@/modules/user/user.repository.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import { CURRENT_CONSENT_VERSION } from "@/shared/legal/consentVersion.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"

// Custo do bcrypt: quanto maior, mais lento o hash (e mais seguro).
// 12 é um bom equilíbrio entre segurança e performance.
const BCRYPT_ROUNDS = 12

// Issue #181 — mesma mensagem para os 3 conflitos de unicidade do cadastro
// (e-mail/CPF/CNPJ), sem distinguir qual documento colidiu: mensagens
// específicas ("CPF já cadastrado") permitem a um visitante sondar, um por
// um, se um CPF/CNPJ/e-mail alheio já tem conta — minimização análoga à já
// aplicada em forgotPassword (auth.service.ts), que nunca revela se o
// e-mail existe.
const REGISTRATION_CONFLICT_MESSAGE = "Já existe uma conta cadastrada com os dados informados"

// Dispara o pedido de troca de e-mail (issue #178) — plano fino injetado no
// construtor, mesma "tomada elétrica" que o resto do service já usa, para
// UserService não importar EmailChangeService/AuthRepository (módulo
// diferente) diretamente. Ver user.routes.ts para a instância real.
export type RequestEmailChangeFn = (params: {
    userId: string
    oldEmail: string
    newEmail: string
}) => Promise<void>

// Default falha fechado, não um no-op silencioso: se algum composition
// root esquecer de conectar essa dependência, uma troca de e-mail real
// bateria aqui e retornaria 200 sem nunca enviar e-mail nenhum — pior do
// que simplesmente quebrar alto (CLAUDE.md: "falhar fechado"). Chamadores
// que nunca trocam e-mail (a maioria dos testes) nunca alcançam este ramo.
const throwRequestEmailChangeNotConfigured: RequestEmailChangeFn = async () => {
    throw new Error("UserService: requestEmailChange não foi configurado")
}

export class UserService {
    // `registrationEnabled` é injetado (não lido de `env` direto aqui) para
    // o guard ficar testável sem mockar módulo — mesma "tomada elétrica"
    // de DI que o resto do service já usa para o repository. Default `true`
    // preserva o comportamento de todo chamador existente.
    constructor(
        private readonly userRepository: UserRepository,
        private readonly registrationEnabled: boolean = true,
        private readonly requestEmailChange: RequestEmailChangeFn = throwRequestEmailChangeNotConfigured,
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
            throw new ConflictError(REGISTRATION_CONFLICT_MESSAGE)
        }

        if (data.userType === "INDIVIDUAL" && data.cpf) {
            const existingCpf = await this.userRepository.findByCpf(data.cpf)

            if (existingCpf) {
                throw new ConflictError(REGISTRATION_CONFLICT_MESSAGE)
            }
        }

        if (data.userType === "COMPANY" && data.cnpj) {
            const existingCnpj = await this.userRepository.findByCnpj(data.cnpj)

            if (existingCnpj) {
                throw new ConflictError(REGISTRATION_CONFLICT_MESSAGE)
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

        // `email`/`currentPassword` nunca vão para userRepository.update —
        // o e-mail só é efetivado quando a troca é confirmada (issue #178),
        // nunca diretamente aqui; os demais campos (nome etc.) persistem
        // normalmente, tratado ou não o e-mail nesta chamada.
        const { email, currentPassword, ...restData } = parsed.data

        if (email && email !== existing.email) {
            // Reautenticação (A07): sem isso, uma sessão sequestrada podia
            // trocar o e-mail e, em seguida, disparar o forgot-password no
            // endereço novo — cadeia completa de tomada de conta.
            if (!currentPassword) {
                throw new ValidationError("Senha atual é obrigatória para alterar o e-mail")
            }

            const withPassword = await this.userRepository.findByIdWithPassword(id)
            const isValidPassword = withPassword
                ? await bcrypt.compare(currentPassword, withPassword.password)
                : false

            if (!isValidPassword) {
                throw new UnauthorizedError("Senha atual incorreta")
            }

            const emailConflict = await this.userRepository.findByEmail(email)

            if (emailConflict) {
                throw new ConflictError("E-mail já cadastrado")
            }

            await this.requestEmailChange({ userId: id, oldEmail: existing.email, newEmail: email })
        }

        return this.userRepository.update(id, restData)
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
