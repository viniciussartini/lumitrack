import { useEffect, useState } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { BoltIcon, WarningIcon } from "@/components/ui/icons"
import type { AnomalyState } from "@/types"

interface AnomalyButtonProps {
    anomaly: AnomalyState
    onTrigger: (multiplier: number, durationSeconds: number) => void
    onClear: () => void
    isPending?: boolean
}

const DEFAULT_MULTIPLIER = 3
const DEFAULT_DURATION_SECONDS = 30

function useSecondsRemaining(endsAt: number | null): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (endsAt === null) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [endsAt])

    if (endsAt === null) return 0
    return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

export function AnomalyButton({
    anomaly,
    onTrigger,
    onClear,
    isPending = false,
}: AnomalyButtonProps) {
    const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER)
    const [durationSeconds, setDurationSeconds] = useState(DEFAULT_DURATION_SECONDS)
    const secondsRemaining = useSecondsRemaining(anomaly.active ? anomaly.endsAt : null)

    if (anomaly.active) {
        return (
            <div className="border-status-danger bg-status-danger/8 text-status-danger flex flex-wrap items-center gap-3 border px-3.5 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <WarningIcon />
                    anomalia ativa ({anomaly.multiplier}×) — encerra em {secondsRemaining}s
                </span>
                <Button variant="ghost" size="sm" onClick={onClear} disabled={isPending}>
                    Cancelar
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-wrap items-end gap-3">
            <Input
                label="Multiplicador"
                type="number"
                min={1}
                step={0.1}
                className="w-[110px]"
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
            />
            <Input
                label="Duração (s)"
                type="number"
                min={1}
                className="w-[110px]"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
            />
            <Button
                variant="danger"
                size="sm"
                leftIcon={<BoltIcon width={15} height={15} />}
                isLoading={isPending}
                onClick={() => onTrigger(multiplier, durationSeconds)}
            >
                Injetar anomalia
            </Button>
        </div>
    )
}
