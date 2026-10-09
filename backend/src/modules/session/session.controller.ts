import type { Request, Response, NextFunction } from "express"
import type { SessionService } from "@/modules/session/session.service.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { clearSessionCookies } from "@/shared/security/sessionCookies.js"

/** Camada HTTP das sessões ativas — delega a regra a {@link SessionService}. */
export class SessionController {
    /**
     * @param service - Serviço da lista e do encerramento de sessões.
     * @param auditService - Registro das ações de encerramento.
     */
    constructor(
        private readonly service: SessionService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * `GET /api/sessions` — sessões ativas do usuário autenticado. O dono vem
     * sempre do token, nunca de parâmetro da requisição.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const items = await this.service.list(viewerOf(req))
            res.status(200).json({ status: "success", data: { items } })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `DELETE /api/sessions/:id` — encerra uma sessão do usuário. Se for a
     * sessão do próprio token e ela veio por cookie, limpa os cookies como o
     * logout.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.service.revoke(viewerOf(req), req.params)
            await this.recordRevocation(req, "one", 1, String(req.params["id"]))

            if (result.endedCurrent && (req as AuthenticatedRequest).authSource === "cookie") {
                clearSessionCookies(res)
            }
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    /**
     * `POST /api/sessions/revoke-others` — encerra todas as sessões do usuário,
     * menos a do próprio token.
     *
     * @param req - Requisição HTTP Express.
     * @param res - Resposta HTTP Express.
     * @param next - Encaminha erros ao middleware central de tratamento.
     */
    async revokeOthers(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.service.revokeOthers(viewerOf(req))
            await this.recordRevocation(req, "others", result.revoked, null)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // Só o escopo e a contagem vão em `metadata`: nunca token, dispositivo ou origem.
    private async recordRevocation(
        req: Request,
        scope: "one" | "others",
        count: number,
        resourceId: string | null,
    ): Promise<void> {
        await this.auditService.record({
            userId: (req as AuthenticatedRequest).user.id,
            action: "SESSION_REVOKE",
            outcome: "SUCCESS",
            resourceType: "Session",
            resourceId,
            metadata: { scope, count },
            ...getRequestContext(req),
        })
    }
}

const viewerOf = (req: Request) => {
    const { id: userId, sessionId, isDemo } = (req as AuthenticatedRequest).user
    return { userId, sessionId, isDemo }
}
