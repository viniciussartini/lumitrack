import { cn } from "@/lib/cn"

interface LumiTrackWordmarkProps {
    className?: string
    /** Classes do texto do wordmark — tamanho difere entre BrandPanel (20px) e Sidebar (19px). */
    textClassName?: string
    /**
     * `"dark"` (padrão): tratamento para fundo escuro `--color-accent-900`
     * (BrandPanel, Sidebar) — texto claro, imagem com `brightness-125`.
     * `"light"`: tratamento para fundo claro (`LumiTrack LGPD.dc.html`,
     * linhas 36-40; mesmo gradiente já usado na nav da Landing) — texto na
     * cor padrão do tema, sem filtro de brilho na imagem.
     */
    variant?: "dark" | "light"
}

const GRADIENT_BY_VARIANT = {
    dark: "from-[#8fb0d6] via-[#a9c6a2] to-[#e2ef8f]",
    light: "from-[#5980A6] via-[#96B18F] to-[#D4E277]",
} as const

/**
 * Logo + wordmark "Lumi/Track" com gradiente no "Track" — tratamento visual
 * único do produto, usado no painel de marca das telas de autenticação
 * (BrandPanel), no cabeçalho da Sidebar (LumiTrack Home.dc.html, linhas
 * 63-64) e no cabeçalho das páginas legais (LumiTrack LGPD.dc.html, linhas
 * 36-40, fundo claro — variant="light"). Extraído daqui para os
 * consumidores reaproveitarem o mesmo markup em vez de duplicar o
 * gradiente/dimensões da imagem.
 */
export const LumiTrackWordmark = ({
    className,
    textClassName,
    variant = "dark",
}: LumiTrackWordmarkProps) => (
    <span
        data-testid="lumitrack-wordmark"
        className={cn("inline-flex items-center gap-2.5", className)}
    >
        <img
            src="/lumitrack-logo.svg"
            alt=""
            className={cn("w-26px block h-[29px]", variant === "dark" && "brightness-125")}
        />
        <span
            className={cn(
                "font-heading font-semibold",
                variant === "dark" ? "text-[#e6ecf2]" : "text-text",
                textClassName,
            )}
        >
            Lumi
            <span
                className={cn(
                    "bg-linear-to-r bg-clip-text text-transparent",
                    GRADIENT_BY_VARIANT[variant],
                )}
            >
                Track
            </span>
        </span>
    </span>
)
