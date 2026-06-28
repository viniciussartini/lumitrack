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

    // #10 — Retenção e expurgo (Art. 15/16 LGPD): tokens que já não servem
    // para nada (expirados ou revogados) ficam guardados por um período de
    // graça (DATA_RETENTION_AUTH_TOKEN_DAYS) só para alguma investigação
    // técnica pontual, depois são removidos. `threshold` é a data de corte
    // (now - retentionDays) — qualquer token cuja revogação/expiração seja
    // anterior a ela é candidato ao expurgo. Tokens nunca revogados E sem
    // expiresAt (não deveria mais existir após a #04, mas defensivo) nunca
    // são expurgados por este método.
    async deleteExpiredOrRevokedTokens(threshold: Date): Promise<number> {
        const result = await this.prisma.authToken.deleteMany({
            where: {
                OR: [
                    { revokedAt: { lt: threshold } },
                    { revokedAt: null, expiresAt: { lt: threshold } },
                ],
            },
        })
        return result.count
    }

    // Mesma lógica do método acima, para PasswordReset: usado ou expirado
    // há mais de DATA_RETENTION_PASSWORD_RESET_DAYS dias é removido.
    async deleteExpiredPasswordResets(threshold: Date): Promise<number> {
        const result = await this.prisma.passwordReset.deleteMany({
            where: {
                OR: [
                    { usedAt: { lt: threshold } },
                    { usedAt: null, expiresAt: { lt: threshold } },
                ],
            },
        })
        return result.count
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