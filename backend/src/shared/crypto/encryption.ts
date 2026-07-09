import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { env } from "@/config/env.js"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // bytes — tamanho recomendado para GCM
const AUTH_TAG_LENGTH = 16 // bytes

function getKey(): Buffer {
    return Buffer.from(env.CPF_CNPJ_ENCRYPTION_KEY, "hex")
}

// Criptografa um valor em repouso (CPF/CNPJ) com AES-256-GCM. O IV é
// aleatório a cada chamada — o mesmo valor produz ciphertext diferente em
// cada criptografia, por isso a constraint de unicidade não pode incidir
// sobre o valor criptografado (ver blindIndex.ts para isso).
// Formato armazenado: base64(iv || authTag || ciphertext).
export function encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decrypt(encoded: string): string {
    const buffer = Buffer.from(encoded, "base64")
    const iv = buffer.subarray(0, IV_LENGTH)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
