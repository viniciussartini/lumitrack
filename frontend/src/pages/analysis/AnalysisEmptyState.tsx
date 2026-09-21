import { LineChart } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"

/** Direita da Análise enquanto nada está selecionado — LumiTrack Home v2.dc.html. */
export const AnalysisEmptyState = () => (
    <Blueprint className="flex flex-col items-center gap-3.5 px-8 py-[clamp(40px,6vw,72px)] text-center">
        <span
            className="border-accent text-accent flex h-15 w-15 items-center justify-center border"
            aria-hidden="true"
        >
            <LineChart className="h-26px w-26px" strokeWidth={1.4} />
        </span>
        <h2 className="font-heading m-0 text-[clamp(20px,2.2vw,25px)] leading-tight font-semibold uppercase">
            Selecione o que deseja analisar
        </h2>
        <p className="text-muted m-0 max-w-[46ch] text-sm leading-relaxed">
            Escolha uma propriedade, área ou dispositivo na hierarquia ao lado para ver o consumo
            detalhado em tempo real.
        </p>
    </Blueprint>
)
