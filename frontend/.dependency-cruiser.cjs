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
            name: "no-ui-import-in-logic",
            comment:
                "services/hooks/lib/schemas/contexts são a camada de lógica — não " +
                "dependem de pages/components (camada de UI). A dependência vai sempre " +
                "da UI para a lógica, nunca o contrário.",
            severity: "error",
            from: { path: "^src/(services|hooks|lib|schemas|contexts)/" },
            to: { path: "^src/(pages|components)/" },
        },
    ],
    options: {
        tsPreCompilationDeps: true,
        tsConfig: { fileName: "tsconfig.app.json" },
        exclude: { path: "^(dist|coverage)" },
        // Só o próprio código do app entra no grafo de ciclo — sem isto,
        // no-circular também reporta ciclos internos de dependências de
        // terceiros, que não são nosso código pra corrigir.
        doNotFollow: { path: "node_modules" },
    },
}
