import { useState } from "react"
import { CheckIcon, CopyIcon } from "@/components/ui/icons"

interface CopyButtonProps {
    value: string
    label: string
}

/** Botão-ícone de copiar — `.sim-iconbtn` do handoff, troca pra um check por
 * 1.2s após copiar (mesmo padrão do protótipo). `label` vira o `aria-label`
 * (ex.: "Copiar endereço do broker", "Copiar tópico") — sem texto visível,
 * então a acessibilidade depende inteiramente dele. */
export function CopyButton({ value, label }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
    }

    return (
        <button
            type="button"
            className="sim-iconbtn"
            onClick={handleCopy}
            title={label}
            aria-label={label}
        >
            {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
    )
}
