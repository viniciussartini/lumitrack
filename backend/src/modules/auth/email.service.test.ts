import { describe, it, expect, beforeEach, vi } from "vitest"

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }))

vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ sendMail }) },
}))

import { sendScheduledReportEmail } from "@/modules/auth/email.service.js"
import { env } from "@/config/env.js"

const EMAIL = {
    recipients: ["financeiro@example.com", "sindico@example.com"],
    reportType: "CONSUMPTION" as const,
    periodLabel: "01/07/2026 a 31/07/2026",
    fileName: "lumitrack-relatorio-consumption-2026-07.pdf",
    contentType: "application/pdf",
    content: Buffer.from("%PDF"),
}

beforeEach(() => {
    vi.clearAllMocks()
    sendMail.mockResolvedValue({ accepted: ["financeiro@example.com"] })
})

describe("sendScheduledReportEmail", () => {
    it("manda os destinatários só em cópia oculta, para um não ver o endereço do outro", async () => {
        await sendScheduledReportEmail(EMAIL)

        const message = sendMail.mock.calls[0]![0]
        expect(message.bcc).toEqual(EMAIL.recipients)
        expect(message.to).toBe(env.SMTP_FROM)
        expect(message.cc).toBeUndefined()
        expect(JSON.stringify(message.to)).not.toContain("@example.com")
    })

    it("anexa o arquivo com o nome e o tipo informados", async () => {
        await sendScheduledReportEmail(EMAIL)

        expect(sendMail.mock.calls[0]![0].attachments).toEqual([
            { filename: EMAIL.fileName, content: EMAIL.content, contentType: EMAIL.contentType },
        ])
    })

    it("falha quando o servidor SMTP não aceita nenhum destinatário", async () => {
        sendMail.mockResolvedValue({ accepted: [] })

        await expect(sendScheduledReportEmail(EMAIL)).rejects.toThrow(/Nenhum destinatário aceito/)
    })

    it("o assunto e o corpo não carregam texto digitado pelo usuário", async () => {
        await sendScheduledReportEmail(EMAIL)

        const message = sendMail.mock.calls[0]![0]
        expect(message.subject).toBe("Relatório de consumo — LumiTrack")
        expect(message.text).toContain(EMAIL.periodLabel)
        expect(message.text).not.toContain("example.com")
    })
})
