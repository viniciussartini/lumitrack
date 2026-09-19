import { NavLink, Outlet } from "react-router"
import { Blueprint } from "@/components/ui/Blueprint"
import { SETTINGS_NAV_ITEMS } from "@/config/settingsNavigation"

/**
 * Casca de Configurações — sub-navegação lateral à esquerda e a página da
 * configuração selecionada (`<Outlet />`) à direita. LumiTrack Home
 * v2.dc.html. Em telas estreitas a sub-navegação empilha acima do conteúdo.
 */
export const SettingsLayout = () => (
    <div className="grid grid-cols-1 items-start gap-[clamp(12px,1.4vw,18px)] md:grid-cols-[minmax(0,208px)_minmax(0,1fr)]">
        <Blueprint className="py-2 md:sticky md:top-4">
            <nav aria-label="Configurações">
                {SETTINGS_NAV_ITEMS.map((item) => {
                    const Icon = item.icon
                    return (
                        <NavLink key={item.to} to={item.to} className="lt-tree-row">
                            <Icon
                                className="text-accent h-15px w-15px shrink-0"
                                strokeWidth={1.5}
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">{item.label}</span>
                        </NavLink>
                    )
                })}
            </nav>
        </Blueprint>

        <div className="flex min-w-0 flex-col gap-[clamp(16px,2vw,20px)]">
            <Outlet />
        </div>
    </div>
)
