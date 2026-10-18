import { z } from "zod"

/** Parâmetro de rota das sessões: o id é o `sessionId`, um uuid. */
export const sessionParamsSchema = z.object({ id: z.uuid({ message: "id inválido" }) })
