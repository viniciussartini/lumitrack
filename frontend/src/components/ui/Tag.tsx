import type { HTMLAttributes } from "react"
import { cn } from "@/lib/cn"

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
    /** Default: "neutral". Ver `.tag-*` em styles/industry.css. */
    variant?: "accent" | "accent-2" | "neutral" | "outline"
}

const VARIANT_CLASS: Record<NonNullable<TagProps["variant"]>, string> = {
    accent: "tag-accent",
    "accent-2": "tag-accent-2",
    neutral: "tag-neutral",
    outline: "tag-outline",
}

/**
 * Badge pequeno do Industry (`.tag` + variante) — ex.: classe de
 * faturamento, sistema elétrico, distribuidora nos cards de propriedade.
 * Ver `.tag`/`.tag-accent`/`.tag-accent-2`/`.tag-neutral`/`.tag-outline`
 * em styles/industry.css.
 */
export const Tag = ({ variant = "neutral", className, children, ...rest }: TagProps) => (
    <span className={cn("tag", VARIANT_CLASS[variant], className)} {...rest}>
        {children}
    </span>
)
