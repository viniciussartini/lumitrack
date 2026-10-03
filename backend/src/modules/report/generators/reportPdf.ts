import { BRAND } from "@/shared/pdf/brand.js"
import {
    isReportDocument,
    type ReportContent,
    type ReportData,
} from "@/modules/report/report.types.js"
import {
    MARGIN,
    contentWidth,
    drawFooterOnAllPages,
    drawHeader,
    drawInfoBlock,
    drawTable,
    emptyNote,
    openPdf,
    sectionTitle,
} from "@/modules/report/generators/pdfLayout.js"
import { generateDocumentPdf } from "@/modules/report/generators/documentPdf.js"
import {
    formatBrl,
    formatLocalDay,
    formatNumber,
    formatOptionalNumber,
    formatVariation,
} from "@/modules/report/generators/format.js"

const KPI_GAP = 10

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

/**
 * PDF A4 do relatório, na identidade visual do produto. O de consumo e o
 * mensal têm cabeçalho da marca, resumo do alvo e do período, indicadores,
 * tabela diária e, quando o alvo tem filhos, o consumo por
 * ambiente/dispositivo; os demais tipos seguem o formato de resumo e tabelas.
 *
 * @param data - Conteúdo do relatório, já agregado.
 * @returns O arquivo em bytes.
 */
export function generateReportPdf(data: ReportContent): Promise<Buffer> {
    if (isReportDocument(data)) return generateDocumentPdf(data)
    return generateConsumptionPdf(data)
}

function generateConsumptionPdf(data: ReportData): Promise<Buffer> {
    const { doc, done } = openPdf()

    drawHeader(doc, data)
    drawInfoBlock(doc, data)
    drawKpis(doc, data)
    drawDailySection(doc, data)
    drawChildrenSection(doc, data)
    drawFooterOnAllPages(doc, data)

    doc.end()
    return done
}
