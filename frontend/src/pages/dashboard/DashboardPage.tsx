import { useNavigate } from "react-router-dom"
import { LogOut } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/Button"

export const DashboardPage = () => {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
        await logout()
        navigate("/login", { replace: true })
    }

    const greeting = user?.firstName
        ? `Olá, ${user.firstName}!`
        : user?.companyName
            ? `Olá, ${user.tradeName ?? user.companyName}!`
            : "Olá!"

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        LumiTrack
                    </h1>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<LogOut className="h-4 w-4" />}
                        onClick={handleLogout}
                    >
                        Sair
                    </Button>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 py-12">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {greeting}
                </h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                    Em breve, aqui ficarão os indicadores de consumo de energia das
                    suas propriedades.
                </p>

                {user && (
                    <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                            Sessão ativa
                        </h3>
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-slate-500 dark:text-slate-400">
                                    E-mail
                                </dt>
                                <dd className="font-medium text-slate-900 dark:text-slate-100">
                                    {user.email}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Tipo de conta
                                </dt>
                                <dd className="font-medium text-slate-900 dark:text-slate-100">
                                    {user.userType === "INDIVIDUAL"
                                        ? "Pessoa Física"
                                        : "Pessoa Jurídica"}
                                </dd>
                            </div>
                        </dl>
                    </div>
                )}
            </main>
        </div>
    )
}