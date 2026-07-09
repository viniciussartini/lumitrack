import { z } from "zod"

// Único parâmetro de entrada do endpoint de exportação — não afeta a
// agregação de dados (idêntica para os dois formatos), só a forma como o
// payload já montado é serializado na resposta.
export const exportQuerySchema = z.object({
    format: z.enum(["json", "pdf"]).optional().default("json"),
})

export type ExportFormat = z.infer<typeof exportQuerySchema>["format"]
export type ExportQuery = z.infer<typeof exportQuerySchema>
