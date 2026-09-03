import nodemailer from "nodemailer"
import { env } from "@/config/env.js"
import type { SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"
import type {
    SendEmailChangeConfirmationFn,
    SendEmailChangedNoticeFn,
} from "@/modules/auth/email-change.service.js"

// Transporter
// O transporter é criado uma única vez e reutilizado em todos os envios.
// Em desenvolvimento/testes, usar o Mailtrap (mailtrap.io) ou
// Ethereal (ethereal.email) — serviços que capturam e-mails sem entregá-los.
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
})

/**
 * Implementação real da função que o AuthService injeta em produção.
 * O link aponta para o frontend — o token vai como query param para que
 * a página de reset possa capturá-lo do URL ao carregar.
 *
 * @param email - Endereço do destinatário (titular da conta).
 * @param resetToken - Token de redefinição em texto claro (só existe neste e-mail).
 */
export const sendPasswordResetEmail: SendPasswordResetEmailFn = async (
    email: string,
    resetToken: string,
): Promise<void> => {
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`

    await transporter.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject: "Redefinição de senha — LumiTrack",
        // Versão texto puro para clientes que não renderizam HTML
        text: `Você solicitou a redefinição de senha do LumiTrack.\n\nAcesse o link abaixo para criar uma nova senha (válido por 1 hora):\n\n${resetLink}\n\nSe você não solicitou isso, ignore este e-mail.`,
        // Versão HTML para clientes modernos
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Redefinição de senha</h2>
                <p>Você solicitou a redefinição de senha da sua conta no <strong>LumiTrack</strong>.</p>
                <p>Clique no botão abaixo para criar uma nova senha. O link é válido por <strong>1 hora</strong>.</p>
                <p style="margin: 32px 0;">
                    <a
                        href="${resetLink}"
                        style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;"
                    >
                        Redefinir senha
                    </a>
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                    Se o botão não funcionar, copie e cole este link no seu navegador:<br />
                    <a href="${resetLink}" style="color: #2563eb;">${resetLink}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">
                    Se você não solicitou a redefinição de senha, ignore este e-mail.
                    Sua senha permanece a mesma.
                </p>
            </div>
        `,
    })
}

/**
 * Enviado ao NOVO endereço — só quem tem acesso à caixa de entrada consegue
 * efetivar a troca. Link aponta pra ConfirmEmailChangePage no frontend,
 * mesmo padrão de query param que sendPasswordResetEmail já usa.
 *
 * @param newEmail - Endereço de destino, ainda não efetivado na conta.
 * @param confirmToken - Token de confirmação em texto claro (só existe neste e-mail).
 */
export const sendEmailChangeConfirmation: SendEmailChangeConfirmationFn = async (
    newEmail: string,
    confirmToken: string,
): Promise<void> => {
    const confirmLink = `${env.FRONTEND_URL}/confirmar-email?token=${confirmToken}`

    await transporter.sendMail({
        from: env.SMTP_FROM,
        to: newEmail,
        subject: "Confirme seu novo e-mail — LumiTrack",
        text: `Foi solicitada a alteração do e-mail desta conta no LumiTrack para este endereço.\n\nAcesse o link abaixo para confirmar (válido por 1 hora):\n\n${confirmLink}\n\nSe você não solicitou isso, ignore este e-mail — nada muda até a confirmação.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Confirme seu novo e-mail</h2>
                <p>Foi solicitada a alteração do e-mail de uma conta no <strong>LumiTrack</strong> para este endereço.</p>
                <p>Clique no botão abaixo para confirmar. O link é válido por <strong>1 hora</strong>.</p>
                <p style="margin: 32px 0;">
                    <a
                        href="${confirmLink}"
                        style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;"
                    >
                        Confirmar novo e-mail
                    </a>
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                    Se o botão não funcionar, copie e cole este link no seu navegador:<br />
                    <a href="${confirmLink}" style="color: #2563eb;">${confirmLink}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">
                    Se você não solicitou essa alteração, ignore este e-mail — nada muda até a confirmação.
                </p>
            </div>
        `,
    })
}

/**
 * Enviado ao endereço ANTIGO, no momento do pedido — sinal de alerta precoce
 * para o dono legítimo agir (redefinir senha) antes mesmo de o pedido ser
 * confirmado, caso não tenha sido ele quem pediu a troca.
 *
 * @param oldEmail - Endereço atual da conta, que recebe o aviso.
 * @param newEmail - Endereço para o qual a troca foi solicitada.
 */
export const sendEmailChangedNotice: SendEmailChangedNoticeFn = async (
    oldEmail: string,
    newEmail: string,
): Promise<void> => {
    const forgotPasswordLink = `${env.FRONTEND_URL}/esqueci-senha`

    await transporter.sendMail({
        from: env.SMTP_FROM,
        to: oldEmail,
        subject: "Alteração de e-mail solicitada — LumiTrack",
        text: `Foi solicitada a troca do e-mail desta conta no LumiTrack para "${newEmail}". A troca só será efetivada após a confirmação pelo novo endereço.\n\nSe não foi você, redefina sua senha imediatamente:\n\n${forgotPasswordLink}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Alteração de e-mail solicitada</h2>
                <p>Foi solicitada a troca do e-mail desta conta no <strong>LumiTrack</strong> para <strong>${newEmail}</strong>.</p>
                <p>A troca só será efetivada após a confirmação pelo novo endereço — este e-mail é apenas um aviso.</p>
                <p style="margin: 32px 0;">
                    <a
                        href="${forgotPasswordLink}"
                        style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;"
                    >
                        Não fui eu — redefinir senha
                    </a>
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">
                    Se foi você quem solicitou, nenhuma ação é necessária além de confirmar pelo novo endereço.
                </p>
            </div>
        `,
    })
}
