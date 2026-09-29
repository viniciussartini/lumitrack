import type {
    PrismaClient,
    Report as PrismaReport,
    ReportFormat,
    ReportOrigin,
    ReportType,
    TargetType,
} from "@/generated/prisma/client.js"

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
}
