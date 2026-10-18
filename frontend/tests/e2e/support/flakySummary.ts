import { appendFileSync, existsSync, readFileSync } from "node:fs"

/**
 * Lista no resumo do job de E2E os testes que só passaram no retry.
 *
 * `retries: 2` no CI transforma qualquer intermitência em job verde, então
 * nada indicaria quantos testes estão instáveis nem quais. O Playwright
 * classifica esses testes como `flaky` no relatório JSON; este script os
 * escreve, nominalmente, no `$GITHUB_STEP_SUMMARY`. Não altera o critério de
 * aprovação do job: um teste flaky continua passando.
 *
 * Uso: `node tests/e2e/support/flakySummary.ts <relatorio.json>`
 */

interface ReportTest {
    status: string
    projectName: string
    results: unknown[]
}

interface ReportSpec {
    file: string
    title: string
    tests: ReportTest[]
}

interface ReportSuite {
    specs?: ReportSpec[]
    suites?: ReportSuite[]
}

interface FlakyTest {
    file: string
    title: string
    project: string
    attempts: number
}

const collectFlaky = (suite: ReportSuite): FlakyTest[] => {
    const own = (suite.specs ?? []).flatMap((spec) =>
        spec.tests
            .filter((test) => test.status === "flaky")
            .map((test) => ({
                file: spec.file,
                title: spec.title,
                project: test.projectName,
                attempts: test.results.length,
            })),
    )
    const nested = (suite.suites ?? []).flatMap(collectFlaky)
    return [...own, ...nested]
}

const escapeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s+/g, " ")

const toMarkdown = (flaky: FlakyTest[]): string =>
    [
        "### Testes E2E instáveis (passaram só no retry)",
        "",
        "| Arquivo | Teste | Projeto | Tentativas |",
        "|---|---|---|---|",
        ...flaky.map(
            (test) =>
                `| ${escapeCell(test.file)} | ${escapeCell(test.title)} | ${escapeCell(test.project)} | ${test.attempts} |`,
        ),
        "",
    ].join("\n")

const main = (): void => {
    const reportPath = process.argv[2]
    const summaryPath = process.env.GITHUB_STEP_SUMMARY

    // Sem relatório (o Playwright nem chegou a rodar) ou fora do GitHub Actions
    // não há o que resumir — e este passo nunca deve mascarar a falha real.
    if (!reportPath || !summaryPath || !existsSync(reportPath)) return

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as ReportSuite
    const flaky = collectFlaky(report)

    if (flaky.length > 0) appendFileSync(summaryPath, toMarkdown(flaky))
}

main()
