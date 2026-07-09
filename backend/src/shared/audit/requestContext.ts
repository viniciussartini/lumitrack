import type { Request } from "express"

export function getRequestContext(req: Request): { ipAddress: string | null; userAgent: string | null } {
    const userAgent = req.headers["user-agent"]

    return {
        ipAddress: req.ip ?? null,
        userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
    }
}

// Heurística best-effort para inferir o recurso de um 403 capturado
// genericamente no errorHandler (sem instrumentar cada um dos ~17 pontos
// que lançam ForbiddenError). Não é 100% precisa para rotas profundamente
// aninhadas (ex.: /properties/:propertyId/areas/:id) — nesses casos o
// `path`/`method` originais ficam em `metadata` para reconstrução manual.
export function inferResource(req: Request): { resourceType: string | null; resourceId: string | null } {
    const segments = req.path.split("/").filter(Boolean)
    const apiIndex = segments.indexOf("api")
    const resourceType = apiIndex >= 0 ? segments[apiIndex + 1] ?? null : null
    const rawResourceId = req.params["id"] ?? Object.values(req.params)[0]
    const resourceId = Array.isArray(rawResourceId) ? rawResourceId[0] ?? null : rawResourceId ?? null

    return { resourceType, resourceId }
}
