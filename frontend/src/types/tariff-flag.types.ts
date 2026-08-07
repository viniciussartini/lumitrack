import { formatBrl } from "@/lib/format"

/**
 * Bandeira tarifária vigente — config singleton (não por usuário/propriedade),
 * espelha `backend/src/modules/tariff-flag/tariff-flag.repository.ts`
 * (`TariffFlagConfigResponse`).
 */
export type TariffFlag = "GREEN" | "YELLOW" | "RED_P1" | "RED_P2"

export interface TariffFlagConfig {
    currentFlag: TariffFlag
    greenPer100Kwh: number
    yellowPer100Kwh: number
    redP1Per100Kwh: number
    redP2Per100Kwh: number
    updatedAt: string
}

export const TARIFF_FLAG_LABELS: Record<TariffFlag, string> = {
    GREEN: "Verde",
    YELLOW: "Amarela",
    RED_P1: "Vermelha P1",
    RED_P2: "Vermelha P2",
}

/** Ordem de exibição na lista "Bandeiras tarifárias" (verde → mais severa). */
export const TARIFF_FLAG_ORDER: readonly TariffFlag[] = ["GREEN", "YELLOW", "RED_P1", "RED_P2"]

/**
 * Tokens de cor JÁ existentes em `industry.css` (o design system já
 * antecipava as 4 bandeiras — `--color-status-danger-strong` tem o
 * comentário "vermelha P2 — severidade maior"). Nenhuma cor nova.
 */
export const TARIFF_FLAG_TEXT_CLASS: Record<TariffFlag, string> = {
    GREEN: "text-status-success",
    YELLOW: "text-status-warning",
    RED_P1: "text-status-danger",
    RED_P2: "text-status-danger-strong",
}

export const TARIFF_FLAG_BORDER_CLASS: Record<TariffFlag, string> = {
    GREEN: "border-status-success",
    YELLOW: "border-status-warning",
    RED_P1: "border-status-danger",
    RED_P2: "border-status-danger-strong",
}

export const TARIFF_FLAG_BG_CLASS: Record<TariffFlag, string> = {
    GREEN: "bg-status-success/10",
    YELLOW: "bg-status-warning/10",
    RED_P1: "bg-status-danger/10",
    RED_P2: "bg-status-danger-strong/10",
}

/**
 * Variante para fundo escuro `--color-accent-900` (painel de marca das
 * telas de autenticação/Sidebar) — os tokens `TARIFF_FLAG_*_CLASS` acima
 * são tonalidades escuras pensadas para fundo claro (`--color-status-*` de
 * `industry.css`) e ficam ilegíveis lá. O handoff (`LumiTrack Login.dc.html`)
 * só define a cor da bandeira Verde (`#8fd0a0` texto / `#3f8f52` ponto) —
 * as outras 3 são extrapolação, mantendo o mesmo padrão (texto claro/
 * pastel, ponto mais saturado), registrada aqui em vez de inventada
 * silenciosamente no componente.
 */
export const TARIFF_FLAG_DARK_TEXT_CLASS: Record<TariffFlag, string> = {
    GREEN: "text-[#8fd0a0]",
    YELLOW: "text-[#e0b563]",
    RED_P1: "text-[#e08a76]",
    RED_P2: "text-[#e0654a]",
}

export const TARIFF_FLAG_DARK_DOT_COLOR: Record<TariffFlag, string> = {
    GREEN: "#3f8f52",
    YELLOW: "#c98f2e",
    RED_P1: "#c15a42",
    RED_P2: "#a83f2c",
}

/** Valor de acréscimo (R$/100kWh) de cada bandeira, dado um config. */
export const tariffFlagPer100Kwh = (config: TariffFlagConfig, flag: TariffFlag): number => {
    switch (flag) {
        case "GREEN":
            return config.greenPer100Kwh
        case "YELLOW":
            return config.yellowPer100Kwh
        case "RED_P1":
            return config.redP1Per100Kwh
        case "RED_P2":
            return config.redP2Per100Kwh
    }
}

/** "sem acréscimo" (valor 0) ou "+ R$ X / 100 kWh" — sempre a partir do
 * valor REAL da API, nunca dos números de exemplo do handoff. Extraído de
 * `TariffFlagListCard` quando a Landing/Login viraram consumidores reais. */
export const formatTariffFlagNote = (per100Kwh: number): string =>
    per100Kwh === 0 ? "sem acréscimo" : `+ ${formatBrl(per100Kwh)} / 100 kWh`
