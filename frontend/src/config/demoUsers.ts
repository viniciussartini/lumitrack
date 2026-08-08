import type { DemoProfile } from "@/types/auth.types"

// Só o rótulo do botão — nenhuma credencial aqui (issue #179). O login em
// si vai para POST /auth/demo-login, que resolve o e-mail/senha da conta
// demo inteiramente no backend, gated por DEMO_LOGIN_ENABLED. Antes desta
// mudança, e-mail e senha ficavam em texto claro neste arquivo e eram
// embarcados no bundle de produção mesmo com VITE_DEMO_MODE desligado.
export const DEMO_PROFILE_LABELS: Record<DemoProfile, string> = {
    residential: "Ver demo residencial",
    commercial: "Ver demo comercial",
}
