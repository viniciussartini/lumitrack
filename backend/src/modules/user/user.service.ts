import bcrypt from "bcryptjs"
import { createUserSchema, updateUserSchema } from "@/modules/user/user.schema.js"
import type { UserRepository } from "@/modules/user/user.repository.js"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { CURRENT_CONSENT_VERSION } from "@/shared/legal/consentVersion.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"

// Custo do bcrypt: quanto maior, mais lento o hash (e mais seguro).
// 12 é um bom equilíbrio entre segurança e performance.
const BCRYPT_ROUNDS = 12

// Mesma mensagem para os 3 conflitos de unicidade do cadastro
// (e-mail/CPF/CNPJ), sem distinguir qual documento colidiu: mensagens
// específicas ("CPF já cadastrado") permitem a um visitante sondar, um por
// um, se um CPF/CNPJ/e-mail alheio já tem conta — minimização análoga à já
// aplicada em forgotPassword (auth.service.ts), que nunca revela se o
// e-mail existe.
const REGISTRATION_CONFLICT_MESSAGE = "Já existe uma conta cadastrada com os dados informados"

// Dispara o pedido de troca de e-mail — plano fino injetado no construtor,
// mesma "tomada elétrica" que o resto do service já usa, para
// UserService não importar EmailChangeService/AuthRepository (módulo
// diferente) diretamente. Ver user.routes.ts para a instância real.
// Dispara o pedido de troca de e-mail — plano fino injetado no construtor,
// mesma "tomada elétrica" que o resto do service já usa, para
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

/** Regras de negócio de contas de usuário — cadastro, consulta, atualização (incl. troca de e-mail com reautenticação) e exclusão, com proteção especial das contas de demonstração. */
export class UserService {
    /**
     * @param userRepository - Acesso a contas de usuário persistidas.
     * @param registrationEnabled - Liga/desliga o cadastro público de novas contas. Injetado (não lido de `env` direto aqui) para o guard ficar testável sem mockar módulo — mesma "tomada elétrica" de DI que o resto do service já usa para o repository. Default `true` aqui é escolha consciente sob a ADR-0014, não o mesmo fail-closed do `env.ts`: o único composition root real (`user.routes.ts`) sempre injeta `env.REGISTRATION_ENABLED` explicitamente, então este default só afeta quem instanciar `UserService` sem o 2º argumento — hoje, só a suíte de testes (preserva o comportamento dos testes existentes que não são sobre este guard).
     * @param requestEmailChange - Dispara o pedido de troca de e-mail. Plano fino injetado no construtor para UserService não importar EmailChangeService/AuthRepository (módulo diferente) diretamente.
     */
    constructor(
        private readonly userRepository: UserRepository,
        private readonly registrationEnabled: boolean = true,
        private readonly requestEmailChange: RequestEmailChangeFn = throwRequestEmailChangeNotConfigured,
    ) {}

    /**
     * Cadastra uma nova conta, checando antes que o cadastro público esteja
     * habilitado e que e-mail/CPF/CNPJ ainda não tenham conta associada.
     *
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns A conta criada.
     */
    async createUser(input: unknown) {
        // ADR-0008: cadastro público fechado é a premissa de que o ambiente
        // de demo não trata dado pessoal real. Falha fechada, antes de
        // qualquer validação de payload.
        if (!this.registrationEnabled) {
            throw new ForbiddenError("Cadastro de novas contas está desabilitado neste ambiente")
        }

        // acceptedTerms é apenas um sinal de aceite — não é uma coluna do banco.
        // O que persiste é o registro do consentimento (consentedAt/consentVersion).
        const { acceptedTerms: _acceptedTerms, ...data } = parseOrThrow(createUserSchema, input)

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

    /**
     * Busca uma conta pelo id.
     *
     * @param id - Id da conta.
     * @returns A conta, se existir.
     */
    async findById(id: string) {
        const user = await this.userRepository.findById(id)

        if (!user) {
            throw new NotFoundError("Usuário não encontrado")
        }

        return user
    }

    /**
     * Atualiza os dados da conta, tratando a troca de e-mail como um fluxo
     * à parte (exige reautenticação e só é efetivada quando confirmada) e
     * bloqueando qualquer escrita sobre uma conta de demonstração.
     *
     * @param id - Id da conta a atualizar.
     * @param input - Corpo bruto da requisição, validado aqui.
     * @returns A conta atualizada.
     */
    async updateUser(id: string, input: unknown) {
        const existing = await this.userRepository.findById(id)

        if (!existing) {
            throw new NotFoundError("Usuário não encontrado")
        }

        // Contas de demonstração são somente leitura (ADR-0008): as
        // credenciais são fixas e conhecidas publicamente — sem essa
        // restrição, quem loga na conta demo poderia trocar o e-mail e
        // sequestrá-la permanentemente.
        if (DEMO_ACCOUNT_EMAILS.has(existing.email)) {
            throw new ForbiddenError("Conta de demonstração é somente leitura")
        }

        // `email`/`currentPassword` nunca vão para userRepository.update —
        // o e-mail só é efetivado quando a troca é confirmada, nunca
        // diretamente aqui; os demais campos (nome etc.) persistem
        // normalmente, tratado ou não o e-mail nesta chamada.
        const { email, currentPassword, ...restData } = parseOrThrow(updateUserSchema, input)

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

    /**
     * Remove a conta, bloqueando a exclusão de uma conta de demonstração.
     *
     * @param id - Id da conta a remover.
     */
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
