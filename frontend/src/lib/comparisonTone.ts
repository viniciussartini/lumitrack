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
