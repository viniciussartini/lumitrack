import type { Request, Response, NextFunction } from "express"
import type { ReportService } from "@/modules/report/report.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"

/** Camada HTTP dos relatórios — delega toda a regra a {@link ReportService}. */
export class ReportController {
    /**
     * @param reportService - Serviço de emissão e download de relatórios.
     * @param auditService - Trilha de auditoria da emissão (o arquivo contém dado do titular).
     */
    constructor(
        private readonly reportService: ReportService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * `POST /api/reports` — emite um relatório e devolve seus metadados.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const report = await this.reportService.generate(userId, req.body)
            res.status(201).json({ status: "success", data: report })

            // Depois da resposta: `auditService.record` absorve falhas internas, e só
            // a emissão bem-sucedida é auditada. Só metadados — nunca o conteúdo.
            await this.auditService.record({
                userId,
                action: "REPORT_GENERATE",
                outcome: "SUCCESS",
                resourceType: "Report",
                resourceId: report.id,
                metadata: { type: report.type, format: report.format },
                ...getRequestContext(req),
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/reports?page=&pageSize=` — histórico paginado do usuário.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.reportService.list(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/reports/:id` — exclui um relatório do usuário.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.reportService.remove(userId, req.params)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    /**
     * `GET /api/reports/:id/download` — devolve o arquivo em anexo.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async download(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const file = await this.reportService.getFile(userId, req.params)
            res.status(200)
                .set("Content-Type", file.contentType)
                .set("Content-Disposition", `attachment; filename="${file.fileName}"`)
                .send(file.content)
        } catch (error) {
            next(error)
        }
    }
}
