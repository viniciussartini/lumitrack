import { cn } from "@/lib/cn"

interface LumiTrackWordmarkProps {
    className?: string
    /** Classes do texto do wordmark — tamanho difere entre BrandPanel (20px) e Sidebar (19px). */
    textClassName?: string
}

/**
 * Logo + wordmark "Lumi/Track" com gradiente no "Track" — tratamento visual
 * único do produto, usado no painel de marca das telas de autenticação
 * (BrandPanel) e no cabeçalho da Sidebar (LumiTrack Home.dc.html, linhas
 * 63-64). Extraído daqui para os dois consumidores reaproveitarem o mesmo
 * markup em vez de duplicar o gradiente/dimensões da imagem.
 */
export const LumiTrackWordmark = ({ className, textClassName }: LumiTrackWordmarkProps) => (
    <span data-testid="lumitrack-wordmark" className={cn("inline-flex items-center gap-2.5", className)}>
        <img
            src="/lumitrack-logo.svg"
            alt=""
            className="block h-[29px] w-[26px] brightness-125"
        />
        <span className={cn("font-heading font-semibold text-[#e6ecf2]", textClassName)}>
            Lumi
            <span className="bg-linear-to-r from-[#8fb0d6] via-[#a9c6a2] to-[#e2ef8f] bg-clip-text text-transparent">
                Track
            </span>
        </span>
    </span>
)
