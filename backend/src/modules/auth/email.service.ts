import nodemailer from "nodemailer"
import { env } from "@/config/env.js"
import type { SendPasswordResetEmailFn } from "@/modules/auth/auth.service.js"

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

// Implementação real da função que o AuthService injeta em produção.
// O link aponta para o frontend — o token vai como query param para que
// a página de reset possa capturá-lo do URL ao carregar.
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