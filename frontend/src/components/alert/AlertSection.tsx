import { useMemo, useState } from "react"
import { AlertCircle, Bell, Plus } from "lucide-react"
import type { UseQueryResult } from "@tanstack/react-query"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { AlertTable } from "@/components/alert/AlertTable"
import { AlertFormDialog } from "@/components/alert/AlertFormDialog"
import {
    useAlertsByProperty,
    useAlertsByArea,
    useAlertsByDevice,
} from "@/hooks/queries/useAlerts"
import { cn } from "@/lib/cn"
import {
    getAlertStatus,
    type Alert,
    type AlertFormTarget,
} from "@/types/alert.types"

interface EntityLabel {
    artigo: "desta" | "deste"
    nome: string
}

// Wrappers "smart" — um por target

interface PropertyAlertSectionProps {
    propertyId: string
}

export const PropertyAlertSection = ({
    propertyId,
}: PropertyAlertSectionProps) => {
    const query = useAlertsByProperty(propertyId)
    const target: AlertFormTarget = { type: "property", propertyId }

    return (
        <AlertSection
            query={query}
            target={target}
            entityLabel={{ artigo: "desta", nome: "propriedade" }}
        />
    )
}

interface AreaAlertSectionProps {
    propertyId: string
    areaId: string
}

export const AreaAlertSection = ({
    propertyId,
    areaId,
}: AreaAlertSectionProps) => {
    const query = useAlertsByArea(propertyId, areaId)
    const target: AlertFormTarget = { type: "area", propertyId, areaId }

    return (
        <AlertSection
            query={query}
            target={target}
            entityLabel={{ artigo: "desta", nome: "área" }}
        />
    )
}

interface DeviceAlertSectionProps {
    propertyId: string
    areaId: string
    deviceId: string
}

export const DeviceAlertSection = ({
    propertyId,
    areaId,
    deviceId,
}: DeviceAlertSectionProps) => {
    const query = useAlertsByDevice(propertyId, areaId, deviceId)
    const target: AlertFormTarget = {
        type: "device",
        propertyId,
        areaId,
        deviceId,
    }

    return (
        <AlertSection
            query={query}
            target={target}
            entityLabel={{ artigo: "deste", nome: "dispositivo" }}
        />
    )
}

// Presentational

interface AlertSectionProps {
    query: UseQueryResult<Alert[]>
    target: AlertFormTarget
    entityLabel: EntityLabel
}

const MAX_ALERTS_DISPLAYED = 20

/**
 * Seção de alertas para uma entity específica (Property/Area/Device).
 * 
 * Funcionalidades:
 *   - Header com botão "Criar alerta" à direita
 *   - State local controla o AlertFormDialog (create OU edit)
 *   - AlertTable recebe `onEdit` que abre o dialog em modo edit
 *
 * Ordenação:
 *   1. TRIGGERED não-lidos
 *   2. ACTIVE
 *   3. READ
 *   Dentro de cada grupo, createdAt DESC (preservado por sort stable).
 *
 * Limite: MAX_ALERTS_DISPLAYED (20).
 */
export const AlertSection = ({
    query,
    target,
    entityLabel,
}: AlertSectionProps) => {
    // State do dialog. `null` = fechado; objeto = aberto no modo correspondente.
    const [dialogMode, setDialogMode] = useState<
        | { kind: "create" }
        | { kind: "edit"; alert: Alert }
        | null
    >(null)

    const allAlerts = query.data ?? []

    const sortedAlerts = useMemo(() => {
        const priority = (alert: Alert): number => {
            const status = getAlertStatus(alert)
            if (status === "TRIGGERED") return 0
            if (status === "ACTIVE") return 1
            return 2 // READ
        }
        return [...allAlerts].sort((a, b) => priority(a) - priority(b))
    }, [allAlerts])

    const displayedAlerts = sortedAlerts.slice(0, MAX_ALERTS_DISPLAYED)

    const total = sortedAlerts.length
    const totalLabel = (() => {
        if (total === 0) return undefined
        if (total === 1) return "1 alerta"
        if (total > MAX_ALERTS_DISPLAYED) {
            return `${MAX_ALERTS_DISPLAYED} de ${total} alertas`
        }
        return `${total} alertas`
    })()

    const handleEdit = (alert: Alert) => {
        setDialogMode({ kind: "edit", alert })
    }

    const handleCloseDialog = () => {
        setDialogMode(null)
    }

    return (
        <section
            className="flex flex-col gap-3"
            data-testid="alert-section"
        >
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Alertas
                </h2>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialogMode({ kind: "create" })}
                    data-testid="alert-section-create-button"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Criar alerta
                </Button>
            </header>

            {totalLabel && (
                <p
                    className="text-xs text-slate-500 dark:text-slate-400"
                    data-testid="alert-section-total"
                >
                    {totalLabel}
                </p>
            )}

            {query.isLoading && <TableSkeleton />}

            {query.isError && (
                <div
                    role="alert"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-sm">
                        {query.error instanceof Error
                            ? query.error.message
                            : "Não foi possível carregar os alertas."}
                    </p>
                </div>
            )}

            {query.isSuccess && sortedAlerts.length === 0 && (
                <EmptyState
                    icon={Bell}
                    title="Nenhum alerta configurado"
                    description={`Crie um alerta de consumo para ${entityLabel.artigo} ${entityLabel.nome} para ser notificado quando ultrapassar o limite definido (kWh).`}
                />
            )}

            {query.isSuccess && sortedAlerts.length > 0 && (
                <AlertTable
                    alerts={displayedAlerts}
                    onEdit={handleEdit}
                />
            )}

            {/* Dialog de create/edit — controlado por state local */}
            {dialogMode !== null && (
                <AlertFormDialog
                    isOpen={true}
                    onClose={handleCloseDialog}
                    target={target}
                    mode={dialogMode}
                />
            )}
        </section>
    )
}

const TableSkeleton = () => (
    <div
        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
        aria-busy="true"
        aria-label="Carregando alertas"
        data-testid="alert-section-skeleton"
    >
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/50"
            />
        ))}
    </div>
)