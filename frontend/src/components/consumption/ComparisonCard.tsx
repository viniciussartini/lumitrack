import { useId, useState } from "react"
import { Blueprint } from "@/components/ui/Blueprint"
import { ComparisonBars, type ComparisonRow } from "@/components/consumption/ComparisonBars"

interface ComparisonCardProps {
    title: string
    /** Recorte da comparação, sem a unidade — ex.: "Consumo por área neste mês". */
    subtitle: string
    rows: ComparisonRow[]
    testId?: string
}

/**
 * Cartão "Comparação de …": barras do consumo do mês em kWh ou R$. O botão R$
 * só fica ativo quando ao menos uma linha tem custo — em Grupo A e Tarifa
 * Branca o custo de área e dispositivo não é calculável, e o cartão segue
 * útil em kWh com a explicação visível.
 */
export const ComparisonCard = ({ title, subtitle, rows, testId }: ComparisonCardProps) => {
    const [unit, setUnit] = useState<"kwh" | "reais">("kwh")
    const hintId = useId()
    const hasCost = rows.some((row) => row.bucket.costBrl !== undefined)
    const activeUnit = hasCost ? unit : "kwh"

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
                <div role="group" aria-label="Unidade de comparação" className="flex gap-1.5">
                    <button
                        type="button"
                        className="lt-selbtn"
                        data-on={activeUnit === "kwh"}
                        aria-pressed={activeUnit === "kwh"}
                        onClick={() => setUnit("kwh")}
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
                        onClick={() => setUnit("reais")}
                    >
                        R$
                    </button>
                </div>
            </div>

            <div className="px-5 pt-2 pb-5">
                <ComparisonBars rows={rows} unit={activeUnit} />
            </div>
        </Blueprint>
    )
}
