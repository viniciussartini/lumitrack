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

/**
 * Mascara um CPF já formatado, preservando só o último bloco visível.
 * Assume entrada já no formato "000.000.000-00" (é sempre o caso — vem
 * decifrado do backend já com a máscara aplicada).
 *
 * Exemplo: maskCpf("123.456.789-00") → "•••.•••.789-00"
 */
export const maskCpf = (cpf: string): string => cpf.replace(/^\d{3}\.\d{3}/, "•••.•••")

/**
 * Mascara um CNPJ já formatado, preservando só o último bloco visível
 * (filial + dígitos verificadores). Mesma premissa de entrada de `maskCpf`.
 *
 * Exemplo: maskCnpj("12.345.678/0001-00") → "••.•••.•••/0001-00"
 */
export const maskCnpj = (cnpj: string): string => cnpj.replace(/^\d{2}\.\d{3}\.\d{3}/, "••.•••.•••")

/**
 * Formata um CEP no padrão 00000-000.
 * Idempotente: input já formatado retorna inalterado.
 *
 * Exemplos:
 *   formatCep("30000000")  → "30000-000"
 *   formatCep("30000-000") → "30000-000"
 *   formatCep("30abc000")  → "30000"
 */
export const formatCep = (value: string): string => {
    const digits = onlyDigits(value).slice(0, 8)

    if (digits.length <= 5) {
        return digits
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`
}
