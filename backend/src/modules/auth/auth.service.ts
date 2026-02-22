import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"
import { z } from "zod"
import { env } from "@/config/env.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import {
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from "@/modules/auth/auth.schema.js"
import {
    UnauthorizedError,
    BadRequestError,
    ValidationError,
} from "@/shared/errors/AppError.js"
import type { StringValue } from "ms"

// Tipo do EmailService
export type SendPasswordResetEmailFn = (
    email: string,
    resetToken: string,
) => Promise<void>

const BCRYPT_ROUNDS = 12

// Tempo de expiração do token de reset em milissegundos (1 hora)
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000

export class AuthService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly sendPasswordResetEmail: SendPasswordResetEmailFn,
    ) {}

    async login(input: unknown): Promise<{ token: string }> {
        const parsed = loginSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { email, password, channel } = parsed.data

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        const isValidPassword = user
            ? await bcrypt.compare(password, user.password)
            : false

        if (!user || !isValidPassword) {
            throw new UnauthorizedError("Credenciais inválidas")
        }

        const jwtPayload = {
            id: user.id,
            email: user.email,
            userType: user.userType,
        }

        const webOptions: jwt.SignOptions = {
            expiresIn: env.JWT_WEB_EXPIRES_IN as StringValue,
        }
        const token =
            channel === "WEB"
                ? jwt.sign(jwtPayload, env.JWT_SECRET, webOptions)
                : jwt.sign(jwtPayload, env.JWT_SECRET)

        const expiresAt =
            channel === "WEB"
                ? new Date(Date.now() + parseJwtExpiry(env.JWT_WEB_EXPIRES_IN))
                : null

        await this.authRepository.createAuthToken({
            userId: user.id,
            token,
            channel,
            expiresAt,
        })

        return { token }
    }

    async logout(token: string): Promise<void> {
        const stored = await this.authRepository.findActiveToken(token)

        if (!stored) {
            throw new UnauthorizedError("Token inválido")
        }

        if (stored.revokedAt !== null) {
            throw new UnauthorizedError("Token já foi revogado")
        }

        await this.authRepository.revokeToken(token)
    }

    async forgotPassword(input: unknown): Promise<void> {
        const parsed = forgotPasswordSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { email } = parsed.data

        const user = await this.authRepository.findUserByEmailWithPassword(email)

        if (!user) {
            return
        }

        const resetToken = randomUUID()
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS)

        await this.authRepository.createPasswordReset({
            userId: user.id,
            token: resetToken,
            expiresAt,
        })

        await this.sendPasswordResetEmail(email, resetToken)
    }

    async resetPassword(input: unknown): Promise<void> {
        const parsed = resetPasswordSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { token, newPassword } = parsed.data

        const reset = await this.authRepository.findPasswordReset(token)

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

        await Promise.all([
            this.authRepository.updateUserPassword(reset.userId, hashedPassword),
            this.authRepository.markPasswordResetAsUsed(reset.id),
        ])
    }
}

// Converte a string de expiração do JWT (ex: "15m", "1h", "7d") para milissegundos.
// Calcula o `expiresAt` que armazenado no banco
// Suporta: s (segundos), m (minutos), h (horas), d (dias)
function parseJwtExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/)

    if (!match) {
        // Fallback seguro: 15 minutos
        return 15 * 60 * 1000
    }

    const value = parseInt(match[1]!)
    const unit = match[2]!

    const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    }

    return value * (multipliers[unit] ?? 60 * 1000)
}