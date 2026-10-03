import { ValidationError } from "@/shared/errors/AppError.js"

/**
 * Relatório pedido para um alvo que não comporta o tipo (a demanda só existe
 * na propriedade do Grupo A). É uma subclasse própria porque a execução
 * agendada pausa a configuração nesse caso, em vez de tentar de novo.
 */
export class UnsupportedReportTargetError extends ValidationError {}
