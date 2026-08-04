import type { SVGProps } from "react"

/**
 * Ícones inline — mesmos paths de `LumiTrack IoT Simulator.dc.html`
 * (o protótipo os gera via um helper `icon()`, sem lib externa). Não
 * adicionamos lucide-react como dependência nova só por 6 ícones fixos
 * desta única tela.
 */

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true,
    ...props,
})

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base(props)}>
        <path d="M12 5v14M5 12h14" />
    </svg>
)

export const ChevronDownIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base({ width: 18, height: 18, ...props })}>
        <path d="M6 9l6 6 6-6" />
    </svg>
)

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base(props)}>
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
)

export const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base(props)}>
        <path d="M8 4h10v14" />
        <path d="M6 8h10v12H6z" />
    </svg>
)

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base(props)}>
        <path d="M20 6 9 17l-5-5" />
    </svg>
)

export const BoltIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base(props)}>
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    </svg>
)

export const WarningIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg {...base({ width: 16, height: 16, ...props })}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
)
