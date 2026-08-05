import { Blueprint } from "@/components/ui/Blueprint"
import { useTariffFlag } from "@/hooks/queries/useTariffFlag"
import {
    TARIFF_FLAG_BG_CLASS,
    TARIFF_FLAG_BORDER_CLASS,
    TARIFF_FLAG_LABELS,
    TARIFF_FLAG_ORDER,
    TARIFF_FLAG_TEXT_CLASS,
    formatTariffFlagNote,
    tariffFlagPer100Kwh,
    type TariffFlag,
    type TariffFlagConfig,
} from "@/types/tariff-flag.types"
import { cn } from "@/lib/cn"

/**
 * Card "Bandeiras tarifárias" (bloco `isDashboard` do handoff, linhas
 * 207-211) — lista as 4 bandeiras sempre, a vigente destacada com borda/
 * fundo tingidos e badge "Vigente".
 */
export const TariffFlagListCard = () => {
    const { data, isLoading, isError, error, refetch } = useTariffFlag()

    return (
        <Blueprint className="p-0" data-testid="tariff-flag-list-card">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-[17px] font-semibold uppercase">
                    Bandeiras tarifárias
                </span>
            </div>

            <div className="flex flex-col gap-3 p-4">
                {isLoading && (
                    <div
                        className="h-40 animate-pulse"
                        aria-busy="true"
                        aria-label="Carregando bandeiras tarifárias"
                    />
                )}

                {isError && (
                    <div role="alert" className="text-status-danger/85 text-sm">
                        {error instanceof Error
                            ? error.message
                            : "Não foi possível carregar as bandeiras tarifárias."}
                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="text-accent-700 ml-2 underline"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {data && <TariffFlagRows config={data} />}
            </div>
        </Blueprint>
    )
}

interface TariffFlagRowsProps {
    config: TariffFlagConfig
}

const TariffFlagRows = ({ config }: TariffFlagRowsProps) => (
    <>
        {TARIFF_FLAG_ORDER.map((flag) => (
            <TariffFlagRow key={flag} flag={flag} config={config} />
        ))}
    </>
)

interface TariffFlagRowProps {
    flag: TariffFlag
    config: TariffFlagConfig
}

const TariffFlagRow = ({ flag, config }: TariffFlagRowProps) => {
    const isCurrent = config.currentFlag === flag

    return (
        <div
            data-testid={`tariff-flag-row-${flag}`}
            data-current={isCurrent}
            className={cn(
                "flex items-center justify-between gap-3 border px-3 py-2.5",
                isCurrent
                    ? cn(TARIFF_FLAG_BORDER_CLASS[flag], TARIFF_FLAG_BG_CLASS[flag])
                    : "border-divider",
            )}
        >
            <div className="flex items-center gap-2.5">
                <span
                    className={cn("h-3 w-3 rounded-full", TARIFF_FLAG_TEXT_CLASS[flag])}
                    style={{ background: "currentColor" }}
                    aria-hidden="true"
                />
                <div>
                    <p className="text-[13.5px] font-semibold">{TARIFF_FLAG_LABELS[flag]}</p>
                    <p className="text-muted text-xs">
                        {formatTariffFlagNote(tariffFlagPer100Kwh(config, flag))}
                    </p>
                </div>
            </div>

            {isCurrent && (
                <span
                    className={cn(
                        "font-heading text-[10px] font-semibold tracking-[.06em] uppercase",
                        TARIFF_FLAG_TEXT_CLASS[flag],
                    )}
                >
                    Vigente
                </span>
            )}
        </div>
    )
}
