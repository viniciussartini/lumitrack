import { createHmac } from "crypto"
import { env } from "@/config/env.js"

// Blind index — HMAC-SHA256 determinístico usado para permitir busca por
// igualdade e constraint de unicidade sobre um valor que, em repouso, fica
// criptografado com IV aleatório (e portanto nunca repete ciphertext, mesmo
// para o mesmo CPF/CNPJ — ver encryption.ts). Chave separada da chave de
// criptografia: nunca reutilizar a mesma chave para cifra e MAC.
export function generateBlindIndex(value: string): string {
    return createHmac("sha256", Buffer.from(env.CPF_CNPJ_BLIND_INDEX_KEY, "hex"))
        .update(value)
        .digest("hex")
}
