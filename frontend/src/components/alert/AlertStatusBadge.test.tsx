import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AlertStatusBadge } from "@/components/alert/AlertStatusBadge"
import type { Alert } from "@/types/alert.types"

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

describe("AlertStatusBadge — status derivation", () => {
    it("renderiza 'Ativo' quando o alerta não disparou", () => {
        render(<AlertStatusBadge alert={makeAlert()} />)

        expect(screen.getByText("Ativo")).toBeInTheDocument()
        expect(screen.getByTestId("alert-status-badge-alert-1")).toHaveAttribute(
            "data-status",
            "ACTIVE",
        )
    })

    it("renderiza 'Disparado' quando triggeredAt está preenchido e readAt não", () => {
        render(
            <AlertStatusBadge
                alert={makeAlert({
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                })}
            />,
        )

        expect(screen.getByText("Disparado")).toBeInTheDocument()
        expect(screen.getByTestId("alert-status-badge-alert-1")).toHaveAttribute(
            "data-status",
            "TRIGGERED",
        )
    })

    it("renderiza 'Lido' quando readAt está preenchido (mesmo com triggeredAt)", () => {
        render(
            <AlertStatusBadge
                alert={makeAlert({
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: "2025-11-11T08:30:00.000Z",
                })}
            />,
        )

        // READ tem precedência sobre TRIGGERED (definição de getAlertStatus)
        expect(screen.getByText("Lido")).toBeInTheDocument()
        expect(screen.getByTestId("alert-status-badge-alert-1")).toHaveAttribute(
            "data-status",
            "READ",
        )
    })
})

describe("AlertStatusBadge — estilo por status", () => {
    it("ACTIVE tem classes de cinza neutro", () => {
        render(<AlertStatusBadge alert={makeAlert()} />)
        const badge = screen.getByTestId("alert-status-badge-alert-1")

        expect(badge.className).toMatch(/bg-slate-100/)
        expect(badge.className).toMatch(/text-slate-700/)
    })

    it("TRIGGERED tem classes vermelhas (destaque)", () => {
        render(
            <AlertStatusBadge
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
            />,
        )
        const badge = screen.getByTestId("alert-status-badge-alert-1")

        expect(badge.className).toMatch(/bg-red-100/)
        expect(badge.className).toMatch(/text-red-700/)
    })

    it("READ tem classes de cinza fraco (apagado)", () => {
        render(
            <AlertStatusBadge
                alert={makeAlert({
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: "2025-11-11T08:30:00.000Z",
                })}
            />,
        )
        const badge = screen.getByTestId("alert-status-badge-alert-1")

        expect(badge.className).toMatch(/bg-slate-50/)
        expect(badge.className).toMatch(/text-slate-500/)
    })
})

describe("AlertStatusBadge — composição de className", () => {
    it("respeita className extra passado por prop", () => {
        render(
            <AlertStatusBadge alert={makeAlert()} className="ml-2" />,
        )
        const badge = screen.getByTestId("alert-status-badge-alert-1")

        expect(badge.className).toMatch(/ml-2/)
    })
})