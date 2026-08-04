import { useState } from "react"
import { AlertCircle, Bell, History, Plus } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Select } from "@/components/ui/Select"
import { Pagination } from "@/components/ui/Pagination"
import { AlertTable } from "@/components/alert/AlertTable"
import { AlertEventTable } from "@/components/alert/AlertEventTable"
import { AlertFormDialog } from "@/components/alert/AlertFormDialog"
import { useAlerts, useFiringAlerts } from "@/hooks/queries/useAlerts"
import { useAlertEvents } from "@/hooks/queries/useAlertEvents"
import { useMeters } from "@/hooks/queries/useMeters"
import { cn } from "@/lib/cn"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { AlertWithStatus } from "@/types/alert.types"

/**
 * Inbox global de alertas — /alertas, conforme `isAlerts` de
 * `LumiTrack Home.dc.html`.
 *
 * Duas áreas:
 *   (a) Alertas criados — CRUD flat (nome, alvo, kW de referência,
 *       tolerância %, toggle enabled, status firing/normal).
 *   (b) Histórico de disparos — paginado, filtrado por um alerta
 *       selecionado (o backend expõe `GET /api/alert-events?alertId=`,
 *       sem endpoint agregado entre alertas).
 *
 * KPIs "Alertas ativos"/"Em disparo agora": o protótipo tem um 3º KPI
 * ("Disparos · últimos 30d") que ficou de fora — sem endpoint agregado por
 * período (`GET /api/alert-events` exige `alertId`), mesma regra de "sem
 * inventar dado" já aplicada nos KPIs omitidos de #99-#101.
 */
export const AlertsPage = () => {
    const [page, setPage] = useState(1)
    const alertsQuery = useAlerts(page, DEFAULT_PAGE_SIZE)
    // Catálogo completo (pageSize máximo do backend) só pra computar os
    // KPIs — useAlerts(page, DEFAULT_PAGE_SIZE) é paginado e só refletiria
    // a página visível da tabela, não o total real de alertas habilitados.
    const allAlertsQuery = useAlerts(1, 31)
    // "Em disparo agora" reusa a mesma fonte do WarningBadge do header
    // (useFiringAlerts, GET /api/alerts/firing) — mesma query key, dedupe
    // automático do React Query, sem chamada HTTP extra.
    const firingQuery = useFiringAlerts()
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

    const activeAlertsCount = allAlertsQuery.isLoading
        ? ("—" as const)
        : (allAlertsQuery.data?.items ?? []).filter((a) => a.enabled).length
    const firingCount = firingQuery.isLoading
        ? ("—" as const)
        : (firingQuery.data ?? []).length

    const handleSelectAlertForHistory = (id: string) => {
        setSelectedAlertId(id)
        setEventsPage(1)
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <p className="text-muted m-0 max-w-[78ch] text-sm leading-relaxed">
                    Monitore faixas de potência dos seus medidores e veja o histórico de
                    disparos. Um alerta abre um episódio quando a potência sai da faixa{" "}
                    <span className="font-mono">referência ± tolerância</span> e o fecha
                    quando retorna ao normal.
                </p>
                <Button
                    type="button"
                    onClick={() => setDialogMode({ kind: "create" })}
                    className="min-h-[42px] shrink-0"
                    data-testid="alerts-page-create-button"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Criar alerta
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <KpiCard label="Alertas ativos" value={activeAlertsCount} />
                <KpiCard label="Em disparo agora" value={firingCount} highlight />
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
                    <h2 className="font-heading flex items-center gap-2 text-[17px] font-semibold uppercase">
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
                    <p className="text-muted text-sm">
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

interface KpiCardProps {
    label: string
    value: number | "—"
    /** "Em disparo agora" — dot pulsante + cor de destaque, sempre (mesmo
     * com valor 0), fiel ao protótipo (é o KPI que representa o estado ao
     * vivo, não uma contagem neutra como "Alertas ativos"). */
    highlight?: boolean
}

const KpiCard = ({ label, value, highlight }: KpiCardProps) => (
    <div className="blueprint px-5 py-[18px]">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="font-heading flex items-center gap-2 text-[11px] font-semibold tracking-[.07em] uppercase">
            {highlight && (
                <span
                    className="h-2 w-2 rounded-full"
                    style={{
                        backgroundColor: "var(--color-status-warning)",
                        animation: "lt-pulse 1.6s ease-in-out infinite",
                    }}
                    aria-hidden="true"
                />
            )}
            {label}
        </div>
        <div
            className={cn(
                "font-heading mt-2.5 text-[30px] leading-none font-semibold font-features-['tnum'_1]",
                highlight && "text-status-warning",
            )}
        >
            {value}
        </div>
    </div>
)

const TableSkeleton = () => (
    <div
        className="blueprint h-40 animate-pulse"
        aria-busy="true"
        aria-label="Carregando"
        data-testid="alerts-page-skeleton"
    />
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        role="alert"
        className="border-status-danger/40 flex items-start gap-3 border p-4"
    >
        <AlertCircle className="text-status-danger h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-status-danger/85 text-sm">{message}</p>
    </div>
)
