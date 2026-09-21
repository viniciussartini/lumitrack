import { Suspense } from "react"
import { Outlet } from "react-router"
import { AnalysisTree } from "@/components/analysis/AnalysisTree"

/**
 * Casca de Análise — árvore de seleção à esquerda e o detalhe do item
 * selecionado (`<Outlet />`) à direita. LumiTrack Home v2.dc.html. Em telas
 * estreitas a árvore empilha acima do detalhe. O `Suspense` local mantém a
 * árvore na tela enquanto o chunk de uma página de detalhe carrega.
 */
export const AnalysisLayout = () => (
    <div className="grid grid-cols-1 items-start gap-[clamp(16px,2vw,24px)] lg:grid-cols-[296px_minmax(0,1fr)]">
        <AnalysisTree />
        <div className="min-w-0">
            <Suspense
                fallback={
                    <div role="status" className="text-muted p-6 text-center">
                        Carregando...
                    </div>
                }
            >
                <Outlet />
            </Suspense>
        </div>
    </div>
)
