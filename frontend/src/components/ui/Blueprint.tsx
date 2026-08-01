import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"

interface BlueprintProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode
}

/**
 * Frame "desenho de linha" do Industry: borda 1px transparente + 4 marcas
 * de registro (+) nos cantos. Ver .blueprint/.corner em styles/industry.css
 * e o padrão de uso nos protótipos (ex.: LumiTrack Recuperar Senha.dc.html).
 */
export const Blueprint = ({ className, children, ...rest }: BlueprintProps) => (
    <div className={cn("blueprint", className)} {...rest}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        {children}
    </div>
)
