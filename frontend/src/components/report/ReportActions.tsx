import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { buildReportCsv, buildCsvFilename } from "@/lib/csv/reportCsv"
import { downloadFile } from "@/lib/download/downloadFile"
import type { ReportResult } from "@/types/report.types"

interface ReportActionsProps {
    result: ReportResult
    entityLabel: { artigo: "desta" | "deste"; nome: string }
}

/**
 * Botões "Imprimir" e "Exportar CSV" agrupados.
 *
 * Visibilidade:
 *   Renderizado pelo ReportView apenas quando há query.data — não faz
 *   sentido oferecer exportar/imprimir um relatório que ainda não
 *   carregou.
 *
 * Classe `print-hide`:
 *   Decoração que não deve aparecer no papel. O wrapper inteiro some
 *   no @media print (regra global em index.css).
 *
 * Acessibilidade:
 *   <Button asChild> não é usado aqui — não é um link. Mantemos
 *   <Button> nativo com onClick. Ícones com aria-hidden.
 */
export const ReportActions = ({ result, entityLabel }: ReportActionsProps) => {
    const handlePrint = () => {
        // Browser print dialog. CSS @media print no index.css cuida do layout.
        // Nada de window.print() async — é síncrono e bloqueia até o usuário
        // fechar o dialog. Suficiente; não precisa de feedback de loading.
        window.print()
    }

    const handleExportCsv = () => {
        const csv = buildReportCsv(result, entityLabel)
        const filename = buildCsvFilename(result)
        downloadFile(filename, "text/csv;charset=utf-8", csv)
    }

    return (
        <div
            className="print-hide flex flex-wrap gap-2"
            data-testid="report-actions"
        >
            <Button
                variant="secondary"
                size="sm"
                onClick={handlePrint}
                data-testid="report-action-print"
            >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Imprimir
            </Button>
            <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCsv}
                data-testid="report-action-csv"
            >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exportar CSV
            </Button>
        </div>
    )
}