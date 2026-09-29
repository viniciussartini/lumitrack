import type {
    PrismaClient,
    Report as PrismaReport,
    ReportFormat,
    ReportOrigin,
    ReportType,
    TargetType,
} from "@/generated/prisma/client.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

// Metadados do relatório — o conteúdo (bytes) nunca sai numa listagem, só no
// download, para uma tela de histórico não carregar megabytes por linha.
export type ReportResponse = Omit<PrismaReport, "content">

export interface CreateReportInput {
    userId: string
    targetType: TargetType
    targetId: string
    type: ReportType
    format: ReportFormat
    origin: ReportOrigin
    periodStart: Date
    periodEnd: Date
    fileName: string
    content: Buffer
}

export interface ReportFile {
    fileName: string
    format: ReportFormat
    content: Buffer
}

const METADATA_SELECT = {
    id: true,
    userId: true,
    targetType: true,
    targetId: true,
    type: true,
    format: true,
    origin: true,
    periodStart: true,
    periodEnd: true,
    fileName: true,
    sizeBytes: true,
    createdAt: true,
} as const

/** Acesso à tabela `reports` — relatórios emitidos, imutáveis (só criar e excluir). */
export class ReportRepository {
    /** @param prisma - Cliente Prisma do processo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Grava um relatório emitido.
     *
     * @param input - Metadados e conteúdo do arquivo.
     * @returns Os metadados gravados, sem o conteúdo.
     */
    async create(input: CreateReportInput): Promise<ReportResponse> {
        const { content, ...metadata } = input
        return this.prisma.report.create({
            data: { ...metadata, content: new Uint8Array(content), sizeBytes: content.length },
            select: METADATA_SELECT,
        })
    }

    /**
     * Arquivo de um relatório, restrito ao dono — a posse entra na própria
     * consulta, então relatório alheio é indistinguível de inexistente.
     *
     * @param id - Id do relatório.
     * @param userId - Id do usuário que pede o arquivo.
     * @returns O arquivo, ou `null` se não existir ou não for do usuário.
     */
    async findFileByIdAndUser(id: string, userId: string): Promise<ReportFile | null> {
        const row = await this.prisma.report.findFirst({
            where: { id, userId },
            select: { fileName: true, format: true, content: true },
        })
        if (!row) return null
        return { fileName: row.fileName, format: row.format, content: Buffer.from(row.content) }
    }

    /**
     * Histórico de relatórios do usuário, mais recentes primeiro. O `id`
     * desempata `createdAt` para a ordem ser total entre páginas.
     *
     * @param userId - Id do dono dos relatórios.
     * @param pagination - Parâmetros de paginação já validados.
     * @returns Página de metadados, sem o conteúdo dos arquivos.
     */
    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<ReportResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [items, total] = await Promise.all([
            this.prisma.report.findMany({
                where: { userId },
                select: METADATA_SELECT,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip,
                take,
            }),
            this.prisma.report.count({ where: { userId } }),
        ])

        return { items, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Todos os relatórios do usuário, só metadados — insumo da exportação dos
     * dados do titular, que não carrega os arquivos.
     *
     * @param userId - Id do dono dos relatórios.
     * @returns Os metadados, mais recentes primeiro.
     */
    async findAllMetadataByUser(userId: string): Promise<ReportResponse[]> {
        return this.prisma.report.findMany({
            where: { userId },
            select: METADATA_SELECT,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
    }

    /**
     * Exclui um relatório do usuário. A posse entra na própria condição, então
     * relatório alheio não é removido nem distinguível de inexistente.
     *
     * @param id - Id do relatório.
     * @param userId - Id do usuário que pede a exclusão.
     * @returns `true` se um relatório foi excluído.
     */
    async deleteByIdAndUser(id: string, userId: string): Promise<boolean> {
        const result = await this.prisma.report.deleteMany({ where: { id, userId } })
        return result.count > 0
    }

    /**
     * Expurgo por retenção — remove relatórios emitidos antes de `threshold`.
     *
     * @param threshold - Data limite; relatórios criados antes dela são removidos.
     * @returns Quantidade de relatórios removidos.
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.report.deleteMany({ where: { createdAt: { lt: threshold } } })
            return result.count
        })
    }
}
