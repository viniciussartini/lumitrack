/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            comment:
                "Dependência circular entre módulos indica fronteira mal traçada ou " +
                "conceito faltando (03-arquitetura.md — Sem dependência circular entre " +
                "módulos).",
            severity: "error",
            from: {},
            to: { circular: true },
        },
        {
            name: "no-express-in-domain",
            comment:
                "O domínio (service/repository) não pode importar framework/infra HTTP " +
                "diretamente (03-arquitetura.md — direção de dependência apontando para " +
                "dentro). Uma regra que se paga vale mais que dez especulativas (YAGNI, 06:5).",
            severity: "error",
            from: { path: "^src/modules/.*\\.(service|repository)\\.ts$" },
            to: {
                path: "^(express|helmet|cors|cookie-parser)$",
                dependencyTypes: ["npm", "npm-no-pkg"],
            },
        },
    ],
    options: {
        tsPreCompilationDeps: true,
        tsConfig: { fileName: "tsconfig.json" },
        exclude: { path: "^(dist|src/generated/prisma|coverage)" },
        // Só o próprio código do módulo entra no grafo de ciclo — sem isto,
        // no-circular também reporta ciclos internos de dependências de
        // terceiros (zod, pg-pool, readable-stream...), que não são nosso
        // código pra corrigir.
        doNotFollow: { path: "node_modules" },
    },
}
