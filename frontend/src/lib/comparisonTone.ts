/**
 * Cor da diferença mês a mês nas telas de comparação de propriedade
 * (ACR × ACL, Convencional × Branca). Mesma tolerância de meio centavo do
 * `resolveComparisonSign` no backend — sem ela, um resíduo de ponto
 * flutuante (ou o mês em que os dois cenários convergem exatamente, como o
 * piso de disponibilidade da Branca) pintaria de verde uma diferença que o
 * usuário nem consegue ver na tela, formatada em 2 casas decimais.
 */
const DIFF_TONE_TOLERANCE_BRL = 0.005

export const resolveDiffToneClass = (diffBrl: number): string => {
    if (diffBrl > DIFF_TONE_TOLERANCE_BRL) return "text-status-success"
    if (diffBrl < -DIFF_TONE_TOLERANCE_BRL) return "text-status-danger"
    return "text-muted"
}

/**
 * Abaixo deste percentual, dois períodos contam como equivalentes: a
 * tolerância é relativa (não em reais como a das comparações tarifárias)
 * porque a grandeza comparada muda de unidade — V, A, kW, Hz, % —, e uma
 * diferença absoluta fixa não significaria a mesma coisa em todas.
 */
export const PERIOD_VARIATION_TOLERANCE_PERCENT = 1

/**
 * Cor da variação de B sobre A no Histórico: vermelho quando B ficou acima de
 * A, verde quando abaixo (mesma convenção do design), neutro dentro da
 * tolerância ou sem percentual calculável. O sentido é o de "subiu/desceu",
 * não um juízo de valor — que um fator de potência maior seja melhor ou uma
 * distorção maior seja pior depende da grandeza.
 *
 * @param percent - Variação percentual de B sobre A, ou `null` se não calculável.
 * @returns A classe de cor do texto.
 */
export const resolvePeriodVariationToneClass = (percent: number | null): string => {
    if (percent === null || Math.abs(percent) <= PERIOD_VARIATION_TOLERANCE_PERCENT) {
        return "text-muted"
    }
    return percent > 0 ? "text-status-danger" : "text-status-success"
}
