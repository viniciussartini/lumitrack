import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Tamanho do bucket de agregação — NÃO é a janela consultada. Quem escolhe a
// janela é o par `from`/`to`: a UI pede, por exemplo, bucket de minuto dentro
// da janela de uma hora (ver `lib/consumptionWindow.ts` no frontend).
export const granularitySchema = z.enum(["minute", "hour", "day", "month", "year"])
export type Granularity = z.infer<typeof granularitySchema>

// Ordem cronológica dos buckets. Default `desc` (mais recente primeiro) —
// é o que "traga os últimos N buckets" precisa (KPIs e comparação do painel).
// Listagens de janela pedem `asc` para paginar do início da janela para o fim.
export const bucketOrderSchema = z.enum(["asc", "desc"])
export type BucketOrder = z.infer<typeof bucketOrderSchema>

export const listConsumptionQuerySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid({ message: "targetId inválido" }),
        granularity: granularitySchema,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        order: bucketOrderSchema.default("desc"),
    })
    .extend(paginationQuerySchema.shape)

export type ListConsumptionQuery = z.infer<typeof listConsumptionQuerySchema>

// Teto de ids do lote — protege o GROUP BY de custo não limitado. 50 é
// generoso para o uso real (nenhuma tela do
// produto lista mais que algumas dezenas de propriedades/áreas/dispositivos
// por usuário) sem ser um número tão pequeno a ponto de estourar em contas
// legítimas.
const MAX_SUMMARY_IDS = 50

// GET /api/consumption/summary — um tipo de alvo só vale pra lista inteira
// de `ids` (não faz sentido misturar PROPERTY e DEVICE no mesmo lote: são
// comparações diferentes). `ids` chega como CSV na query string.
export const consumptionSummaryQuerySchema = z.object({
    targetType: targetTypeSchema,
    ids: z
        .string()
        .transform((s) => s.split(","))
        .pipe(
            z
                .array(z.string().uuid({ message: "id inválido em ids" }))
                .min(1)
                .max(MAX_SUMMARY_IDS),
        ),
    granularity: granularitySchema,
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
})

export type ConsumptionSummaryQuery = z.infer<typeof consumptionSummaryQuerySchema>

// Teto de meses das comparações de propriedade (ACR×ACL, Convencional×Branca)
// — mesma razão do MAX_SUMMARY_IDS acima: sem ele, o laço de mês e as duas
// consultas de custo por mês de cada comparação ficam ilimitados a partir só
// da query string.
const MAX_COMPARISON_MONTHS = 24

// Query comum às comparações de propriedade: um `propertyId` e uma janela
// `from`/`to` de até MAX_COMPARISON_MONTHS meses, recalculada em dois
// cenários. Extraído porque `acl-comparison` e `branca-comparison` compartilham
// exatamente esta forma — só o cálculo de cada cenário difere, na service.
function propertyComparisonQuerySchema() {
    return z
        .object({
            propertyId: z.uuid({ message: "propertyId inválido" }),
            from: z.coerce.date({ error: "from deve ser uma data válida" }),
            to: z.coerce.date({ error: "to deve ser uma data válida" }),
        })
        .refine((data) => data.to >= data.from, {
            message: "to deve ser maior ou igual a from",
            path: ["to"],
        })
        .refine(
            (data) => {
                const months =
                    (data.to.getUTCFullYear() - data.from.getUTCFullYear()) * 12 +
                    (data.to.getUTCMonth() - data.from.getUTCMonth()) +
                    1
                return months <= MAX_COMPARISON_MONTHS
            },
            {
                message: `Janela de comparação limitada a ${MAX_COMPARISON_MONTHS} meses`,
                path: ["to"],
            },
        )
}

// GET /api/consumption/acl-comparison — janela de meses cujo consumo real é
// recalculado nos dois cenários (ACR/ACL).
export const compareAclToAcrQuerySchema = propertyComparisonQuerySchema()

export type CompareAclToAcrQuery = z.infer<typeof compareAclToAcrQuerySchema>

// GET /api/consumption/branca-comparison — janela de meses cujo consumo real
// é recalculado nos dois cenários (Convencional/Branca).
export const compareBrancaToConvencionalQuerySchema = propertyComparisonQuerySchema()

export type CompareBrancaToConvencionalQuery = z.infer<
    typeof compareBrancaToConvencionalQuerySchema
>
