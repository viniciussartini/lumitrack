/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
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
    },
}
