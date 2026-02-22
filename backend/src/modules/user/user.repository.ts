import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateUserInput, UpdateUserInput } from "@/modules/user/user.schema.js"

export type UserWithoutPassword = Omit<
    Awaited<ReturnType<PrismaClient["user"]["findUniqueOrThrow"]>>,
    "password"
>

export class UserRepository {
  // Injeção de dependência: o PrismaClient é recebido pelo construtor,
  // não instanciado aqui dentro. Isso permite que os testes passem
  // o prismaTest (banco de testes) sem nenhuma alteração no código.
    constructor(private readonly prisma: PrismaClient) {}

    async findByEmail(email: string): Promise<UserWithoutPassword | null> {
        return this.prisma.user.findUnique({
            where: { email },
            omit: { password: true },
        })
    }

    async findByEmailWithPassword(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
        })
    }

    async findByCpf(cpf: string): Promise<UserWithoutPassword | null> {
        return this.prisma.user.findUnique({
            where: { cpf },
            omit: { password: true },
        })
    }

    async findByCnpj(cnpj: string): Promise<UserWithoutPassword | null> {
        return this.prisma.user.findUnique({
            where: { cnpj },
            omit: { password: true },
        })
    }

    async findById(id: string): Promise<UserWithoutPassword | null> {
        return this.prisma.user.findUnique({
            where: { id },
            omit: { password: true },
        })
    }

    async create(data: CreateUserInput & { password: string }): Promise<UserWithoutPassword> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.user.create({
            data: cleanData as any,
            omit: { password: true },
        })
    }

    async update(id: string, data: UpdateUserInput): Promise<UserWithoutPassword> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        
        return this.prisma.user.update({
            where: { id },
            data: cleanData as any,
            omit: { password: true },
        })
    }

    async delete(id: string): Promise<void> {
        await this.prisma.user.delete({
            where: { id },
        })
    }
}