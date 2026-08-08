import { randomUUID } from "crypto"
import { z } from "zod"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { logger } from "@/shared/logger/logger.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { confirmEmailChangeSchema } from "@/modules/auth/auth.schema.js"
import { BadRequestError, ConflictError, ValidationError } from "@/shared/errors/AppError.js"

export type SendEmailChangeConfirmationFn = (
    newEmail: string,
    confirmToken: string,
) => Promise<void>
export type SendEmailChangedNoticeFn = (oldEmail: string, newEmail: string) => Promise<void>

const EMAIL_CHANGE_EXPIRES_MS = 60 * 60 * 1000 // 1h, mesmo prazo do reset de senha

// Serviço pequeno e focado (2 métodos), separado de AuthService de propósito
// — user.routes.ts precisa disparar o pedido de troca sem arrastar
// sendPasswordResetEmail (dependência de AuthService que não usaria).
export class EmailChangeService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly sendEmailChangeConfirmation: SendEmailChangeConfirmationFn,
        private readonly sendEmailChangedNotice: SendEmailChangedNoticeFn,
    ) {}

    async requestChange(params: {
        userId: string
        oldEmail: string
        newEmail: string
    }): Promise<void> {
        const { userId, oldEmail, newEmail } = params
        const confirmToken = randomUUID()
        const expiresAt = new Date(Date.now() + EMAIL_CHANGE_EXPIRES_MS)

        // Só o hash é persistido — mesmo padrão de PasswordReset/AuthToken/
        // RefreshToken (A04). O valor puro sai apenas no e-mail.
        await this.authRepository.createEmailChange({
            userId,
            newEmail,
            token: hashToken(confirmToken),
            expiresAt,
        })

        await this.sendEmailChangeConfirmation(newEmail, confirmToken)

        // Best-effort: o aviso ao endereço antigo é um sinal de alerta
        // precoce, não a peça que carrega a funcionalidade — uma falha
        // aqui (SMTP fora do ar, endereço antigo inválido) não pode
        // derrubar o pedido, que já está persistido e o e-mail de
        // confirmação já foi enviado.
        try {
            await this.sendEmailChangedNotice(oldEmail, newEmail)
        } catch (error) {
            logger.error({ err: error, userId }, "Falha ao enviar aviso de troca de e-mail")
        }
    }

    async confirmChange(input: unknown): Promise<{ userId: string }> {
        const parsed = confirmEmailChangeSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const { token } = parsed.data

        const change = await this.authRepository.findEmailChange(hashToken(token))

        if (!change) {
            throw new BadRequestError("Token de confirmação inválido ou expirado")
        }

        if (change.usedAt !== null) {
            throw new BadRequestError("Token de confirmação inválido ou expirado")
        }

        if (change.expiresAt < new Date()) {
            throw new BadRequestError("Token de confirmação inválido ou expirado")
        }

        // Checagem otimista (mesmo padrão de UserService.updateUser — sem
        // catch de violação de constraint em nenhum lugar do repositório
        // deste projeto): outra conta pode ter tomado o endereço entre o
        // pedido e a confirmação.
        const emailTaken = await this.authRepository.findUserByEmailWithPassword(change.newEmail)
        if (emailTaken && emailTaken.id !== change.userId) {
            throw new ConflictError("E-mail já está em uso")
        }

        await this.authRepository.confirmEmailChangeAndRevokeSessions({
            userId: change.userId,
            changeId: change.id,
            newEmail: change.newEmail,
        })

        return { userId: change.userId }
    }
}
