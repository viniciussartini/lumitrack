// Identidade visual do LumiTrack para documentos gerados no backend (#09 —
// exportação de dados em PDF). Cor extraída de frontend/public/favicon.svg
// (stroke="#fcac00") — não há fonte de marca customizada no frontend (usa a
// stack padrão do sistema), então o PDF usa as fontes embutidas do PDFKit.

export const BRAND = {
    appName: "LumiTrack",
    primaryColor: "#fcac00",
    textColor: "#0f172a", // slate-900
    mutedColor: "#64748b", // slate-500
} as const

// Path `d` do ícone lucide-zap em frontend/public/favicon.svg, viewBox
// original "0 0 24 24". Desenhado via doc.path(...).fill(...) no PDFKit —
// evita depender de uma lib de parsing de SVG só para reproduzir o logo.
export const ZAP_ICON_PATH =
    "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"

export const ZAP_ICON_VIEWBOX_SIZE = 24
