import { PrismaClient } from "@/generated/prisma/client.js"

// Retornado pelo findActiveToken — usado tanto no middleware de autenticação
// quanto no service de logout para verificar se o token é válido.
export type ActiveToken = {
    id: string
    userId: string
    revokedAt: Date | null
    expiresAt: Date | null
}

export class AuthRepository {
    constructor(private readonly prisma: PrismaClient) {}

    // Persiste o token JWT na tabela auth_tokens após um login bem-sucedido.
    // `expiresAt` será null para MOBILE e preenchido para WEB.
    async createAuthToken(data: {
        userId: string
        token: string
        channel: "WEB" | "MOBILE"
        expiresAt: Date | null
    }): Promise<void> {
        await this.prisma.authToken.create({ data })
    }

    async findActiveToken(token: string): Promise<ActiveToken | null> {
        return this.prisma.authToken.findUnique({
            where: { token },
            select: {
                id: true,
                userId: true,
                revokedAt: true,
                expiresAt: true,
            },
        })
    }

    async revokeToken(token: string): Promise<void> {
        await this.prisma.authToken.update({
            where: { token },
            data: { revokedAt: new Date() },
        })
    }

    async createPasswordReset(data: {
        userId: string
        token: string
        expiresAt: Date
    }): Promise<void> {
        await this.prisma.passwordReset.create({ data })
    }

    async findPasswordReset(token: string) {
        return this.prisma.passwordReset.findUnique({
            where: { token },
            select: {
                id: true,
                userId: true,
                expiresAt: true,
                usedAt: true,
            },
        })
    }

    async markPasswordResetAsUsed(id: string): Promise<void> {
        await this.prisma.passwordReset.update({
            where: { id },
            data: { usedAt: new Date() },
        })
    }

    async findUserByEmailWithPassword(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                userType: true,
            },
        })
    }

    async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        })
    }
}