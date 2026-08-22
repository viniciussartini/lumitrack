import type { RequestHandler } from "express"
import { ForbiddenError } from "@/shared/errors/AppError.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"

// Estende a somente-leitura das contas demo (até aqui só a entidade User,
// ver user.service.ts) a toda escrita de domínio — property/area/device/
// meter/alert aceitavam gravação de dado real (ex.: Property.address) sem
// nenhuma trava, falseando a premissa de conformidade da ADR-0010 ("nenhum
// dado pessoal de pessoa real é armazenado"). Deve rodar sempre depois de
// `authenticate` na cadeia de rota — depende de `req.user.isDemo`.
//
// `ForbiddenError` é capturado centralmente pelo errorHandler, que já
// audita automaticamente como ACCESS_DENIED — nenhum código extra aqui.
export const blockDemoWrite: RequestHandler = (req, _res, next) => {
    // Fail-closed: se `authenticate` não rodou antes (erro de composição de
    // rota), `user` vem undefined — trata como demo em vez de estourar
    // TypeError (que responderia 500 e deixaria a escrita seguir se algum
    // handler de erro engolir a exceção). Mesmo idioma de errorHandler.ts.
    const isDemo = (req as Partial<AuthenticatedRequest>).user?.isDemo

    if (isDemo !== false) {
        next(new ForbiddenError("Conta de demonstração é somente leitura"))
        return
    }

    next()
}
