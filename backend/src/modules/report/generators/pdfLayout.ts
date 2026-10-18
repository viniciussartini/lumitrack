import PDFDocument from "pdfkit"
import { BRAND, ZAP_ICON_PATH, ZAP_ICON_VIEWBOX_SIZE } from "@/shared/pdf/brand.js"
import type { ReportBase } from "@/modules/report/report.types.js"
import {
    formatInstantDateTime,
    formatPeriodLabel,
    reportTitle,
} from "@/modules/report/generators/format.js"

export const MARGIN = 50
const ROW_HEIGHT = 18

export interface Column {
    header: string
    width: number
    align: "left" | "right"
}

export function contentWidth(doc: PDFKit.PDFDocument): number {
    return doc.page.width - MARGIN * 2
}

export function drawHeader(doc: PDFKit.PDFDocument, data: ReportBase): void {
    const startY = doc.y
    const iconSize = 24
    const scale = iconSize / ZAP_ICON_VIEWBOX_SIZE

    doc.save()
    doc.translate(MARGIN, startY)
    doc.scale(scale)
    doc.path(ZAP_ICON_PATH).fill(BRAND.primaryColor)
    doc.restore()

    doc.fontSize(18)
        .font("Helvetica-Bold")
        .fillColor(BRAND.textColor)
        .text(BRAND.appName, MARGIN + iconSize + 10, startY + 2)

    doc.x = MARGIN
    doc.y = startY + iconSize + 14
    doc.fontSize(15).font("Helvetica-Bold").text(reportTitle(data.type))
    doc.moveDown(0.2)
    doc.fontSize(10)
        .font("Helvetica")
        .fillColor(BRAND.mutedColor)
        .text(`${data.target.kind}: ${data.target.name}`)
        .text(`Período: ${formatPeriodLabel(data.period.from, data.period.to)}`)
        .text(`Emitido em ${formatInstantDateTime(data.generatedAt)}`)
    doc.fillColor(BRAND.textColor)
}

export function drawInfoBlock(doc: PDFKit.PDFDocument, data: ReportBase): void {
    doc.moveDown(0.8)
    const lines: [string, string][] = [
        ["Propriedade", data.property.name],
        ["Distribuidora", data.property.distributorName ?? "-"],
        ["Enquadramento", data.property.tariffLabel],
    ]
    doc.fontSize(9)
    for (const [label, value] of lines) {
        doc.font("Helvetica-Bold")
            .fillColor(BRAND.mutedColor)
            .text(`${label}: `, { continued: true })
        doc.font("Helvetica").fillColor(BRAND.textColor).text(value)
    }
}

export function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    doc.moveDown(1)
    doc.fontSize(12).font("Helvetica-Bold").fillColor(BRAND.textColor).text(title)
    doc.moveDown(0.4)
}

function drawTableRow(
    doc: PDFKit.PDFDocument,
    columns: Column[],
    cells: string[],
    y: number,
    bold: boolean,
): void {
    let x = MARGIN
    doc.fontSize(9)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(bold ? BRAND.mutedColor : BRAND.textColor)
    columns.forEach((column, i) => {
        doc.text(cells[i] ?? "", x + 4, y + 4, {
            width: column.width - 8,
            align: column.align,
            lineBreak: false,
            ellipsis: true,
        })
        x += column.width
    })
    doc.moveTo(MARGIN, y + ROW_HEIGHT)
        .lineTo(MARGIN + contentWidth(doc), y + ROW_HEIGHT)
        .lineWidth(bold ? 0.8 : 0.3)
        .stroke(bold ? BRAND.primaryColor : "#e2e8f0")
}

// Quebra de página manual: repete o cabeçalho da tabela na página nova, para
// uma tabela de 92 linhas continuar legível.
export function drawTable(doc: PDFKit.PDFDocument, columns: Column[], rows: string[][]): void {
    const pageBottom = doc.page.height - MARGIN - 20
    let y = doc.y
    const headers = columns.map((c) => c.header)

    const startPageIfNeeded = (): void => {
        if (y + ROW_HEIGHT > pageBottom) {
            doc.addPage()
            y = MARGIN
            drawTableRow(doc, columns, headers, y, true)
            y += ROW_HEIGHT
        }
    }

    startPageIfNeeded()
    drawTableRow(doc, columns, headers, y, true)
    y += ROW_HEIGHT
    for (const row of rows) {
        startPageIfNeeded()
        drawTableRow(doc, columns, row, y, false)
        y += ROW_HEIGHT
    }
    doc.x = MARGIN
    doc.y = y
}

export function emptyNote(doc: PDFKit.PDFDocument, message: string): void {
    doc.fontSize(9).font("Helvetica-Oblique").fillColor(BRAND.mutedColor).text(message)
    doc.font("Helvetica").fillColor(BRAND.textColor)
}

// Rodapé paginado: precisa de bufferPages para voltar às páginas já escritas
// depois de conhecido o total.
export function drawFooterOnAllPages(doc: PDFKit.PDFDocument, data: ReportBase): void {
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        doc.fontSize(8)
            .font("Helvetica")
            .fillColor(BRAND.mutedColor)
            .text(
                `${reportTitle(data.type)} — página ${i + 1} de ${range.count}`,
                MARGIN,
                doc.page.height - MARGIN + 10,
                { width: contentWidth(doc), align: "center", lineBreak: false },
            )
    }
}

/**
 * Abre um documento A4 com páginas em buffer (o rodapé paginado precisa
 * voltar às páginas já escritas).
 *
 * @returns O documento e a promessa do arquivo pronto, resolvida em `doc.end()`.
 */
export function openPdf(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
        doc.on("error", reject)
    })
    return { doc, done }
}
