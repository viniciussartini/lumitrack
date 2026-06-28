import type { Request, Response, NextFunction } from "express"
import type { ExportService } from "@/modules/export/export.service.js"
import { exportQuerySchema } from "@/modules/export/export.schema.js"
import { generateDataExportPdf } from "@/shared/pdf/dataExportPdf.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"
import { ValidationError } from "@/shared/errors/AppError.js"

export class ExportController {
    constructor(
        private readonly exportService: ExportService,
        private readonly auditService: AuditService,
    ) {}

    // GET /api/users/me/data-export?format=json|pdf — Autenticado
    async export(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const parsed = exportQuerySchema.safeParse(req.query)
            if (!parsed.success) {
                throw new ValidationError("Parâmetro 'format' inválido — use 'json' ou 'pdf'")
            }
            const { format } = parsed.data

            const { id: userId } = (req as AuthenticatedRequest).user
            const payload = await this.exportService.generate(userId)

            if (format === "pdf") {
                const pdfBuffer = await generateDataExportPdf(payload)
                res.status(200)
                    .set("Content-Type", "application/pdf")
                    .set("Content-Disposition", `attachment; filename="lumitrack-dados-${userId}.pdf"`)
                    .send(pdfBuffer)
            } else {
                res.status(200)
                    .set("Content-Type", "application/json")
                    .set("Content-Disposition", `attachment; filename="lumitrack-dados-${userId}.json"`)
                    .json({ status: "success", data: payload })
            }

            // Registrado depois do envio da resposta — auditService.record nunca
            // lança (absorve falhas internamente), então não há risco de erro
            // pós-resposta. Só audita sucesso: se a agregação/geração falhar
            // antes de chegar aqui, cai no catch e segue pro errorHandler sem
            // registrar DATA_EXPORT.
            await this.auditService.record({
                userId,
                action: "DATA_EXPORT",
                outcome: "SUCCESS",
                resourceType: "User",
                resourceId: userId,
                metadata: { format },
                ...getRequestContext(req),
            })
        } catch (error) {
            next(error)
        }
    }
}
