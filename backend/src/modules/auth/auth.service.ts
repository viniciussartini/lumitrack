import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { randomUUID, randomBytes } from "crypto"
import { z } from "zod"
import { env } from "@/config/env.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { parseJwtExpiry } from "@/shared/time/parseJwtExpiry.js"
import { encryptMfaSecret, decryptMfaSecret } from "@/shared/crypto/mfaEncryption.js"
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from "@/shared/crypto/totp.js"
import { generateQrCodeDataUrl } from "@/shared/crypto/qrcode.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"
import {
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    mfaLoginVerifySchema,
    mfaSetupVerifySchema,
    mfaDisableSchema,
} from "@/modules/auth/auth.schema.js"
import { UnauthorizedError, BadRequestError, ValidationError } from "@/shared/errors/AppError.js"
import type { StringValue } from "ms"

// Tipo do EmailService
export type SendPasswordResetEmailFn = (email: string, resetToken: string) => Promise<void>

const BCRYPT_ROUNDS = 12

// Tempo de expiração do token de reset em milissegundos (1 hora)
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000

// #12 — MFA opcional via TOTP (A06/A07)
// mfaToken é um JWT separado da sessão real — stateless (nunca persistido
// em auth_tokens), de curta duração, com um claim `purpose` que o
// distingue de um JWT de sessão de verdade (defesa em profundidade: mesmo
// que alguém tentasse usá-lo como Bearer, `authenticate.ts` o rejeitaria
// de qualquer forma, pois nunca existe um auth_tokens correspondente).
const MFA_TOKEN_EXPIRES_IN: StringValue = "5m"
const MFA_TOKEN_PURPOSE = "mfa-pending"
const BACKUP_CODE_COUNT = 10

type SessionResult = {
    token: string
    refreshToken: string | null // preenchido apenas para WEB
    channel: "WEB" | "MOBILE"
    userId: string
}
type LoginResult =
    (SessionResult & { mfaRequired: false }) | { mfaRequired: true; mfaToken: string }

export class AuthService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly sendPasswordResetEmail: SendPasswordResetEmailFn,
    ) {}

    async login(input: unknown): Promise<LoginResult> {
        const parsed = loginSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { email, password, channel } = parsed.data

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        const isValidPassword = user ? await bcrypt.compare(password, user.password) : false

        if (!user || !isValidPassword) {
            throw new UnauthorizedError("Credenciais inválidas")
        }

        if (user.mfaEnabled) {
            const mfaToken = jwt.sign(
                { purpose: MFA_TOKEN_PURPOSE, userId: user.id, channel },
                env.JWT_SECRET,
                { expiresIn: MFA_TOKEN_EXPIRES_IN },
            )
            return { mfaRequired: true, mfaToken }
        }

        const session = await this.issueSessionToken(user.id, user.email, user.userType, channel)
        return { ...session, mfaRequired: false }
    }

    // Completa o login depois que login() retornou mfaRequired:true — exige
    // o mfaToken de curta duração (provando que a senha já foi validada)
    // mais um código válido (TOTP ou backup code).
    async completeMfaLogin(input: unknown): Promise<SessionResult> {
        const parsed = mfaLoginVerifySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { mfaToken, code } = parsed.data

        let payload: { purpose: string; userId: string; channel: "WEB" | "MOBILE" }
        try {
            payload = jwt.verify(mfaToken, env.JWT_SECRET) as typeof payload
        } catch {
            throw new UnauthorizedError("Sessão de MFA inválida ou expirada")
        }

        if (payload.purpose !== MFA_TOKEN_PURPOSE) {
            throw new UnauthorizedError("Sessão de MFA inválida ou expirada")
        }

        const user = await this.authRepository.findUserByIdWithPassword(payload.userId)

        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            throw new UnauthorizedError("Sessão de MFA inválida ou expirada")
        }

        const isValidCode = await this.verifyMfaCode(user.id, user.mfaSecret, code)

        if (!isValidCode) {
            throw new UnauthorizedError("Código inválido")
        }

        return this.issueSessionToken(user.id, user.email, user.userType, payload.channel)
    }

    // Gera um novo secret TOTP + QR code — nada é persistido ainda. O
    // cliente precisa confirmar com verifyMfaSetup() (re-submetendo o
    // secret junto com um código válido) antes de habilitar de fato.
    async setupMfa(email: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
        const secret = generateTotpSecret()
        const uri = generateTotpUri(email, secret)
        const qrCodeDataUrl = await generateQrCodeDataUrl(uri)

        return { secret, qrCodeDataUrl }
    }

    async verifyMfaSetup(userId: string, input: unknown): Promise<{ backupCodes: string[] }> {
        const parsed = mfaSetupVerifySchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { secret, code } = parsed.data

        // Step-up (#10 — A07): reinscrever o segundo fator de uma conta que
        // já tem MFA dá o mesmo resultado prático de desabilitá-lo — com o
        // bônus de expulsar o dono legítimo (`createBackupCodes` purga os
        // códigos antigos) — mas, ao contrário de `disableMfa`, não exigia
        // nada além de uma sessão válida. Recusa e obriga o caminho já
        // hardened `disable` → `setup`, em vez de duplicar a exigência de
        // senha+código aqui. Primeira inscrição (sem MFA) não passa por
        // aqui — não há fator vigente para provar.
        const user = await this.authRepository.findUserByIdWithPassword(userId)
        if (user?.mfaEnabled) {
            throw new BadRequestError(
                "MFA já está habilitado nesta conta — desabilite o fator atual antes de configurar um novo",
            )
        }

        if (!(await verifyTotpCode(secret, code))) {
            throw new UnauthorizedError("Código inválido")
        }

        const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode())
        const codeHashes = await Promise.all(
            backupCodes.map((backupCode) => bcrypt.hash(backupCode, BCRYPT_ROUNDS)),
        )

        await this.authRepository.setMfaSecret(userId, encryptMfaSecret(secret))
        await this.authRepository.createBackupCodes(userId, codeHashes)

        return { backupCodes }
    }

    // Exige senha + código válido — uma sessão sozinha (ex.: roubada via
    // XSS) não deve ser suficiente para desligar o segundo fator de outra
    // conta.
    async disableMfa(userId: string, input: unknown): Promise<void> {
        const parsed = mfaDisableSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { password, code } = parsed.data

        const user = await this.authRepository.findUserByIdWithPassword(userId)

        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            throw new BadRequestError("MFA não está habilitado para esta conta")
        }

        const isValidPassword = await bcrypt.compare(password, user.password)
        if (!isValidPassword) {
            throw new UnauthorizedError("Credenciais inválidas")
        }

        if (!(await this.verifyMfaCode(user.id, user.mfaSecret, code))) {
            throw new UnauthorizedError("Código inválido")
        }

        await this.authRepository.disableMfa(userId)
    }

    async forgotPassword(input: unknown): Promise<void> {
        const parsed = forgotPasswordSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { email } = parsed.data

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        if (!user) {
            return
        }

        // Contas de demonstração (ver .claude/docs/PLANO_SIMULADOR_IOT_E_SEED_DEMO.md,
        // Fase 4): nenhum token é criado nem e-mail enviado, mesmo padrão de
        // retorno silencioso usado acima para e-mail inexistente — a resposta
        // HTTP é idêntica nos dois casos, sem visitante conseguir distinguir.
        if (DEMO_ACCOUNT_EMAILS.has(user.email)) {
            return
        }

        const resetToken = randomUUID()
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS)

        // Só o hash é persistido — mesmo padrão já usado para AuthToken/
        // RefreshToken (#10, A04): em caso de vazamento do dump do banco, o
        // hash não permite reconstruir um token de reset válido. O valor
        // puro sai apenas no e-mail, nunca é gravado em lugar nenhum.
        await this.authRepository.createPasswordReset({
            userId: user.id,
            token: hashToken(resetToken),
            expiresAt,
        })

        await this.sendPasswordResetEmail(email, resetToken)
    }

    async resetPassword(input: unknown): Promise<void> {
        const parsed = resetPasswordSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { token, newPassword } = parsed.data

        const reset = await this.authRepository.findPasswordReset(hashToken(token))

        if (!reset) {
            throw new BadRequestError("Token de redefinição inválido ou expirado")
        }

        if (reset.usedAt !== null) {
            throw new BadRequestError("Token de redefinição inválido ou expirado")
        }

        if (reset.expiresAt < new Date()) {
            throw new BadRequestError("Token de redefinição inválido ou expirado")
        }

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

        // #10 — A07: o cenário-alvo do "esqueci minha senha" é recuperar uma
        // conta comprometida — revoga toda sessão (AuthToken) e refresh
        // token existente na mesma transação da troca de senha, para que um
        // atacante não sobreviva ao reset com uma sessão ainda válida.
        await this.authRepository.resetPasswordAndRevokeSessions({
            userId: reset.userId,
            resetId: reset.id,
            hashedPassword,
        })
    }

    async logout(sessionToken: string, rawRefreshToken?: string): Promise<void> {
        const hashedToken = hashToken(sessionToken)
        const stored = await this.authRepository.findActiveToken(hashedToken)

        if (!stored) {
            throw new UnauthorizedError("Token inválido")
        }

        if (stored.revokedAt !== null) {
            throw new UnauthorizedError("Token já foi revogado")
        }

        await this.authRepository.revokeToken(hashedToken)

        if (rawRefreshToken) {
            const hashedRefresh = hashToken(rawRefreshToken)
            const storedRefresh = await this.authRepository.findRefreshToken(hashedRefresh)
            if (storedRefresh && storedRefresh.revokedAt === null) {
                await this.authRepository.revokeRefreshToken(storedRefresh.id)
            }
        }
    }

    // Renova a sessão WEB: valida o refresh token, rotaciona-o e emite um
    // novo JWT + novo refresh token. Detecta reuso de tokens já revogados
    // (sinal de roubo) e revoga todas as sessões do usuário nesse caso.
    async refresh(
        rawRefreshToken: string,
        auditFn?: (userId: string) => Promise<void>,
    ): Promise<SessionResult> {
        const hashedToken = hashToken(rawRefreshToken)
        const stored = await this.authRepository.findRefreshToken(hashedToken)

        if (!stored) {
            throw new UnauthorizedError("Refresh token inválido")
        }

        if (stored.revokedAt !== null) {
            const gracePeriodMs = env.REFRESH_TOKEN_GRACE_PERIOD_MS
            const withinGrace =
                stored.replacedByTokenId !== null &&
                Date.now() - stored.revokedAt.getTime() <= gracePeriodMs

            if (withinGrace) {
                // Corrida entre abas: token já foi rotacionado, mas dentro da
                // janela de graça — emite nova sessão sem segunda rotação.
                const user = await this.authRepository.findUserById(stored.userId)
                if (!user) throw new UnauthorizedError("Refresh token inválido")
                return this.issueSessionToken(user.id, user.email, user.userType, "WEB")
            }

            // Reuso real (token revogado fora da janela de graça) — compromisso
            // potencial: revogar tudo e forçar re-login.
            await this.authRepository.revokeAllRefreshTokensForUser(stored.userId)
            if (auditFn) await auditFn(stored.userId)
            throw new UnauthorizedError("Refresh token inválido")
        }

        if (stored.expiresAt < new Date()) {
            throw new UnauthorizedError("Refresh token expirado")
        }

        const user = await this.authRepository.findUserById(stored.userId)
        if (!user) throw new UnauthorizedError("Refresh token inválido")

        return this.issueSessionToken(user.id, user.email, user.userType, "WEB", stored.id)
    }

    // ─── Helpers privados ───────────────────────────────────────────────────

    // Emite a sessão real (JWT assinado + persistência do hash em
    // auth_tokens) — extraído para ser reaproveitado tanto pelo login
    // direto (sem MFA) quanto pela conclusão do login com MFA.
    private async issueSessionToken(
        userId: string,
        email: string,
        userType: string,
        channel: "WEB" | "MOBILE",
        replacesRefreshTokenId?: string,
    ): Promise<SessionResult> {
        // jti (JWT ID) é um UUID aleatório que garante unicidade mesmo quando
        // dois tokens são emitidos no mesmo segundo para o mesmo usuário —
        // sem ele, o mesmo `iat`+`exp`+payload produziria o mesmo JWT e
        // violaria o unique constraint de auth_tokens.token.
        const jwtPayload = { id: userId, email, userType, jti: randomUUID() }

        // Web expira rápido (sessão curta); mobile expira mais tarde, mas
        // SEMPRE expira — um token vazado não pode ter validade indefinida.
        const expiresInByChannel: Record<typeof channel, StringValue> = {
            WEB: env.JWT_WEB_EXPIRES_IN as StringValue,
            MOBILE: env.MOBILE_TOKEN_EXPIRES_IN as StringValue,
        }
        const signOptions: jwt.SignOptions = {
            expiresIn: expiresInByChannel[channel],
        }
        const token = jwt.sign(jwtPayload, env.JWT_SECRET, signOptions)

        const expiresAt = new Date(Date.now() + parseJwtExpiry(expiresInByChannel[channel]))

        // O JWT em si nunca é persistido — apenas seu hash (SHA-256). Em caso
        // de vazamento do dump do banco, o hash não permite reconstruir um
        // token de sessão válido.
        await this.authRepository.createAuthToken({
            userId,
            token: hashToken(token),
            channel,
            expiresAt,
        })

        const refreshToken =
            channel === "WEB" ? await this.issueRefreshToken(userId, replacesRefreshTokenId) : null

        return { token, refreshToken, channel, userId }
    }

    // Gera um token opaco de alta entropia, persiste apenas o hash.
    private async issueRefreshToken(userId: string, replacesTokenId?: string): Promise<string> {
        const raw = randomBytes(32).toString("hex")
        const expiresAt = new Date(
            Date.now() + parseJwtExpiry(env.JWT_REFRESH_EXPIRES_IN as StringValue),
        )
        await this.authRepository.createRefreshToken({
            userId,
            token: hashToken(raw),
            expiresAt,
            ...(replacesTokenId !== undefined && { replacesTokenId }),
        })
        return raw
    }

    // Verifica um código contra o secret TOTP do usuário; se não bater,
    // tenta contra os backup codes não-usados (bcrypt.compare em cada um —
    // são poucos, no máximo BACKUP_CODE_COUNT). Marca o backup code como
    // usado em caso de acerto, para que não possa ser reutilizado.
    private async verifyMfaCode(
        userId: string,
        encryptedSecret: string,
        code: string,
    ): Promise<boolean> {
        const secret = decryptMfaSecret(encryptedSecret)

        if (await verifyTotpCode(secret, code)) {
            return true
        }

        // Otimização: backup codes sempre têm o formato "XXXXX-XXXXX" (hex
        // com hífen) — um código puramente numérico de 6 dígitos nunca é um
        // backup code válido. Pula o loop de bcrypt.compare nesse caso (cada
        // comparação custa ~100-300ms com BCRYPT_ROUNDS=12; até
        // BACKUP_CODE_COUNT delas em sequência seria latência desnecessária
        // para o caso mais comum de erro: um TOTP digitado errado).
        if (/^\d{6}$/.test(code)) {
            return false
        }

        const unusedCodes = await this.authRepository.findUnusedBackupCodes(userId)

        for (const backupCode of unusedCodes) {
            if (await bcrypt.compare(code, backupCode.codeHash)) {
                await this.authRepository.markBackupCodeUsed(backupCode.id)
                return true
            }
        }

        return false
    }
}

// Código de backup legível: 10 caracteres hex em maiúsculo, formatados em
// dois grupos de 5 (ex.: "A1B2C-D3E4F") — ~40 bits de entropia, suficiente
// para um código de uso único consumido sob rate limit.
function generateBackupCode(): string {
    const raw = randomBytes(5).toString("hex").toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`
}
