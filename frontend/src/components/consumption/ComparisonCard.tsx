import { useId, useState } from "react"
import { Blueprint } from "@/components/ui/Blueprint"
import { ComparisonBars, type ComparisonRow } from "@/components/consumption/ComparisonBars"

interface ComparisonCardProps {
    title: string
    /** Recorte da comparação, sem a unidade — ex.: "Consumo por área neste mês". */
    subtitle: string
    rows: ComparisonRow[]
    /** Aviso sob as barras — ex.: quantos itens ficaram de fora por falta de medidor. */
    notice?: string
    testId?: string
}

/**
 * Cartão "Comparação de …": barras do consumo do mês em kWh ou R$. O botão R$
 * só fica ativo quando ao menos uma linha tem custo — em Grupo A e Tarifa
 * Branca o custo de área e dispositivo não é calculável, e o cartão segue
 * útil em kWh com a explicação visível.
 */
export const ComparisonCard = ({ title, subtitle, rows, notice, testId }: ComparisonCardProps) => {
    const [unit, setUnit] = useState<"kwh" | "reais">("kwh")
    const hintId = useId()
    const hasCost = rows.some((row) => row.bucket.costBrl !== undefined)
    const activeUnit = hasCost ? unit : "kwh"
    const costNotice = buildCostNotice(rows, activeUnit)

    return (
        <Blueprint className="p-0" data-testid={testId}>
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-17 font-semibold uppercase">{title}</span>
                    <span className="text-muted text-12-5 mt-1 block">
                        {subtitle} ({activeUnit === "kwh" ? "kWh" : "R$"})
                    </span>
                    {!hasCost && (
                        <span id={hintId} className="text-muted text-12-5 mt-1 block">
                            Custo em R$ indisponível para esta tarifa.
                        </span>
                    )}
                </div>
                <UnitToggle
                    activeUnit={activeUnit}
                    hasCost={hasCost}
                    hintId={hintId}
                    onChange={setUnit}
                />
            </div>

            <div className="px-5 pt-2 pb-5">
                <ComparisonBars rows={rows} unit={activeUnit} />
                {[notice, costNotice].map(
                    (text) =>
                        text && (
                            <p key={text} className="text-muted text-12-5 m-0 mt-3">
                                {text}
                            </p>
                        ),
                )}
            </div>
        </Blueprint>
    )
}

/** Quantas linhas ficam de fora ao trocar para R$ por não terem custo calculável. */
const buildCostNotice = (
    rows: ComparisonRow[],
    activeUnit: "kwh" | "reais",
): string | undefined => {
    const withoutCost = rows.filter((row) => row.bucket.costBrl === undefined).length
    if (activeUnit !== "reais" || withoutCost === 0) return undefined

    return withoutCost === 1
        ? "1 item sem custo calculável não aparece em R$."
        : `${withoutCost} itens sem custo calculável não aparecem em R$.`
}

interface UnitToggleProps {
    activeUnit: "kwh" | "reais"
    hasCost: boolean
    hintId: string
    onChange: (unit: "kwh" | "reais") => void
}

const UnitToggle = ({ activeUnit, hasCost, hintId, onChange }: UnitToggleProps) => (
    <div role="group" aria-label="Unidade de comparação" className="flex gap-1.5">
        <button
            type="button"
            className="lt-selbtn"
            data-on={activeUnit === "kwh"}
            aria-pressed={activeUnit === "kwh"}
            onClick={() => onChange("kwh")}
        >
            kWh
        </button>
        <button
            type="button"
            className="lt-selbtn"
            data-on={activeUnit === "reais"}
            aria-pressed={activeUnit === "reais"}
            disabled={!hasCost}
            {...(!hasCost && { "aria-describedby": hintId })}
            onClick={() => onChange("reais")}
        >
            R$
        </button>
    </div>
)
