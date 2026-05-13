import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AlertCircle, Bell, CheckCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { useAlerts } from "@/hooks/queries/useAlerts"
import { useMarkAlertAsRead } from "@/hooks/queries/useAlertMutations"
import { useProperties } from "@/hooks/queries/useProperties"
import { AlertTable } from "@/components/alert/AlertTable"
import {
    AlertTriggeredFilter,
    type TriggeredFilterValue,
} from "@/components/alert/AlertTriggeredFilter"
import { AlertFormDialog } from "@/components/alert/AlertFormDialog"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import {
    getAlertStatus,
    type Alert,
    type AlertFormTarget,
} from "@/types/alert.types"
import type { AlertTargetLookup } from "@/lib/formatters/alert"

/**
 * Inbox global de alertas — /alertas.
 *
 * Funcionalidades:
 *   - Botão "Marcar todos como lidos" no header (condicional: só aparece
 *     quando há disparados-não-lidos)
 *   - AlertTable recebe onEdit que abre AlertFormDialog em modo edit
 *   - Não há botão "Criar alerta" na inbox (criação acontece
 *     na entity específica via AlertSection — inbox é só pra gestão do
 *     que já existe)
 *
 * Bulk "Marcar todos como lidos":
 *   - Backend NÃO tem endpoint de bulk read
 *   - Disparamos N mutations em paralelo via Promise.allSettled
 *   - Mostramos toast unificado no fim ("N marcados", "M falhas")
 *   - Sem ConfirmDialog (decisão: ação não-destrutiva, atrito = ruim)
 *
 * Edição NA inbox:
 *   - Em alertas ativos, abre o dialog em modo edit
 *   - Em alertas disparados, o AlertRowMenu oculta "Editar" e mostra dica
 *   - A AlertsPage não precisa saber dessa distinção — passa onEdit
 *     sempre, o AlertRowMenu decide se renderiza o item
 */
export const AlertsPage = () => {
    const alertsQuery = useAlerts()
    const propertiesQuery = useProperties()
    const markAsRead = useMarkAlertAsRead()

    const [searchParams, setSearchParams] = useSearchParams()
    const filterValue = parseTriggeredParam(searchParams.get("triggered"))

    // State do dialog de edição.
    // Diferente do AlertSection, aqui SÓ há edit — criação não fica na inbox.
    const [editingAlert, setEditingAlert] = useState<Alert | null>(null)

    const handleFilterChange = (next: TriggeredFilterValue) => {
        setSearchParams(
            (prev) => {
                const next$ = new URLSearchParams(prev)
                if (next === undefined) {
                    next$.delete("triggered")
                } else {
                    next$.set("triggered", String(next))
                }
                return next$
            },
            { replace: true },
        )
    }

    const allAlerts = alertsQuery.data ?? []

    const visibleAlerts = useMemo(() => {
        const filtered =
            filterValue === undefined
                ? allAlerts
                : allAlerts.filter((alert) =>
                    filterValue
                        ? alert.triggeredAt !== null
                        : alert.triggeredAt === null,
                )

        const priority = (alert: Alert): number => {
            const status = getAlertStatus(alert)
            if (status === "TRIGGERED") return 0
            if (status === "ACTIVE") return 1
            return 2 // READ
        }
        return [...filtered].sort((a, b) => priority(a) - priority(b))
    }, [allAlerts, filterValue])

    // Lookup só de Property (decisão PR1)
    const targetLookup: AlertTargetLookup = useMemo(() => {
        const properties: Record<string, { name: string }> = {}
        for (const property of propertiesQuery.data ?? []) {
            properties[property.id] = { name: property.name }
        }
        return { properties }
    }, [propertiesQuery.data])

    // Alertas disparados-não-lidos (para o botão de bulk)
    const unreadAlerts = useMemo(
        () =>
            allAlerts.filter(
                (alert) =>
                    alert.triggeredAt !== null && alert.readAt === null,
            ),
        [allAlerts],
    )

    const totalLabel = (() => {
        const visible = visibleAlerts.length
        const total = allAlerts.length

        if (total === 0) return undefined
        if (filterValue === undefined) {
            return visible === 1 ? "1 alerta" : `${visible} alertas`
        }
        return `${visible} de ${total} alertas`
    })()

    const handleMarkAllAsRead = async () => {
        // Dispara em paralelo. Promise.allSettled em vez de Promise.all
        // pra coletar falhas individuais sem abortar as outras.
        const results = await Promise.allSettled(
            unreadAlerts.map((alert) =>
                markAsRead.mutateAsync(alert.id),
            ),
        )

        const succeeded = results.filter((r) => r.status === "fulfilled").length
        const failed = results.length - succeeded

        // Os mutateAsync individuais já disparam toast.success por hook,
        // o que polui se houver muitos. Pra evitar isso, idealmente
        // chamaríamos service direto aqui. Como o hook é a fonte oficial
        // de toast + invalidate, fica assim por simplicidade — e adicionamos
        // UM toast de resumo no final pra balizar a operação inteira.
        if (failed === 0) {
            toast.success(
                succeeded === 1
                    ? "1 alerta marcado como lido"
                    : `${succeeded} alertas marcados como lidos`,
            )
        } else if (succeeded === 0) {
            toast.error("Falha ao marcar alertas como lidos", {
                description: extractErrorMessage(
                    (results[0] as PromiseRejectedResult).reason,
                ),
            })
        } else {
            toast.warning(
                `${succeeded} marcados, ${failed} falharam`,
                {
                    description:
                        "Alguns alertas não puderam ser atualizados. Tente novamente.",
                },
            )
        }
    }

    // Target dummy pro AlertFormDialog em modo edit — o backend de update
    // não usa target (rota é /alerts/:id puro), mas o componente espera
    // a prop. Construímos a partir do alert sendo editado.
    const editTarget: AlertFormTarget | null = editingAlert
        ? buildTargetFromAlert(editingAlert)
        : null

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Alertas
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Limites de consumo configurados e disparos recentes.
                    </p>
                </div>
                {/* Bulk "Marcar todos como lidos" — só aparece com não-lidos */}
                {unreadAlerts.length > 0 && (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleMarkAllAsRead}
                        disabled={markAsRead.isPending}
                        data-testid="alerts-page-mark-all-button"
                    >
                        <CheckCheck className="h-4 w-4" aria-hidden="true" />
                        {unreadAlerts.length === 1
                            ? "Marcar 1 como lido"
                            : `Marcar ${unreadAlerts.length} como lidos`}
                    </Button>
                )}
            </div>

            {!alertsQuery.isLoading && !alertsQuery.isError && (
                <AlertTriggeredFilter
                    value={filterValue}
                    onChange={handleFilterChange}
                    totalLabel={totalLabel}
                />
            )}

            {alertsQuery.isLoading && <TableSkeleton />}

            {alertsQuery.isError && (
                <ErrorState
                    message={
                        alertsQuery.error instanceof Error
                            ? alertsQuery.error.message
                            : "Não foi possível carregar os alertas."
                    }
                />
            )}

            {alertsQuery.isSuccess && allAlerts.length === 0 && (
                <EmptyState
                    icon={Bell}
                    title="Nenhum alerta configurado"
                    description="Crie alertas de consumo nas páginas das suas propriedades, áreas ou dispositivos para ser notificado quando ultrapassarem o limite definido (kWh)."
                />
            )}

            {alertsQuery.isSuccess &&
                allAlerts.length > 0 &&
                visibleAlerts.length === 0 && (
                    <EmptyState
                        icon={Bell}
                        title="Nenhum alerta neste filtro"
                        description={
                            filterValue
                                ? "Você não tem alertas disparados no momento. Quando algum limite for ultrapassado, ele aparecerá aqui."
                                : "Você não tem alertas ativos no momento — todos os limites configurados já foram disparados ou não há nenhum cadastrado."
                        }
                    />
                )}

            {alertsQuery.isSuccess && visibleAlerts.length > 0 && (
                <AlertTable
                    alerts={visibleAlerts}
                    showTarget
                    targetLookup={targetLookup}
                    onEdit={setEditingAlert}
                />
            )}

            {/* Dialog de edição — controlado por state local.
                Criação acontece nas DetailsPages via AlertSection, não aqui. */}
            {editingAlert !== null && editTarget !== null && (
                <AlertFormDialog
                    isOpen={true}
                    onClose={() => setEditingAlert(null)}
                    target={editTarget}
                    mode={{ kind: "edit", alert: editingAlert }}
                />
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const parseTriggeredParam = (raw: string | null): TriggeredFilterValue => {
    if (raw === "true") return true
    if (raw === "false") return false
    return undefined
}

/**
 * Constrói o AlertFormTarget a partir de um Alert.
 *
 * Necessário porque AlertFormDialog exige target, mas em edit o backend
 * não usa target (rota /alerts/:id puro). Mantemos por consistência de
 * API entre create e edit.
 *
 * Throws se o alerta estiver malformado (sem nenhum FK), o que não
 * deveria acontecer pelo schema do backend.
 */
const buildTargetFromAlert = (alert: Alert): AlertFormTarget => {
    if (alert.targetType === "PROPERTY" && alert.propertyId) {
        return { type: "property", propertyId: alert.propertyId }
    }
    if (alert.targetType === "AREA" && alert.areaId) {
        // Property é null em alerts de área, mas precisamos de SOMETHING
        // pro target. Em edit não importa pro backend, mas o type exige.
        // Convenção: usamos string vazia — backend valida via /alerts/:id.
        return {
            type: "area",
            propertyId: "",
            areaId: alert.areaId,
        }
    }
    if (alert.targetType === "DEVICE" && alert.deviceId) {
        return {
            type: "device",
            propertyId: "",
            areaId: "",
            deviceId: alert.deviceId,
        }
    }
    throw new Error(`Alert malformado: ${alert.id}`)
}

const TableSkeleton = () => (
    <div
        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
        aria-busy="true"
        aria-label="Carregando alertas"
        data-testid="alerts-page-skeleton"
    >
        {[0, 1, 2, 3].map((i) => (
            <div
                key={i}
                className="h-12 animate-pulse rounded bg-slate-100 dark:bg-slate-800/50"
            />
        ))}
    </div>
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        role="alert"
        className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            "border-red-200 bg-red-50 text-red-900",
            "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
        )}
    >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{message}</p>
    </div>
)