import PDFDocument from "pdfkit"
import { BRAND, ZAP_ICON_PATH, ZAP_ICON_VIEWBOX_SIZE } from "@/shared/pdf/brand.js"
import type { DataExportPayload } from "@/modules/export/export.service.js"
import type { UserWithoutPassword } from "@/modules/user/user.repository.js"

function userDisplayName(user: UserWithoutPassword): string {
    if (user.userType === "COMPANY") {
        return user.companyName ?? user.tradeName ?? user.email
    }
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    doc.moveDown(1)
    doc.fontSize(13).font("Helvetica-Bold").fillColor(BRAND.textColor).text(title)
    doc.moveDown(0.3)
    doc.fontSize(9).font("Helvetica").fillColor(BRAND.textColor)
}

function emptyNote(doc: PDFKit.PDFDocument, message: string): void {
    doc.fontSize(9).font("Helvetica-Oblique").fillColor(BRAND.mutedColor).text(message)
    doc.font("Helvetica").fillColor(BRAND.textColor)
}

function drawCover(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    const startY = doc.y
    const iconSize = 28
    const scale = iconSize / ZAP_ICON_VIEWBOX_SIZE

    doc.save()
    doc.translate(doc.page.margins.left, startY)
    doc.scale(scale)
    doc.path(ZAP_ICON_PATH).fill(BRAND.primaryColor)
    doc.restore()

    doc.fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(BRAND.textColor)
        .text(BRAND.appName, doc.page.margins.left + iconSize + 12, startY + 2)

    doc.x = doc.page.margins.left
    doc.y = startY + iconSize + 16

    doc.fontSize(16).font("Helvetica-Bold").text("Exportação de Dados Pessoais")
    doc.moveDown(0.5)

    doc.fontSize(10).font("Helvetica").fillColor(BRAND.mutedColor)
    doc.text(`Titular: ${userDisplayName(payload.user)} <${payload.user.email}>`)
    doc.text(`Gerado em: ${payload.generatedAt.toLocaleString("pt-BR")}`)
    doc.moveDown(1)

    doc.fontSize(8.5).fillColor(BRAND.mutedColor).text(
        "Documento gerado em atendimento ao direito de acesso do titular " +
            "(Art. 18 da Lei nº 13.709/2018 — LGPD). Para a lista completa e " +
            "detalhada de todos os dados, consulte a exportação em formato JSON.",
    )

    doc.fillColor(BRAND.textColor).font("Helvetica")
}

function drawUserSection(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    const { user } = payload
    sectionTitle(doc, "Dados de identificação")

    doc.text(`Tipo de conta: ${user.userType === "COMPANY" ? "Pessoa jurídica" : "Pessoa física"}`)
    doc.text(`E-mail: ${user.email}`)
    if (user.userType === "COMPANY") {
        doc.text(`Razão social: ${user.companyName ?? "—"}`)
        doc.text(`Nome fantasia: ${user.tradeName ?? "—"}`)
        doc.text(`CNPJ: ${user.cnpj ?? "—"}`)
    } else {
        doc.text(`Nome: ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}`)
        doc.text(`CPF: ${user.cpf ?? "—"}`)
    }
    doc.text(`Conta criada em: ${user.createdAt.toLocaleString("pt-BR")}`)
    doc.text(
        `Consentimento LGPD: ${
            user.consentedAt
                ? `aceito em ${user.consentedAt.toLocaleString("pt-BR")} (versão ${user.consentVersion ?? "—"})`
                : "não registrado"
        }`,
    )
}

function drawPropertiesSection(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    sectionTitle(doc, "Propriedades e distribuidoras")

    if (payload.properties.length === 0) {
        emptyNote(doc, "Nenhuma propriedade cadastrada.")
        return
    }

    const distributorById = new Map(payload.distributors.map((d) => [d.id, d]))

    for (const property of payload.properties) {
        const distributor = distributorById.get(property.distributorId)
        doc.font("Helvetica-Bold").text(property.name)
        doc.font("Helvetica")
        doc.text(
            `Endereço: ${[property.address, property.city, property.state, property.zipCode]
                .filter(Boolean)
                .join(", ") || "—"}`,
        )
        doc.text(
            `Distribuidora: ${distributor ? `${distributor.name} (CNPJ ${distributor.cnpj})` : "—"}`,
        )
        doc.moveDown(0.5)
    }
}

function drawAreasAndDevicesSection(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    sectionTitle(doc, "Áreas e dispositivos")

    if (payload.areas.length === 0) {
        emptyNote(doc, "Nenhuma área cadastrada.")
        return
    }

    const propertyNameById = new Map(payload.properties.map((p) => [p.id, p.name]))
    const devicesByArea = new Map<string, typeof payload.devices>()
    for (const device of payload.devices) {
        const list = devicesByArea.get(device.areaId) ?? []
        list.push(device)
        devicesByArea.set(device.areaId, list)
    }

    for (const area of payload.areas) {
        doc.font("Helvetica-Bold").text(`${area.name} (${propertyNameById.get(area.propertyId) ?? "—"})`)
        doc.font("Helvetica")

        const devices = devicesByArea.get(area.id) ?? []
        if (devices.length === 0) {
            doc.fillColor(BRAND.mutedColor).text("Nenhum dispositivo cadastrado.").fillColor(BRAND.textColor)
        } else {
            for (const device of devices) {
                doc.text(
                    `• ${device.name}${device.brand ? ` — ${device.brand}` : ""}${
                        device.powerWatts ? ` (${device.powerWatts}W)` : ""
                    }`,
                )
            }
        }
        doc.moveDown(0.5)
    }
}

function drawAlertsSection(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    sectionTitle(doc, "Alertas")

    if (payload.alerts.length === 0) {
        emptyNote(doc, "Nenhum alerta cadastrado.")
        return
    }

    for (const alert of payload.alerts) {
        const status = alert.triggeredAt
            ? `disparado em ${alert.triggeredAt.toLocaleString("pt-BR")}`
            : "não disparado"
        doc.text(
            `• [${alert.targetType}] limite de ${alert.thresholdKwh} kWh — ${status}${
                alert.message ? ` — "${alert.message}"` : ""
            }`,
        )
    }
}

function drawAuditLogSection(doc: PDFKit.PDFDocument, payload: DataExportPayload): void {
    sectionTitle(doc, "Histórico de acesso e segurança (audit log)")

    if (payload.auditLogs.length === 0) {
        emptyNote(doc, "Nenhum registro de auditoria encontrado.")
        return
    }

    for (const entry of payload.auditLogs) {
        doc.text(
            `• ${entry.createdAt.toLocaleString("pt-BR")} — ${entry.action} (${entry.outcome})` +
                (entry.ipAddress ? ` — IP ${entry.ipAddress}` : ""),
        )
    }
}

// Rodapé paginado — precisa de bufferPages:true para poder voltar a páginas
// já escritas depois que o conteúdo todo foi gerado (o total de páginas só
// é conhecido no final).
function drawFooterOnAllPages(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange()

    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)

        const bottom = doc.page.height - doc.page.margins.bottom + 10
        doc.fontSize(8)
            .fillColor(BRAND.mutedColor)
            .text(
                `${BRAND.appName} — página ${i + 1} de ${range.count}`,
                doc.page.margins.left,
                bottom,
                { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center" },
            )
    }
}

export async function generateDataExportPdf(payload: DataExportPayload): Promise<Buffer> {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const donePromise = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
        doc.on("error", reject)
    })

    drawCover(doc, payload)
    drawUserSection(doc, payload)
    drawPropertiesSection(doc, payload)
    drawAreasAndDevicesSection(doc, payload)
    drawAlertsSection(doc, payload)
    drawAuditLogSection(doc, payload)
    drawFooterOnAllPages(doc)

    doc.end()
    return donePromise
}
