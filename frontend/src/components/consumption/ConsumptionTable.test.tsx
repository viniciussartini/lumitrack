import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { ConsumptionTable } from "@/components/consumption/ConsumptionTable"
import type { ConsumptionBucket } from "@/types/consumption.types"

const bucket = (hour: string, costBrl?: number): ConsumptionBucket => ({
    bucketStart: `2026-10-05T${hour}:00:00.000Z`,
    kwhConsumed: 2,
    avgPowerW: 500,
    ...(costBrl !== undefined && { costBrl }),
})

describe("ConsumptionTable", () => {
    it("mostra o custo do bucket quando ele é calculável", () => {
        render(<ConsumptionTable buckets={[bucket("10", 1.5)]} bucketSize="hour" />)

        const row = screen.getByTestId("consumption-row-2026-10-05T10:00:00.000Z")
        expect(within(row).getByText(/R\$\s?1,50/)).toBeInTheDocument()
    })

    it("custo ausente (Grupo A, Tarifa Branca) é '-', não R$ 0,00", () => {
        render(<ConsumptionTable buckets={[bucket("10")]} bucketSize="hour" />)

        const row = screen.getByTestId("consumption-row-2026-10-05T10:00:00.000Z")
        expect(within(row).getByText("-")).toBeInTheDocument()
        expect(within(row).queryByText(/R\$/)).not.toBeInTheDocument()
    })
})
