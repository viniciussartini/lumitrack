import PDFDocument from "pdfkit"
import { BRAND, ZAP_ICON_PATH, ZAP_ICON_VIEWBOX_SIZE } from "@/shared/pdf/brand.js"
import type { ReportData } from "@/modules/report/report.types.js"
import {
    formatBrl,
    formatInstantDateTime,
    formatLocalDay,
    formatNumber,
    formatOptionalNumber,
    formatPeriodLabel,
    formatVariation,
    reportTitle,
} from "@/modules/report/generators/format.js"

const MARGIN = 50
const ROW_HEIGHT = 18
const KPI_GAP = 10

interface Column {
    header: string
    width: number
    align: "left" | "right"
}

function contentWidth(doc: PDFKit.PDFDocument): number {
    return doc.page.width - MARGIN * 2
}

function drawHeader(doc: PDFKit.PDFDocument, data: ReportData): void {
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

function drawInfoBlock(doc: PDFKit.PDFDocument, data: ReportData): void {
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

function drawKpis(doc: PDFKit.PDFDocument, data: ReportData): void {
    const kpis: { label: string; value: string; note: string }[] = [
        { label: "Consumo total", value: `${formatNumber(data.kpis.totalKwh)} kWh`, note: "" },
        {
            label: "Média diária",
            value: `${formatNumber(data.kpis.averageDailyKwh)} kWh`,
            note: "",
        },
        {
            label: "Maior consumo diário",
            value: data.kpis.peakDay ? `${formatNumber(data.kpis.peakDay.kwhConsumed)} kWh` : "-",
            note: data.kpis.peakDay ? formatLocalDay(data.kpis.peakDay.day) : "",
        },
    ]
    if (data.monthly) {
        kpis.push({
            label: "Custo do mês",
            value: formatBrl(data.monthly.costBrl),
            note: `${formatVariation(data.monthly.variationPercent)} no consumo vs. mês anterior`,
        })
    }

    doc.moveDown(1)
    const top = doc.y
    const boxWidth = (contentWidth(doc) - KPI_GAP * (kpis.length - 1)) / kpis.length
    const boxHeight = 56

    kpis.forEach((kpi, i) => {
        const x = MARGIN + i * (boxWidth + KPI_GAP)
        doc.roundedRect(x, top, boxWidth, boxHeight, 4).lineWidth(0.5).stroke(BRAND.mutedColor)
        doc.fontSize(7.5)
            .font("Helvetica-Bold")
            .fillColor(BRAND.mutedColor)
            .text(kpi.label.toUpperCase(), x + 8, top + 8, { width: boxWidth - 16 })
        doc.fontSize(12)
            .font("Helvetica-Bold")
            .fillColor(BRAND.textColor)
            .text(kpi.value, x + 8, top + 22, { width: boxWidth - 16 })
        if (kpi.note) {
            doc.fontSize(7)
                .font("Helvetica")
                .fillColor(BRAND.mutedColor)
                .text(kpi.note, x + 8, top + 40, { width: boxWidth - 16 })
        }
    })

    doc.x = MARGIN
    doc.y = top + boxHeight + 6
    doc.fillColor(BRAND.textColor)
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
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
function drawTable(doc: PDFKit.PDFDocument, columns: Column[], rows: string[][]): void {
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

function emptyNote(doc: PDFKit.PDFDocument, message: string): void {
    doc.fontSize(9).font("Helvetica-Oblique").fillColor(BRAND.mutedColor).text(message)
    doc.font("Helvetica").fillColor(BRAND.textColor)
}

function drawDailySection(doc: PDFKit.PDFDocument, data: ReportData): void {
    sectionTitle(doc, "Consumo diário")
    if (data.daily.length === 0) {
        emptyNote(doc, "Sem leituras no período.")
        return
    }
    const width = contentWidth(doc)
    drawTable(
        doc,
        [
            { header: "Dia", width: width * 0.3, align: "left" },
            { header: "Consumo (kWh)", width: width * 0.35, align: "right" },
            { header: "Potência média (W)", width: width * 0.35, align: "right" },
        ],
        data.daily.map((row) => [
            formatLocalDay(row.day),
            formatNumber(row.kwhConsumed),
            formatNumber(row.avgPowerW, 0),
        ]),
    )
}

function drawChildrenSection(doc: PDFKit.PDFDocument, data: ReportData): void {
    if (!data.children) return
    sectionTitle(
        doc,
        `Consumo por ${data.children.kind === "Ambientes" ? "ambiente" : "dispositivo"}`,
    )
    if (data.children.rows.length === 0) {
        emptyNote(doc, `Nenhum item em ${data.children.kind.toLowerCase()}.`)
        return
    }
    const width = contentWidth(doc)
    drawTable(
        doc,
        [
            {
                header: data.children.kind === "Ambientes" ? "Ambiente" : "Dispositivo",
                width: width * 0.5,
                align: "left",
            },
            { header: "Consumo (kWh)", width: width * 0.3, align: "right" },
            { header: "Participação", width: width * 0.2, align: "right" },
        ],
        data.children.rows.map((row) => [
            row.name,
            formatOptionalNumber(row.kwhConsumed),
            row.sharePercent === null ? "-" : `${formatNumber(row.sharePercent)}%`,
        ]),
    )
}

// Rodapé paginado: precisa de bufferPages para voltar às páginas já escritas
// depois de conhecido o total.
function drawFooterOnAllPages(doc: PDFKit.PDFDocument, data: ReportData): void {
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
 * PDF A4 do relatório, na identidade visual do produto: cabeçalho da marca,
 * resumo do alvo e do período, indicadores, tabela diária e, quando o alvo
 * tem filhos, o consumo por ambiente/dispositivo.
 *
 * @param data - Dados do relatório, já agregados.
 * @returns O arquivo em bytes.
 */
export function generateReportPdf(data: ReportData): Promise<Buffer> {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)))
        doc.on("error", reject)
    })

    drawHeader(doc, data)
    drawInfoBlock(doc, data)
    drawKpis(doc, data)
    drawDailySection(doc, data)
    drawChildrenSection(doc, data)
    drawFooterOnAllPages(doc, data)

    doc.end()
    return done
}
