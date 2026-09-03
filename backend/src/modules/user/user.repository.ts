import { PrismaClient, Prisma } from "@/generated/prisma/client.js"
import type { CreateUserInput, UpdateUserInput } from "@/modules/user/user.schema.js"
import { encrypt, decrypt } from "@/shared/crypto/encryption.js"
import { generateBlindIndex } from "@/shared/crypto/blindIndex.js"

export type UserWithoutPassword = Omit<
    Awaited<ReturnType<PrismaClient["user"]["findUniqueOrThrow"]>>,
    "password" | "cpfBlindIndex" | "cnpjBlindIndex" | "mfaSecret"
>

// cpf/cnpj ficam criptografados em repouso (AES-256-GCM — ver
// shared/crypto/encryption.ts). Decifrar aqui, na borda do repository, é o
// que permite que o resto da aplicação (service, controller, frontend)
// continue lidando com o valor em texto claro exatamente como antes da criptografia.
function decryptSensitiveFields<T extends { cpf: string | null; cnpj: string | null }>(user: T): T {
    return {
        ...user,
        cpf: user.cpf ? decrypt(user.cpf) : user.cpf,
        cnpj: user.cnpj ? decrypt(user.cnpj) : user.cnpj,
    }
}

// cpfBlindIndex/cnpjBlindIndex nunca saem do repository — são detalhe de
// implementação interno (HMAC usado só para igualdade/unicidade no banco),
// omitidos de toda leitura junto com a senha. mfaSecret (mesmo cifrado)
// também nunca é exposto fora do módulo auth, que é quem decifra/verifica
// — só mfaEnabled (não sensível) é exposto normalmente.
const READ_OMIT = {
    password: true,
    cpfBlindIndex: true,
    cnpjBlindIndex: true,
    mfaSecret: true,
} as const

/** Acesso a contas de usuário persistidas — decifra CPF/CNPJ na borda e nunca expõe senha, blind index ou segredo de MFA fora deste módulo. */
export class UserRepository {
    /**
     * @param prisma - Cliente Prisma usado para acessar a tabela de usuários. Recebido pelo construtor (não instanciado aqui dentro) para que os testes possam passar o prismaTest (banco de testes) sem nenhuma alteração no código.
     */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um usuário pelo e-mail, sem os campos sensíveis internos
     * (senha, blind index, segredo de MFA).
     *
     * @param email - E-mail da conta.
     * @returns O usuário, com CPF/CNPJ decifrados, ou `null` se não existir.
     */
    async findByEmail(email: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    /**
     * Busca um usuário pelo e-mail incluindo a senha com hash — usado
     * exclusivamente pelo fluxo de autenticação.
     *
     * @param email - E-mail da conta.
     * @returns O usuário com senha, CPF/CNPJ decifrados, ou `null` se não existir.
     */
    async findByEmailWithPassword(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            omit: { cpfBlindIndex: true, cnpjBlindIndex: true },
        })
        return user && decryptSensitiveFields(user)
    }

    /**
     * Busca só id e senha com hash de um usuário — usado para verificar a
     * senha atual antes de aceitar troca de e-mail (sem cpf/cnpj no
     * select, então sem necessidade de decrypt).
     *
     * @param id - Id do usuário.
     * @returns Id e senha com hash, ou `null` se não existir.
     */
    async findByIdWithPassword(id: string): Promise<{ id: string; password: string } | null> {
        return this.prisma.user.findUnique({
            where: { id },
            select: { id: true, password: true },
        })
    }

    /**
     * Busca um usuário pelo CPF em texto claro (ex.: vindo do form de
     * cadastro), traduzindo-o para o blind index antes de consultar — não
     * é possível buscar pela coluna `cpf` diretamente porque ela guarda
     * ciphertext com IV aleatório (nunca repete, mesmo para o mesmo CPF).
     *
     * @param cpf - CPF em texto claro.
     * @returns O usuário, com CPF/CNPJ decifrados, ou `null` se não existir.
     */
    async findByCpf(cpf: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { cpfBlindIndex: generateBlindIndex(cpf) },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    /**
     * Busca um usuário pelo CNPJ em texto claro, traduzindo-o para o
     * blind index antes de consultar — mesmo raciocínio de {@link findByCpf}.
     *
     * @param cnpj - CNPJ em texto claro.
     * @returns O usuário, com CPF/CNPJ decifrados, ou `null` se não existir.
     */
    async findByCnpj(cnpj: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { cnpjBlindIndex: generateBlindIndex(cnpj) },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    /**
     * Busca um usuário pelo id, sem os campos sensíveis internos.
     *
     * @param id - Id do usuário.
     * @returns O usuário, com CPF/CNPJ decifrados, ou `null` se não existir.
     */
    async findById(id: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    /**
     * Cria um usuário, cifrando CPF/CNPJ e derivando os respectivos blind
     * index antes de persistir.
     *
     * @param data - Dados do usuário a criar, já validados, com a senha já com hash e o consentimento já resolvido.
     * @returns O usuário criado, com CPF/CNPJ decifrados.
     */
    async create(
        data: Omit<CreateUserInput, "acceptedTerms"> & {
            password: string
            consentedAt: Date
            consentVersion: string
        },
    ): Promise<UserWithoutPassword> {
        const { cpf, cnpj, ...rest } = data

        const cleanData = Object.fromEntries(
            Object.entries({
                ...rest,
                cpf: cpf ? encrypt(cpf) : cpf,
                cpfBlindIndex: cpf ? generateBlindIndex(cpf) : undefined,
                cnpj: cnpj ? encrypt(cnpj) : cnpj,
                cnpjBlindIndex: cnpj ? generateBlindIndex(cnpj) : undefined,
            }).filter(([, value]) => value !== undefined),
        )

        const user = await this.prisma.user.create({
            data: cleanData as unknown as Prisma.UserCreateInput,
            omit: READ_OMIT,
        })

        return decryptSensitiveFields(user)
    }

    /**
     * Atualiza os campos informados de um usuário.
     *
     * @param id - Id do usuário a atualizar.
     * @param data - Campos a atualizar, já validados.
     * @returns O usuário atualizado, com CPF/CNPJ decifrados.
     */
    async update(id: string, data: UpdateUserInput): Promise<UserWithoutPassword> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        const user = await this.prisma.user.update({
            where: { id },
            data: cleanData as Prisma.UserUpdateInput,
            omit: READ_OMIT,
        })

        return decryptSensitiveFields(user)
    }

    /**
     * Remove um usuário definitivamente.
     *
     * @param id - Id do usuário a remover.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.user.delete({
            where: { id },
        })
    }
}
