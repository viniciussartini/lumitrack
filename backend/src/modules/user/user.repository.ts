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
// continue lidando com o valor em texto claro exatamente como antes da #07.
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

export class UserRepository {
    // Injeção de dependência: o PrismaClient é recebido pelo construtor,
    // não instanciado aqui dentro. Isso permite que os testes passem
    // o prismaTest (banco de testes) sem nenhuma alteração no código.
    constructor(private readonly prisma: PrismaClient) {}

    async findByEmail(email: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    async findByEmailWithPassword(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            omit: { cpfBlindIndex: true, cnpjBlindIndex: true },
        })
        return user && decryptSensitiveFields(user)
    }

    // Recebe o CPF em texto claro (ex: vindo do form de cadastro) e busca
    // pelo blind index — não é possível buscar pela coluna `cpf` diretamente
    // porque ela guarda ciphertext com IV aleatório (nunca repete, mesmo
    // para o mesmo CPF).
    async findByCpf(cpf: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { cpfBlindIndex: generateBlindIndex(cpf) },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    async findByCnpj(cnpj: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { cnpjBlindIndex: generateBlindIndex(cnpj) },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

    async findById(id: string): Promise<UserWithoutPassword | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            omit: READ_OMIT,
        })
        return user && decryptSensitiveFields(user)
    }

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

    async delete(id: string): Promise<void> {
        await this.prisma.user.delete({
            where: { id },
        })
    }
}
