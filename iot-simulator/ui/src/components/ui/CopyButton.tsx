import { useState } from "react"
import { Button } from "@/components/ui/Button"

interface CopyButtonProps {
    value: string
}

export function CopyButton({ value }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <Button variant="ghost" size="sm" onClick={handleCopy} type="button">
            {copied ? "Copiado!" : "Copiar"}
        </Button>
    )
}
