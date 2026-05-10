import { useState } from "react"
import { AlertCircle, LineChart, Plus } from "lucide-react"
import type { UseQueryResult } from "@tanstack/react-query"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ConsumptionPeriodFilter } from "@/components/consumption/ConsumptionPeriodFilter"
import { ConsumptionTable } from "@/components/consumption/ConsumptionTable"
import {
    ConsumptionFormDialog,
    type ConsumptionFormTarget,
} from "@/components/consumption/ConsumptionFormDialog"
import {
    useConsumptionByProperty,
    useConsumptionByArea,
    useConsumptionByDevice,
} from "@/hooks/queries/useConsumption"
import { cn } from "@/lib/cn"
import type {
    ConsumptionPeriod,
    ConsumptionRecord,
} from "@/types/consumption.types"

/**
 * Label da entidade com artigo CONTRAÍDO (preposição "de" + artigo).
 * Exemplos: "desta propriedade", "desta área", "deste dispositivo".
 */
interface EntityLabel {
    /** Com preposição "de": "desta" (feminino) ou "deste" (masculino). */
    artigo: "desta" | "deste"
    nome: string
}

// Wrappers "smart"

interface PropertyConsumptionSectionProps {
    propertyId: string
}

export const PropertyConsumptionSection = ({
    propertyId,
}: PropertyConsumptionSectionProps) => {
    const [period, setPeriod] = useState<ConsumptionPeriod | undefined>()
    const query = useConsumptionByProperty(propertyId, period)
    const target: ConsumptionFormTarget = { type: "property", propertyId }

    return (
        <ConsumptionSection
            query={query}
            period={period}
            onPeriodChange={setPeriod}
            target={target}
            entityLabel={{ artigo: "desta", nome: "propriedade" }}
        />
    )
}

interface AreaConsumptionSectionProps {
    propertyId: string
    areaId: string
}

export const AreaConsumptionSection = ({
    propertyId,
    areaId,
}: AreaConsumptionSectionProps) => {
    const [period, setPeriod] = useState<ConsumptionPeriod | undefined>()
    const query = useConsumptionByArea(propertyId, areaId, period)
    const target: ConsumptionFormTarget = { type: "area", propertyId, areaId }

    return (
        <ConsumptionSection
            query={query}
            period={period}
            onPeriodChange={setPeriod}
            target={target}
            entityLabel={{ artigo: "desta", nome: "área" }}
        />
    )
}

interface DeviceConsumptionSectionProps {
    propertyId: string
    areaId: string
    deviceId: string
}

export const DeviceConsumptionSection = ({
    propertyId,
    areaId,
    deviceId,
}: DeviceConsumptionSectionProps) => {
    const [period, setPeriod] = useState<ConsumptionPeriod | undefined>()
    const query = useConsumptionByDevice(propertyId, areaId, deviceId, period)
    const target: ConsumptionFormTarget = {
        type: "device",
        propertyId,
        areaId,
        deviceId,
    }

    return (
        <ConsumptionSection
            query={query}
            period={period}
            onPeriodChange={setPeriod}
            target={target}
            entityLabel={{ artigo: "deste", nome: "dispositivo" }}
        />
    )
}

// Dialog state

type DialogState =
    | { isOpen: false; lastMode: DialogMode }
    | { isOpen: true; mode: DialogMode }

type DialogMode =
    | { kind: "create" }
    | { kind: "edit"; record: ConsumptionRecord }

// Presentational

interface ConsumptionSectionProps {
    query: UseQueryResult<ConsumptionRecord[]>
    period: ConsumptionPeriod | undefined
    onPeriodChange: (next: ConsumptionPeriod | undefined) => void
    target: ConsumptionFormTarget
    entityLabel: EntityLabel
}

const ConsumptionSection = ({
    query,
    period,
    onPeriodChange,
    target,
    entityLabel,
}: ConsumptionSectionProps) => {
    const [dialogState, setDialogState] = useState<DialogState>({
        isOpen: false,
        lastMode: { kind: "create" },
    })

    const records = query.data ?? []
    const total = records.length
    const totalLabel =
        total === 0
            ? undefined
            : total === 1
                ? "1 registro"
                : `${total} registros`

    const openCreateDialog = () =>
        setDialogState({ isOpen: true, mode: { kind: "create" } })

    const openEditDialog = (record: ConsumptionRecord) =>
        setDialogState({ isOpen: true, mode: { kind: "edit", record } })

    const closeDialog = () =>
        setDialogState((prev) =>
            prev.isOpen
                ? { isOpen: false, lastMode: prev.mode }
                : prev,
        )

    return (
        <section
            className="flex flex-col gap-3"
            data-testid="consumption-section"
        >
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Consumo
                </h2>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={openCreateDialog}
                    data-testid="consumption-section-create"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Registrar consumo
                </Button>
            </header>

            <ConsumptionPeriodFilter
                value={period}
                onChange={onPeriodChange}
                totalLabel={totalLabel}
            />

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
                    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-sm">
                        {query.error instanceof Error
                            ? query.error.message
                            : "Não foi possível carregar os registros de consumo."}
                    </p>
                </div>
            )}

            {query.isSuccess && records.length === 0 && (
                <EmptyState
                    icon={LineChart}
                    title="Nenhum registro de consumo"
                    description={
                        period
                            ? `Não há registros ${entityLabel.artigo} ${entityLabel.nome} para o período selecionado.`
                            : `Cadastre o consumo ${entityLabel.artigo} ${entityLabel.nome} clicando em "Registrar consumo". Você pode registrar por hora, dia, mês ou ano.`
                    }
                />
            )}

            {query.isSuccess && records.length > 0 && (
                <ConsumptionTable
                    records={records}
                    propertyId={target.propertyId}
                    onEdit={openEditDialog}
                />
            )}

            <ConsumptionFormDialog
                isOpen={dialogState.isOpen}
                onClose={closeDialog}
                target={target}
                mode={
                    dialogState.isOpen
                        ? dialogState.mode
                        : dialogState.lastMode
                }
            />
        </section>
    )
}

const TableSkeleton = () => (
    <div
        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
        aria-busy="true"
        aria-label="Carregando registros de consumo"
        data-testid="consumption-section-skeleton"
    >
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/50"
            />
        ))}
    </div>
)