import { useState, type FormEvent } from "react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { CopyButton } from "@/components/ui/CopyButton"
import { Modal } from "@/components/ui/Modal"
import { PlusIcon } from "@/components/ui/icons"
import { NetworkCard } from "@/components/network/NetworkCard"
import { useBrokerInfo } from "@/hooks/useBrokerInfo"
import { useLiveStatus } from "@/hooks/useLiveStatus"
import { useNetworks } from "@/hooks/useNetworks"

export function Dashboard() {
    const { data: brokerInfo } = useBrokerInfo()
    const { networks, connected } = useLiveStatus()
    const { createNetwork } = useNetworks()
    const [showNetworkModal, setShowNetworkModal] = useState(false)
    const [networkName, setNetworkName] = useState("")

    function handleCreateNetwork(e: FormEvent) {
        e.preventDefault()
        if (!networkName.trim()) return
        createNetwork.mutate(networkName.trim(), {
            onSuccess: () => {
                setNetworkName("")
                setShowNetworkModal(false)
            },
        })
    }

    const totalDevices = networks.reduce((acc, n) => acc + n.devices.length, 0)
    const publishingCount = networks.reduce(
        (acc, n) => acc + n.devices.filter((d) => d.poweredOn && d.connected).length,
        0,
    )

    return (
        <div className="flex min-h-screen flex-col">
            {/* TOPBAR */}
            <header className="bg-accent-900 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 px-5 py-4 text-[#e6ecf2] sm:px-11">
                <div className="flex items-center gap-3">
                    <div className="leading-[1.1]">
                        <div className="font-heading text-[19px] font-semibold text-[#e6ecf2]">
                            Lumi
                            <span className="bg-linear-to-r from-[#8fb0d6] via-[#a9c6a2] to-[#e2ef8f] bg-clip-text text-transparent">
                                Track
                            </span>{" "}
                            <span className="text-[14px] font-semibold text-[#e6ecf2]/60">/ Simulador IoT</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4.5">
                    {brokerInfo && (
                        <div className="flex items-center gap-2 text-[13px] text-[#e6ecf2]/78">
                            <span className="font-heading text-[10px] font-semibold tracking-[.07em] text-[#e6ecf2]/55 uppercase">
                                Broker MQTT
                            </span>
                            <code className="text-[13.5px] text-[#e6ecf2]">
                                {brokerInfo.host}:{brokerInfo.port}
                            </code>
                            <CopyButton
                                value={`${brokerInfo.host}:${brokerInfo.port}`}
                                label="Copiar endereço do broker"
                            />
                        </div>
                    )}
                    <span
                        className="font-heading inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[.07em] uppercase"
                        style={{ color: connected ? "#3f8f52" : "#c14a38" }}
                    >
                        <span
                            className="h-2 w-2 rounded-full"
                            style={{
                                background: connected ? "#3f8f52" : "#c14a38",
                                animation: "lt-pulse 1.6s ease-in-out infinite",
                            }}
                        />
                        {connected ? "conectado" : "desconectado"}
                    </span>
                </div>
            </header>

            {/* CONTENT */}
            <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-5 py-7 sm:px-11">
                <div>
                    <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                        Painel de simulação
                    </span>
                    <h1 className="font-heading mt-2 text-[clamp(24px,2.6vw,32px)] leading-[1.05] uppercase">
                        Redes e dispositivos virtuais
                    </h1>
                    <p className="text-text/72 mt-2.5 max-w-[70ch] text-[14.5px] leading-[1.55]">
                        Crie redes, adicione medidores virtuais e ligue-os para publicar amostras elétricas no
                        broker. Injete anomalias para produzir picos de potência visíveis no LumiTrack.
                    </p>
                </div>

                {/* STAT ROW */}
                <div className="grid grid-cols-3 gap-3.5">
                    <Blueprint className="px-4.5 py-4">
                        <div className="font-heading text-text/55 text-[10.5px] font-semibold tracking-[.07em] uppercase">
                            Redes
                        </div>
                        <div className="font-heading mt-2.5 text-[30px] leading-none font-semibold font-features-['tnum'_1]">
                            {networks.length}
                        </div>
                    </Blueprint>
                    <Blueprint className="px-4.5 py-4">
                        <div className="font-heading text-text/55 text-[10.5px] font-semibold tracking-[.07em] uppercase">
                            Dispositivos
                        </div>
                        <div className="font-heading mt-2.5 text-[30px] leading-none font-semibold font-features-['tnum'_1]">
                            {totalDevices}
                        </div>
                    </Blueprint>
                    <Blueprint className="px-4.5 py-4">
                        <div className="font-heading text-text/55 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[.07em] uppercase">
                            <span
                                className="h-1.5 w-1.5 rounded-full bg-[#3f8f52]"
                                style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                            />
                            Publicando
                        </div>
                        <div className="font-heading mt-2.5 text-[30px] leading-none font-semibold text-[#3f8f52] font-features-['tnum'_1]">
                            {publishingCount}
                        </div>
                    </Blueprint>
                </div>

                {/* CREATE NETWORK */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-heading text-text/55 text-[11px] font-semibold tracking-[.08em] uppercase">
                        Redes de simulação
                    </span>
                    <Button
                        leftIcon={<PlusIcon width={16} height={16} />}
                        onClick={() => setShowNetworkModal(true)}
                    >
                        Criar rede
                    </Button>
                </div>

                {networks.length === 0 ? (
                    <p className="border-divider text-text/58 border border-dashed p-9 text-center text-sm">
                        Nenhuma rede criada ainda. Crie uma rede acima para começar a simular dispositivos.
                    </p>
                ) : (
                    <div className="flex flex-col gap-4.5">
                        {networks.map((network) => (
                            <NetworkCard key={network.id} network={network} />
                        ))}
                    </div>
                )}

                <p className="text-text/48 mt-1.5 text-xs leading-normal">
                    Ferramenta de desenvolvimento local · sem autenticação de rede · não exponha publicamente.
                </p>
            </div>

            {showNetworkModal && (
                <Modal
                    eyebrow="Nova rede"
                    title="Criar rede"
                    onClose={() => setShowNetworkModal(false)}
                    onSubmit={handleCreateNetwork}
                    footer={
                        <>
                            <Button type="button" variant="ghost" onClick={() => setShowNetworkModal(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" isLoading={createNetwork.isPending}>
                                Criar rede
                            </Button>
                        </>
                    }
                >
                    <Input
                        label="Nome da rede"
                        value={networkName}
                        onChange={(e) => setNetworkName(e.target.value)}
                        placeholder="Casa Teste"
                        autoComplete="off"
                        autoFocus
                    />
                    <p className="text-text/58 mt-3 text-[12.5px] leading-normal">
                        Uma rede agrupa medidores virtuais que publicam no mesmo broker.
                    </p>
                </Modal>
            )}
        </div>
    )
}
