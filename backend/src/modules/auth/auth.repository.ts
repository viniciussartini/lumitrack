import { PrismaClient, Role } from "@/generated/prisma/client.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"

// Retornado pelo findActiveToken — usado tanto no middleware de autenticação
// quanto no service de logout para verificar se o token é válido.
// `user.role` (RBAC) é lido junto nesta mesma query — o middleware
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

/** Acesso a dados de autenticação, sessão, MFA e recuperação de conta persistidos. */
export class AuthRepository {
    /** @param prisma - Cliente Prisma usado para todas as queries do módulo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Persiste o token JWT na tabela auth_tokens após um login bem-sucedido.
     * `expiresAt` será null para MOBILE e preenchido para WEB.
     *
     * @param data - Dados da sessão a persistir.
     * @param data.userId - Id do usuário dono da sessão.
     * @param data.token - Hash do JWT emitido (nunca o token em claro).
     * @param data.channel - Canal de origem da sessão.
     * @param data.expiresAt - Expiração da sessão (null para MOBILE).
     */
    async createAuthToken(data: {
        userId: string
        token: string
        channel: "WEB" | "MOBILE"
        expiresAt: Date | null
    }): Promise<void> {
        await this.prisma.authToken.create({ data })
    }

    /**
     * Busca uma sessão pelo hash do token, junto com a role atual do
     * usuário (RBAC lido sempre fresco do banco, nunca de um claim do JWT).
     *
     * @param token - Hash do JWT de sessão.
     * @returns A sessão encontrada, ou `null` se o token não existe.
     */
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

    /**
     * Marca uma sessão como revogada (logout).
     *
     * @param token - Hash do JWT de sessão a revogar.
     */
    async revokeToken(token: string): Promise<void> {
        await this.prisma.authToken.update({
            where: { token },
            data: { revokedAt: new Date() },
        })
    }

    /**
     * Persiste um pedido de redefinição de senha.
     *
     * @param data - Dados do pedido de reset.
     * @param data.userId - Id do usuário que solicitou o reset.
     * @param data.token - Hash do token de reset (nunca o valor em claro).
     * @param data.expiresAt - Expiração do pedido de reset.
     */
    async createPasswordReset(data: {
        userId: string
        token: string
        expiresAt: Date
    }): Promise<void> {
        await this.prisma.passwordReset.create({ data })
    }

    /**
     * Busca um pedido de redefinição de senha pelo hash do token.
     *
     * @param token - Hash do token de reset.
     * @returns O pedido encontrado, ou `null` se o token não existe.
     */
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

    /**
     * Troca a senha, marca o reset como usado e revoga TODAS as
     * sessões (AuthToken) e refresh tokens do usuário, tudo na mesma
     * transação — o cenário-alvo do "esqueci minha senha" é recuperar uma
     * conta comprometida; se a revogação fosse uma chamada separada que
     * pudesse falhar independente da troca de senha, o atacante poderia
     * sobreviver ao reset com uma sessão ainda válida.
     *
     * @param params - Dados da troca de senha.
     * @param params.userId - Id do usuário que está redefinindo a senha.
     * @param params.resetId - Id do pedido de reset a marcar como usado.
     * @param params.hashedPassword - Hash bcrypt da nova senha.
     */
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

    /**
     * Persiste um pedido de troca de e-mail.
     *
     * @param data - Dados do pedido de troca.
     * @param data.userId - Id do usuário que solicitou a troca.
     * @param data.newEmail - Endereço para o qual a troca foi solicitada.
     * @param data.token - Hash do token de confirmação (nunca o valor em claro).
     * @param data.expiresAt - Expiração do pedido de troca.
     */
    async createEmailChange(data: {
        userId: string
        newEmail: string
        token: string
        expiresAt: Date
    }): Promise<void> {
        await this.prisma.emailChange.create({ data })
    }

    /**
     * Busca um pedido de troca de e-mail pelo hash do token.
     *
     * @param token - Hash do token de confirmação.
     * @returns O pedido encontrado, ou `null` se o token não existe.
     */
    async findEmailChange(token: string) {
        return this.prisma.emailChange.findUnique({
            where: { token },
            select: {
                id: true,
                userId: true,
                newEmail: true,
                expiresAt: true,
                usedAt: true,
            },
        })
    }

    /**
     * Mesmo raciocínio de resetPasswordAndRevokeSessions: efetiva o novo
     * e-mail, marca o pedido como usado e revoga toda sessão do usuário,
     * tudo na mesma transação — quem confirma a troca prova posse do novo
     * endereço, e uma sessão antiga (potencialmente sequestrada) não deve
     * sobreviver a isso.
     *
     * @param params - Dados da confirmação de troca.
     * @param params.userId - Id do usuário dono da conta.
     * @param params.changeId - Id do pedido de troca a marcar como usado.
     * @param params.newEmail - Endereço a efetivar na conta.
     */
    async confirmEmailChangeAndRevokeSessions(params: {
        userId: string
        changeId: string
        newEmail: string
    }): Promise<void> {
        const now = new Date()
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: params.userId },
                data: { email: params.newEmail },
            }),
            this.prisma.emailChange.update({
                where: { id: params.changeId },
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

    /**
     * Retenção e expurgo (Art. 15/16 LGPD): tokens que já não servem
     * para nada (expirados ou revogados) ficam guardados por um período de
     * graça (DATA_RETENTION_AUTH_TOKEN_DAYS) só para alguma investigação
     * técnica pontual, depois são removidos. `threshold` é a data de corte
     * (now - retentionDays) — qualquer token cuja revogação/expiração seja
     * anterior a ela é candidato ao expurgo. Tokens nunca revogados E sem
     * expiresAt (defensivo — não deveria mais existir) nunca
     * são expurgados por este método.
     *
     * @param threshold - Data de corte: tokens revogados/expirados antes dela são removidos.
     * @returns Quantidade de tokens removidos.
     */
    async deleteExpiredOrRevokedTokens(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.authToken.deleteMany({
                where: {
                    OR: [
                        { revokedAt: { lt: threshold } },
                        { revokedAt: null, expiresAt: { lt: threshold } },
                    ],
                },
            })
            return result.count
        })
    }

    /**
     * Mesma lógica do método acima, para PasswordReset: usado ou expirado
     * há mais de DATA_RETENTION_PASSWORD_RESET_DAYS dias é removido.
     *
     * @param threshold - Data de corte: resets usados/expirados antes dela são removidos.
     * @returns Quantidade de resets removidos.
     */
    async deleteExpiredPasswordResets(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.passwordReset.deleteMany({
                where: {
                    OR: [
                        { usedAt: { lt: threshold } },
                        { usedAt: null, expiresAt: { lt: threshold } },
                    ],
                },
            })
            return result.count
        })
    }

    /**
     * Expurgo por retenção — DIFERENTE dos dois acima de propósito: só
     * expurga código JÁ USADO há mais de `threshold`
     * (`usedAt: { lt: threshold }` já exclui `usedAt: null` por semântica do
     * Prisma). Um código ainda não usado (`usedAt: null`) nunca é candidato,
     * mesmo muito antigo — continua válido para recuperação de conta até o
     * usuário regerar o conjunto (createBackupCodes já apaga o conjunto
     * anterior inteiro nesse momento). Expurgar por `createdAt` apagaria
     * recovery codes válidos, quebrando a recuperação de MFA.
     *
     * @param threshold - Data de corte: backup codes usados antes dela são removidos.
     * @returns Quantidade de backup codes removidos.
     */
    async deleteUsedMfaBackupCodes(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.mfaBackupCode.deleteMany({
                where: { usedAt: { lt: threshold } },
            })
            return result.count
        })
    }

    /**
     * Busca um usuário pelo e-mail, incluindo a senha hasheada — usado no
     * fluxo de login para validar credenciais.
     *
     * @param email - E-mail do usuário.
     * @returns O usuário encontrado (com senha), ou `null` se não existe.
     */
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

    /**
     * Usado pelo fluxo de desabilitar MFA — a requisição chega
     * autenticada (só tem o userId do JWT), precisa da senha hasheada para
     * re-confirmar antes de desligar o segundo fator.
     *
     * @param userId - Id do usuário autenticado.
     * @returns O usuário encontrado (com senha), ou `null` se não existe.
     */
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

    // ─── MFA ────────────────────────────────────────────────────────────────

    /**
     * `encryptedSecret` já vem cifrado (shared/crypto/mfaEncryption.ts) —
     * este repository nunca lida com o segredo em texto claro.
     *
     * @param userId - Id do usuário que está habilitando o MFA.
     * @param encryptedSecret - Secret TOTP já cifrado.
     */
    async setMfaSecret(userId: string, encryptedSecret: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { mfaSecret: encryptedSecret, mfaEnabled: true },
        })
    }

    /**
     * Desabilita o MFA e limpa os backup codes na mesma transação — não
     * deixa códigos órfãos de uma configuração anterior caso o usuário
     * reabilite o MFA depois (evita reaproveitar hashes antigos).
     *
     * @param userId - Id do usuário que está desabilitando o MFA.
     */
    async disableMfa(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { mfaSecret: null, mfaEnabled: false },
            }),
            this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
        ])
    }

    /**
     * `codeHashes` já vêm hasheados (bcrypt, mesmo padrão da senha) — o
     * código em texto claro nunca é persistido, só devolvido ao cliente
     * uma única vez na resposta do setup. Apaga qualquer lote anterior antes
     * de criar o novo: defesa em profundidade — o método fica
     * seguro por si só contra códigos órfãos de uma configuração anterior,
     * independente de o caminho até aqui já ter passado ou não por
     * `disableMfa` (que também purga, mas não é o único chamador possível).
     *
     * @param userId - Id do usuário dono dos backup codes.
     * @param codeHashes - Hashes bcrypt dos novos backup codes.
     */
    async createBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
            this.prisma.mfaBackupCode.createMany({
                data: codeHashes.map((codeHash) => ({ userId, codeHash })),
            }),
        ])
    }

    /**
     * Backup codes são hasheados com salt aleatório (bcrypt) — não há como
     * indexar/buscar por igualdade direta. Busca todos os não-usados do
     * usuário e o caller compara um a um via bcrypt.compare.
     *
     * @param userId - Id do usuário dono dos backup codes.
     * @returns Backup codes ainda não usados (id + hash).
     */
    async findUnusedBackupCodes(userId: string): Promise<{ id: string; codeHash: string }[]> {
        return this.prisma.mfaBackupCode.findMany({
            where: { userId, usedAt: null },
            select: { id: true, codeHash: true },
        })
    }

    /**
     * Marca um backup code como usado, para que não possa ser reutilizado.
     *
     * @param id - Id do backup code consumido.
     */
    async markBackupCodeUsed(id: string): Promise<void> {
        await this.prisma.mfaBackupCode.update({
            where: { id },
            data: { usedAt: new Date() },
        })
    }

    // ─── Refresh token (canal WEB) ──────────────────────────────────────────

    /**
     * Persiste um novo refresh token e, atomicamente, revoga o token anterior
     * (quando `replacesTokenId` é fornecido) linkando a cadeia de rotação.
     *
     * @param data - Dados do refresh token a criar.
     * @param data.userId - Id do usuário dono do refresh token.
     * @param data.token - Hash do refresh token (nunca o valor em claro).
     * @param data.expiresAt - Expiração do refresh token.
     * @param data.replacesTokenId - Id do refresh token que este substitui, quando é uma rotação.
     * @returns Id do refresh token criado.
     */
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

    /**
     * Busca um refresh token pelo hash.
     *
     * @param token - Hash do refresh token.
     * @returns O refresh token encontrado, ou `null` se não existe.
     */
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

    /**
     * Marca um refresh token como revogado.
     *
     * @param id - Id do refresh token a revogar.
     */
    async revokeRefreshToken(id: string): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { id },
            data: { revokedAt: new Date() },
        })
    }

    /**
     * Revoga todos os refresh tokens ativos de um usuário — usado quando um
     * reuso de token indica possível comprometimento da conta.
     *
     * @param userId - Id do usuário cujas sessões devem ser revogadas.
     */
    async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        })
    }

    /**
     * Expurgo por retenção dos refresh tokens expirados ou revogados antes
     * do corte informado.
     *
     * @param threshold - Data de corte: tokens revogados/expirados antes dela são removidos.
     * @returns Quantidade de refresh tokens removidos.
     */
    async deleteExpiredOrRevokedRefreshTokens(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.refreshToken.deleteMany({
                where: {
                    OR: [
                        { revokedAt: { lt: threshold } },
                        { revokedAt: null, expiresAt: { lt: threshold } },
                    ],
                },
            })
            return result.count
        })
    }

    /**
     * Enxuto — só o necessário para remontar o JWT payload no refresh.
     *
     * @param id - Id do usuário.
     * @returns Os dados mínimos do usuário, ou `null` se não existe.
     */
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
