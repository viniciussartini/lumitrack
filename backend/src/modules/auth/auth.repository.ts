import { PrismaClient, Role } from "@/generated/prisma/client.js"

// Retornado pelo findActiveToken — usado tanto no middleware de autenticação
// quanto no service de logout para verificar se o token é válido.
// `user.role` (#16 — RBAC) é lido junto nesta mesma query — o middleware
// authenticate já fazia este lookup por requisição para validar o token;
// alargar o select evita uma segunda query só para saber a role, e garante
// que ela é sempre lida fresca do banco (nunca um claim do JWT).
export type ActiveToken = {
    id: string
    userId: string
    revokedAt: Date | null
    expiresAt: Date | null
    user: { role: Role }
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
                user: { select: { role: true } },
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

    // #10 — A07: troca a senha, marca o reset como usado e revoga TODAS as
    // sessões (AuthToken) e refresh tokens do usuário, tudo na mesma
    // transação — o cenário-alvo do "esqueci minha senha" é recuperar uma
    // conta comprometida; se a revogação fosse uma chamada separada que
    // pudesse falhar independente da troca de senha, o atacante poderia
    // sobreviver ao reset com uma sessão ainda válida.
    async resetPasswordAndRevokeSessions(params: {
        userId: string
        resetId: string
        hashedPassword: string
    }): Promise<void> {
        const now = new Date()
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: params.userId },
                data: { password: params.hashedPassword },
            }),
            this.prisma.passwordReset.update({
                where: { id: params.resetId },
                data: { usedAt: now },
            }),
            this.prisma.authToken.updateMany({
                where: { userId: params.userId, revokedAt: null },
                data: { revokedAt: now },
            }),
            this.prisma.refreshToken.updateMany({
                where: { userId: params.userId, revokedAt: null },
                data: { revokedAt: now },
            }),
        ])
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
                mfaEnabled: true,
                mfaSecret: true,
            },
        })
    }

    // Usado pelo fluxo de desabilitar MFA (#12) — a requisição chega
    // autenticada (só tem o userId do JWT), precisa da senha hasheada para
    // re-confirmar antes de desligar o segundo fator.
    async findUserByIdWithPassword(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                password: true,
                userType: true,
                mfaEnabled: true,
                mfaSecret: true,
            },
        })
    }

    // ─── MFA (#12 — A06/A07) ────────────────────────────────────────────────

    // `encryptedSecret` já vem cifrado (shared/crypto/mfaEncryption.ts) —
    // este repository nunca lida com o segredo em texto claro.
    async setMfaSecret(userId: string, encryptedSecret: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { mfaSecret: encryptedSecret, mfaEnabled: true },
        })
    }

    // Desabilita o MFA e limpa os backup codes na mesma transação — não
    // deixa códigos órfãos de uma configuração anterior caso o usuário
    // reabilite o MFA depois (evita reaproveitar hashes antigos).
    async disableMfa(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { mfaSecret: null, mfaEnabled: false },
            }),
            this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
        ])
    }

    // `codeHashes` já vêm hasheados (bcrypt, mesmo padrão da senha) — o
    // código em texto claro nunca é persistido, só devolvido ao cliente
    // uma única vez na resposta do setup. Apaga qualquer lote anterior antes
    // de criar o novo (#10 — A07): defesa em profundidade — o método fica
    // seguro por si só contra códigos órfãos de uma configuração anterior,
    // independente de o caminho até aqui já ter passado ou não por
    // `disableMfa` (que também purga, mas não é o único chamador possível).
    async createBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
            this.prisma.mfaBackupCode.createMany({
                data: codeHashes.map((codeHash) => ({ userId, codeHash })),
            }),
        ])
    }

    // Backup codes são hasheados com salt aleatório (bcrypt) — não há como
    // indexar/buscar por igualdade direta. Busca todos os não-usados do
    // usuário e o caller compara um a um via bcrypt.compare.
    async findUnusedBackupCodes(userId: string): Promise<{ id: string; codeHash: string }[]> {
        return this.prisma.mfaBackupCode.findMany({
            where: { userId, usedAt: null },
            select: { id: true, codeHash: true },
        })
    }

    async markBackupCodeUsed(id: string): Promise<void> {
        await this.prisma.mfaBackupCode.update({
            where: { id },
            data: { usedAt: new Date() },
        })
    }

    // ─── Refresh token (#14 — A06, canal WEB) ───────────────────────────────

    // Persiste um novo refresh token e, atomicamente, revoga o token anterior
    // (quando `replacesTokenId` é fornecido) linkando a cadeia de rotação.
    async createRefreshToken(data: {
        userId: string
        token: string
        expiresAt: Date
        replacesTokenId?: string
    }): Promise<{ id: string }> {
        const now = new Date()
        return this.prisma.$transaction(async (tx) => {
            const created = await tx.refreshToken.create({
                data: {
                    userId: data.userId,
                    token: data.token,
                    expiresAt: data.expiresAt,
                },
                select: { id: true },
            })
            if (data.replacesTokenId) {
                await tx.refreshToken.update({
                    where: { id: data.replacesTokenId },
                    data: { revokedAt: now, replacedByTokenId: created.id },
                })
            }
            return created
        })
    }

    async findRefreshToken(token: string): Promise<{
        id: string
        userId: string
        revokedAt: Date | null
        expiresAt: Date
        replacedByTokenId: string | null
        createdAt: Date
    } | null> {
        return this.prisma.refreshToken.findUnique({
            where: { token },
            select: {
                id: true,
                userId: true,
                revokedAt: true,
                expiresAt: true,
                replacedByTokenId: true,
                createdAt: true,
            },
        })
    }

    async revokeRefreshToken(id: string): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { id },
            data: { revokedAt: new Date() },
        })
    }

    async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        })
    }

    async deleteExpiredOrRevokedRefreshTokens(threshold: Date): Promise<number> {
        const result = await this.prisma.refreshToken.deleteMany({
            where: {
                OR: [
                    { revokedAt: { lt: threshold } },
                    { revokedAt: null, expiresAt: { lt: threshold } },
                ],
            },
        })
        return result.count
    }

    // Enxuto — só o necessário para remontar o JWT payload no refresh.
    async findUserById(id: string): Promise<{
        id: string
        email: string
        userType: string
    } | null> {
        return this.prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, userType: true },
        })
    }
}