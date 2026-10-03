import { BRAND } from "@/shared/pdf/brand.js"
import type { ReportCell, ReportDocument, ReportTable } from "@/modules/report/report.types.js"
import {
    contentWidth,
    drawFooterOnAllPages,
    drawHeader,
    drawInfoBlock,
    drawTable,
    emptyNote,
    openPdf,
    sectionTitle,
    type Column,
} from "@/modules/report/generators/pdfLayout.js"
import { formatNumber } from "@/modules/report/generators/format.js"

/** Texto de uma célula no PDF: número com as casas pedidas e ausência como "-". */
export function formatCell(cell: ReportCell): string {
    if (cell === null) return "-"
    if (typeof cell === "string") return cell
    if (typeof cell === "number") return formatNumber(cell, 0)
    return cell.value === null ? "-" : formatNumber(cell.value, cell.digits)
}

// Colunas de texto levam mais largura que as numéricas: peso 2 contra 1.
function tableColumns(doc: PDFKit.PDFDocument, table: ReportTable): Column[] {
    const weights = table.columns.map((column) => (column.align === "left" ? 2 : 1))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    return table.columns.map((column, i) => ({
        header: column.header,
        align: column.align,
        width: (contentWidth(doc) * (weights[i] ?? 1)) / total,
    }))
}

function drawSummary(doc: PDFKit.PDFDocument, data: ReportDocument): void {
    doc.moveDown(0.8)
    doc.fontSize(9)
    for (const line of data.summary) {
        doc.font("Helvetica-Bold")
            .fillColor(BRAND.mutedColor)
            .text(`${line.label}: `, { continued: true })
        doc.font("Helvetica").fillColor(BRAND.textColor).text(formatCell(line.value))
    }
}

function drawNotes(doc: PDFKit.PDFDocument, notes: string[]): void {
    if (notes.length === 0) return
    doc.moveDown(1)
    for (const note of notes) emptyNote(doc, note)
}

/**
 * PDF A4 dos relatórios de resumo e tabelas (alertas, qualidade de energia e
 * demanda), com o mesmo cabeçalho, tabelas paginadas e rodapé dos demais.
 *
 * @param data - Relatório já montado.
 * @returns O arquivo em bytes.
 */
export function generateDocumentPdf(data: ReportDocument): Promise<Buffer> {
    const { doc, done } = openPdf()

    drawHeader(doc, data)
    drawInfoBlock(doc, data)
    drawSummary(doc, data)
    for (const table of data.tables) {
        sectionTitle(doc, table.title)
        if (table.rows.length === 0) {
            emptyNote(doc, table.emptyNote)
            continue
        }
        drawTable(
            doc,
            tableColumns(doc, table),
            table.rows.map((row) => row.map(formatCell)),
        )
    }
    drawNotes(doc, data.notes)
    drawFooterOnAllPages(doc, data)

    doc.end()
    return done
}
