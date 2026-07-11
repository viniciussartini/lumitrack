import { useState } from "react"
import { AlertCircle, Bell, History, Plus } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Select } from "@/components/ui/Select"
import { Pagination } from "@/components/ui/Pagination"
import { AlertTable } from "@/components/alert/AlertTable"
import { AlertEventTable } from "@/components/alert/AlertEventTable"
import { AlertFormDialog } from "@/components/alert/AlertFormDialog"
import { useAlerts } from "@/hooks/queries/useAlerts"
import { useAlertEvents } from "@/hooks/queries/useAlertEvents"
import { useMeters } from "@/hooks/queries/useMeters"
import { cn } from "@/lib/cn"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { AlertWithStatus } from "@/types/alert.types"

/**
 * Inbox global de alertas — /alertas (Fase 5, reescrita completa).
 *
 * Duas áreas:
 *   (a) Alertas criados — CRUD flat (nome, alvo, kW de referência,
 *       tolerância %, toggle enabled, status firing/normal).
 *   (b) Histórico de disparos — paginado, filtrado por um alerta
 *       selecionado (o backend expõe `GET /api/alert-events?alertId=`,
 *       sem endpoint agregado entre alertas).
 */
export const AlertsPage = () => {
    const [page, setPage] = useState(1)
    const alertsQuery = useAlerts(page, DEFAULT_PAGE_SIZE)
    // pageSize máximo (31) — o seletor de medidor no form de criação
    // precisa de todos os medidores do usuário, não só uma página.
    const metersQuery = useMeters(1, 31)

    const [dialogMode, setDialogMode] = useState<
        { kind: "create" } | { kind: "edit"; alert: AlertWithStatus } | null
    >(null)

    const [selectedAlertId, setSelectedAlertId] = useState<string | undefined>(
        undefined,
    )
    const [eventsPage, setEventsPage] = useState(1)

    const alerts = alertsQuery.data?.items ?? []
    const meters = metersQuery.data?.items ?? []

    const effectiveAlertId = selectedAlertId ?? alerts[0]?.id
    const eventsQuery = useAlertEvents(effectiveAlertId, eventsPage, DEFAULT_PAGE_SIZE)
    const selectedAlert = alerts.find((a) => a.id === effectiveAlertId)

    const handleSelectAlertForHistory = (id: string) => {
        setSelectedAlertId(id)
        setEventsPage(1)
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Alertas
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Monitore faixas de potência dos seus medidores e veja o histórico de disparos.
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={() => setDialogMode({ kind: "create" })}
                    data-testid="alerts-page-create-button"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Criar alerta
                </Button>
            </div>

            {/* Área (a) — alertas criados */}
            <section className="flex flex-col gap-3">
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

                {alertsQuery.isSuccess && alerts.length === 0 && (
                    <EmptyState
                        icon={Bell}
                        title="Nenhum alerta configurado"
                        description="Crie um alerta para ser notificado quando a potência de um medidor sair da faixa esperada."
                    />
                )}

                {alertsQuery.isSuccess && alerts.length > 0 && (
                    <>
                        <AlertTable
                            alerts={alerts}
                            onEdit={(alert) => setDialogMode({ kind: "edit", alert })}
                        />
                        <Pagination
                            page={alertsQuery.data!.page}
                            pageSize={alertsQuery.data!.pageSize}
                            total={alertsQuery.data!.total}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </section>

            {/* Área (b) — histórico de disparos */}
            <section className="flex flex-col gap-3">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        <History className="h-5 w-5" aria-hidden="true" />
                        Histórico de disparos
                    </h2>
                    {alerts.length > 0 && (
                        <Select
                            aria-label="Selecionar alerta"
                            value={effectiveAlertId ?? ""}
                            onChange={(e) => handleSelectAlertForHistory(e.target.value)}
                            className="w-56"
                            data-testid="alert-events-select"
                        >
                            {alerts.map((alert) => (
                                <option key={alert.id} value={alert.id}>
                                    {alert.name}
                                </option>
                            ))}
                        </Select>
                    )}
                </header>

                {alerts.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Crie um alerta para começar a acumular histórico de disparos.
                    </p>
                )}

                {alerts.length > 0 && eventsQuery.isLoading && <TableSkeleton />}

                {alerts.length > 0 && eventsQuery.isError && (
                    <ErrorState
                        message={
                            eventsQuery.error instanceof Error
                                ? eventsQuery.error.message
                                : "Não foi possível carregar o histórico."
                        }
                    />
                )}

                {alerts.length > 0 &&
                    eventsQuery.isSuccess &&
                    eventsQuery.data.items.length === 0 && (
                        <EmptyState
                            icon={History}
                            title="Nenhum episódio registrado"
                            description="Quando a potência sair da faixa monitorada e voltar ao normal, o episódio aparece aqui."
                        />
                    )}

                {alerts.length > 0 &&
                    eventsQuery.isSuccess &&
                    eventsQuery.data.items.length > 0 &&
                    selectedAlert && (
                        <>
                            <AlertEventTable
                                events={eventsQuery.data.items}
                                alertName={selectedAlert.name}
                            />
                            <Pagination
                                page={eventsQuery.data.page}
                                pageSize={eventsQuery.data.pageSize}
                                total={eventsQuery.data.total}
                                onPageChange={setEventsPage}
                            />
                        </>
                    )}
            </section>

            {dialogMode !== null && (
                <AlertFormDialog
                    isOpen={true}
                    onClose={() => setDialogMode(null)}
                    meters={meters}
                    mode={dialogMode}
                />
            )}
        </div>
    )
}

const TableSkeleton = () => (
    <div
        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
        aria-busy="true"
        aria-label="Carregando"
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
