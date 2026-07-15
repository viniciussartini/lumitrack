import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { CopyButton } from "@/components/ui/CopyButton"
import { NetworkCard } from "@/components/network/NetworkCard"
import { useBrokerInfo } from "@/hooks/useBrokerInfo"
import { useLiveStatus } from "@/hooks/useLiveStatus"
import { useNetworks } from "@/hooks/useNetworks"

export function Dashboard() {
    const { data: brokerInfo } = useBrokerInfo()
    const { networks, connected } = useLiveStatus()
    const { createNetwork } = useNetworks()
    const [networkName, setNetworkName] = useState("")

    function handleCreateNetwork(e: FormEvent) {
        e.preventDefault()
        if (!networkName.trim()) return
        createNetwork.mutate(networkName.trim(), { onSuccess: () => setNetworkName("") })
    }

    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
            <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div>
                    <h1 className="text-xl font-semibold">Simulador IoT — LumiTrack</h1>
                    {brokerInfo && (
                        <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            Broker MQTT: <code className="font-mono">{brokerInfo.host}:{brokerInfo.port}</code>
                            <CopyButton value={`${brokerInfo.host}:${brokerInfo.port}`} />
                        </p>
                    )}
                </div>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span
                        className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
                        aria-hidden="true"
                    />
                    {connected ? "conectado" : "desconectado"}
                </span>
            </header>

            <form onSubmit={handleCreateNetwork} className="flex items-end gap-2">
                <Input
                    label="Nova rede"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    placeholder="Casa Teste"
                />
                <Button type="submit" isLoading={createNetwork.isPending}>
                    Criar rede
                </Button>
            </form>

            {networks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Nenhuma rede criada ainda. Crie uma rede acima para começar a simular dispositivos.
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    {networks.map((network) => (
                        <NetworkCard key={network.id} network={network} />
                    ))}
                </div>
            )}
        </div>
    )
}
