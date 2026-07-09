import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { env } from "@/config/env.js"

// Mesmo algoritmo de shared/crypto/encryption.ts (AES-256-GCM), mas com
// chave própria (ADDRESS_ENCRYPTION_KEY) — compartimentaliza o risco:
// endereço geográfico é dado pessoal sob a LGPD (Art. 5º, I), e deve usar
// chave independente de CPF/CNPJ e de segredo MFA.
// Módulo separado (não parametrizado por chave) seguindo o mesmo padrão
// já usado no projeto para mfaEncryption.ts vs. encryption.ts.
// Não há blind index para endereço: ao contrário de CPF/CNPJ, o endereço
// não tem constraint @unique no schema e nunca é usado como filtro de query
// — um blind index adicionaria complexidade sem nenhum benefício.

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
    return Buffer.from(env.ADDRESS_ENCRYPTION_KEY, "hex")
}

export function encryptAddress(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptAddress(encoded: string): string {
    const buffer = Buffer.from(encoded, "base64")
    const iv = buffer.subarray(0, IV_LENGTH)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
