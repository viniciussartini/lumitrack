import { useAuth } from "@/contexts/AuthContext"

/**
 * DashboardPage — agora renderiza apenas seu CONTEÚDO.
 * O header com logo e o botão "Sair" foram movidos para o AppShell
 * (Header + UserMenu globais), aplicado a todas as rotas autenticadas.
 */
export const DashboardPage = () => {
    const { user } = useAuth()

    const greeting = user?.firstName
        ? `Olá, ${user.firstName}!`
        : user?.companyName
            ? `Olá, ${user.tradeName ?? user.companyName}!`
            : "Olá!"

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {greeting}
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                    Em breve, aqui ficarão os indicadores de consumo de energia das
                    suas propriedades.
                </p>
            </div>

            {user && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Sessão ativa
                    </h2>
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
        </div>
    )
}