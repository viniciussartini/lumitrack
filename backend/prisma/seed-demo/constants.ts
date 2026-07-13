import { DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

// Satisfaz passwordSchema (mín. 8, maiúscula, minúscula, número, especial).
// Este script nunca deve rodar contra produção real — ver README/aviso no
// próprio seed-demo.ts.
export const DEMO_PASSWORD = "DemoLumi@2026"

export { DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL }

// Janela de 1 ano de histórico, até 10/07/2026 (ver PLANO_SIMULADOR_IOT_E_SEED_DEMO.md).
// Brasil não observa horário de verão desde 2019 — a conversão local (-03:00)
// → UTC é sempre uma soma fixa de 3h, sem precisar de biblioteca de fuso horário.
const BRAZIL_UTC_OFFSET_HOURS = 3

export const SEED_WINDOW_START_UTC = new Date(
    Date.UTC(2025, 6, 11, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0),
) // 2025-07-11T00:00:00-03:00
export const SEED_WINDOW_END_UTC = new Date(
    Date.UTC(2026, 6, 10, 23 + BRAZIL_UTC_OFFSET_HOURS, 59, 0, 0),
) // 2026-07-10T23:59:00-03:00 (inclusive)

// Nº de linhas por lote em cada `meterReading.createMany` — medido na
// primeira execução real contra o Postgres de dev (ver LOG_SIMULADOR_IOT.md).
export const READINGS_BATCH_SIZE = 10_000
