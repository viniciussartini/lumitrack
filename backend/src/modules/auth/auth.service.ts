import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { randomUUID, randomBytes } from "crypto"
import { env } from "@/config/env.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { parseJwtExpiry } from "@/shared/time/parseJwtExpiry.js"
import { encryptMfaSecret, decryptMfaSecret } from "@/shared/crypto/mfaEncryption.js"
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from "@/shared/crypto/totp.js"
import { generateQrCodeDataUrl } from "@/shared/crypto/qrcode.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import {
    DEMO_ACCOUNT_EMAILS,
    DEMO_RESIDENTIAL_EMAIL,
    DEMO_COMMERCIAL_EMAIL,
} from "@/shared/config/demoAccounts.js"
import {
    loginSchema,
    demoLoginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    mfaLoginVerifySchema,
    mfaSetupVerifySchema,
    mfaDisableSchema,
} from "@/modules/auth/auth.schema.js"
import { UnauthorizedError, BadRequestError, ForbiddenError } from "@/shared/errors/AppError.js"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import type { StringValue } from "ms"

// Tipo do EmailService
export type SendPasswordResetEmailFn = (email: string, resetToken: string) => Promise<void>

const BCRYPT_ROUNDS = 12

// Tempo de expiração do token de reset em milissegundos (1 hora)
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000

// MFA opcional via TOTP (A06/A07)
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

/**
 * Autenticação, sessão, MFA e recuperação de conta — login, refresh
 * rotacionado, TOTP com backup codes e o ciclo de esqueci-minha-senha.
 */
export class AuthService {
    /**
     * `demoLoginEnabled` é injetado (não lido de `env` direto no método) —
     * mesmo padrão de DI usado em `UserService.registrationEnabled`: deixa
     * o guard testável sem mockar módulo. Default `false` preserva o
     * comportamento de todo chamador existente.
     *
     * @param authRepository - Acesso a dados de autenticação, sessão e MFA persistidos.
     * @param sendPasswordResetEmail - Envia o e-mail com o link de redefinição de senha.
     * @param demoLoginEnabled - Libera o endpoint de login de demonstração.
     */
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly sendPasswordResetEmail: SendPasswordResetEmailFn,
        private readonly demoLoginEnabled: boolean = false,
    ) {}

    /**
     * Valida e-mail e senha; se a conta tiver MFA habilitado, devolve um
     * `mfaToken` de curta duração em vez da sessão (segunda etapa em
     * {@link completeMfaLogin}).
     *
     * @param input - Corpo bruto da requisição (`email`, `password`, `channel`), validado aqui.
     * @returns A sessão emitida, ou um `mfaToken` pendente quando MFA está habilitado.
     */
    async login(input: unknown): Promise<LoginResult> {
        const { email, password, channel } = parseOrThrow(loginSchema, input)

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        const isValidPassword = user ? await bcrypt.compare(password, user.password) : false

        if (!user || !isValidPassword) {
            throw new UnauthorizedError("Credenciais inválidas")
        }

        if (user.mfaEnabled) {
            return { mfaRequired: true, mfaToken: this.issueMfaToken(user.id, channel) }
        }

        const session = await this.issueSessionToken(user.id, user.email, user.userType, channel)
        return { ...session, mfaRequired: false }
    }

    /**
     * Login de demonstração: sem senha do cliente — o e-mail
     * resolve internamente a partir do `profile` escolhido, nunca chega ao
     * frontend. Gated por DEMO_LOGIN_ENABLED (falha fechada, antes de
     * validar o payload) para o endpoint não existir funcionalmente em
     * ambientes que não optaram por expor login de demonstração.
     *
     * @param input - Corpo bruto da requisição (`profile`, `channel`), validado aqui.
     * @returns A sessão emitida, ou um `mfaToken` pendente quando MFA está habilitado.
     */
    async demoLogin(input: unknown): Promise<LoginResult> {
        if (!this.demoLoginEnabled) {
            throw new ForbiddenError("Login de demonstração desabilitado neste ambiente")
        }

        const { profile, channel } = parseOrThrow(demoLoginSchema, input)
        const email = profile === "residential" ? DEMO_RESIDENTIAL_EMAIL : DEMO_COMMERCIAL_EMAIL

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        if (!user) {
            throw new UnauthorizedError("Login de demonstração indisponível")
        }

        // Contas demo não podem ter MFA habilitado através da API (guard em
        // verifyMfaSetup) — este branch é mantido só por simetria/defesa em
        // profundidade com login(), não porque é esperado ser exercitado.
        if (user.mfaEnabled) {
            return { mfaRequired: true, mfaToken: this.issueMfaToken(user.id, channel) }
        }

        const session = await this.issueSessionToken(user.id, user.email, user.userType, channel)
        return { ...session, mfaRequired: false }
    }

    private issueMfaToken(userId: string, channel: "WEB" | "MOBILE"): string {
        return jwt.sign({ purpose: MFA_TOKEN_PURPOSE, userId, channel }, env.JWT_SECRET, {
            expiresIn: MFA_TOKEN_EXPIRES_IN,
        })
    }

    /**
     * Completa o login depois que login() retornou mfaRequired:true — exige
     * o mfaToken de curta duração (provando que a senha já foi validada)
     * mais um código válido (TOTP ou backup code).
     *
     * @param input - Corpo bruto da requisição (`mfaToken`, `code`), validado aqui.
     * @returns A sessão emitida.
     */
    async completeMfaLogin(input: unknown): Promise<SessionResult> {
        const { mfaToken, code } = parseOrThrow(mfaLoginVerifySchema, input)

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

    /**
     * Gera um novo secret TOTP + QR code — nada é persistido ainda. O
     * cliente precisa confirmar com verifyMfaSetup() (re-submetendo o
     * secret junto com um código válido) antes de habilitar de fato.
     *
     * @param email - E-mail do usuário, usado no label do QR code TOTP.
     * @returns O secret gerado e o QR code (data URL) para escanear no app autenticador.
     */
    async setupMfa(email: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
        const secret = generateTotpSecret()
        const uri = generateTotpUri(email, secret)
        const qrCodeDataUrl = await generateQrCodeDataUrl(uri)

        return { secret, qrCodeDataUrl }
    }

    /**
     * Confirma a configuração de MFA: exige um código TOTP válido para o
     * secret gerado em {@link setupMfa}, então persiste o secret (cifrado)
     * e emite os backup codes.
     *
     * @param userId - Id do usuário que está habilitando o MFA.
     * @param input - Corpo bruto da requisição (`secret`, `code`), validado aqui.
     * @returns Os backup codes em texto claro (única vez que ficam visíveis).
     */
    async verifyMfaSetup(userId: string, input: unknown): Promise<{ backupCodes: string[] }> {
        const { secret, code } = parseOrThrow(mfaSetupVerifySchema, input)

        const user = await this.authRepository.findUserByIdWithPassword(userId)

        // Contas de demonstração são somente leitura (ADR-0008): as
        // credenciais são fixas e conhecidas publicamente — sem essa
        // restrição, quem loga na conta demo poderia habilitar MFA e
        // sequestrá-la permanentemente.
        if (user && DEMO_ACCOUNT_EMAILS.has(user.email)) {
            throw new ForbiddenError("Conta de demonstração é somente leitura")
        }

        // Step-up (A07): reinscrever o segundo fator de uma conta que
        // já tem MFA dá o mesmo resultado prático de desabilitá-lo — com o
        // bônus de expulsar o dono legítimo (`createBackupCodes` purga os
        // códigos antigos) — mas, ao contrário de `disableMfa`, não exigia
        // nada além de uma sessão válida. Recusa e obriga o caminho já
        // hardened `disable` → `setup`, em vez de duplicar a exigência de
        // senha+código aqui. Primeira inscrição (sem MFA) não passa por
        // aqui — não há fator vigente para provar.
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

    /**
     * Exige senha + código válido — uma sessão sozinha (ex.: roubada via
     * XSS) não deve ser suficiente para desligar o segundo fator de outra
     * conta.
     *
     * @param userId - Id do usuário que está desabilitando o MFA.
     * @param input - Corpo bruto da requisição (`password`, `code`), validado aqui.
     */
    async disableMfa(userId: string, input: unknown): Promise<void> {
        const { password, code } = parseOrThrow(mfaDisableSchema, input)

        const user = await this.authRepository.findUserByIdWithPassword(userId)

        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            throw new BadRequestError("MFA não está habilitado para esta conta")
        }

        // Contas de demonstração são somente leitura — ver mesmo guard em
        // verifyMfaSetup acima.
        if (DEMO_ACCOUNT_EMAILS.has(user.email)) {
            throw new ForbiddenError("Conta de demonstração é somente leitura")
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

    /**
     * Inicia o ciclo de "esqueci minha senha": se o e-mail existir e não for
     * de uma conta de demonstração, cria um token de reset (hash) e envia o
     * e-mail com o link — silencioso nos demais casos, para não revelar se
     * um e-mail está cadastrado.
     *
     * @param input - Corpo bruto da requisição (`email`), validado aqui.
     */
    async forgotPassword(input: unknown): Promise<void> {
        const { email } = parseOrThrow(forgotPasswordSchema, input)

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        if (!user) {
            return
        }

        // Contas de demonstração: nenhum token é criado nem e-mail enviado,
        // mesmo padrão de retorno silencioso usado acima para e-mail
        // inexistente — a resposta HTTP é idêntica nos dois casos, sem o
        // visitante conseguir distinguir.
        if (DEMO_ACCOUNT_EMAILS.has(user.email)) {
            return
        }

        const resetToken = randomUUID()
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS)

        // Só o hash é persistido — mesmo padrão já usado para AuthToken/
        // RefreshToken (A04): em caso de vazamento do dump do banco, o
        // hash não permite reconstruir um token de reset válido. O valor
        // puro sai apenas no e-mail, nunca é gravado em lugar nenhum.
        await this.authRepository.createPasswordReset({
            userId: user.id,
            token: hashToken(resetToken),
            expiresAt,
        })

        await this.sendPasswordResetEmail(email, resetToken)
    }

    /**
     * Efetiva a redefinição de senha a partir de um token de reset válido e
     * ainda não usado, revogando toda sessão vigente do usuário.
     *
     * @param input - Corpo bruto da requisição (`token`, `newPassword`), validado aqui.
     */
    async resetPassword(input: unknown): Promise<void> {
        const { token, newPassword } = parseOrThrow(resetPasswordSchema, input)

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

        // A07: o cenário-alvo do "esqueci minha senha" é recuperar uma
        // conta comprometida — revoga toda sessão (AuthToken) e refresh
        // token existente na mesma transação da troca de senha, para que um
        // atacante não sobreviva ao reset com uma sessão ainda válida.
        await this.authRepository.resetPasswordAndRevokeSessions({
            userId: reset.userId,
            resetId: reset.id,
            hashedPassword,
        })
    }

    /**
     * Encerra a sessão atual (revoga o token de sessão) e, se um refresh
     * token ainda ativo foi informado, revoga-o também.
     *
     * @param sessionToken - JWT de sessão em claro, do usuário autenticado.
     * @param rawRefreshToken - Refresh token em claro, quando o canal é WEB.
     */
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

    /**
     * Renova a sessão WEB: valida o refresh token, rotaciona-o e emite um
     * novo JWT + novo refresh token. Detecta reuso de tokens já revogados
     * (sinal de roubo) e revoga todas as sessões do usuário nesse caso.
     *
     * @param rawRefreshToken - Refresh token em claro, recebido do cookie.
     * @param auditFn - Callback opcional acionado quando um reuso de token é detectado.
     * @returns A nova sessão emitida.
     */
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
