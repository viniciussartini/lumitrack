/**
 * Funções puras de formatação para campos brasileiros.
 *
 * Estratégia: aplicar a máscara incrementalmente conforme o usuário digita,
 * sem libs externas. As funções são idempotentes — você pode chamá-las
 * com input já formatado e o resultado é o mesmo.
 *
 * Exemplos:
 *   formatCpf("12345678909")      → "123.456.789-09"
 *   formatCpf("123.456.789-09")   → "123.456.789-09"  (idempotente)
 *   formatCpf("123abc456")        → "123.456"          (ignora não-dígitos)
 */

const onlyDigits = (value: string): string => value.replace(/\D/g, "")

export const formatCpf = (value: string): string => {
    const digits = onlyDigits(value).slice(0, 11)

    if (digits.length <= 3) {
        return digits
    }

    if (digits.length <= 6) {
        return `${digits.slice(0, 3)}.${digits.slice(3)}`
    }

    if (digits.length <= 9) {
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    }

    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export const formatCnpj = (value: string): string => {
    const digits = onlyDigits(value).slice(0, 14)

    if (digits.length <= 2) {
        return digits
    }

    if (digits.length <= 5) {
        return `${digits.slice(0, 2)}.${digits.slice(2)}`
    }

    if (digits.length <= 8) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
    }

    if (digits.length <= 12) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
    }
    
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}