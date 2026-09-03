/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            comment:
                "Dependência circular indica fronteira mal traçada ou conceito faltando " +
                "(03-arquitetura.md — Sem dependência circular entre módulos).",
            severity: "error",
            from: {},
            to: { circular: true },
        },
    ],
    options: {
        tsPreCompilationDeps: true,
        tsConfig: { fileName: "tsconfig.json" },
        exclude: { path: "^(dist|coverage)" },
        // Só o próprio código do app entra no grafo de ciclo — sem isto,
        // no-circular também reporta ciclos internos de dependências de
        // terceiros, que não são nosso código pra corrigir.
        doNotFollow: { path: "node_modules" },
    },
}
