#!/usr/bin/env node
// Roda eslint --fix, prettier --write e type-check com cwd no pacote certo,
// para os arquivos staged que caem dentro dele (backend/, frontend/ e
// iot-simulator/{server,ui} são pacotes independentes — cada um com seu
// próprio eslint.config.js/.prettierrc/tsconfig.json, sem tooling de raiz).
// Usado só pelo lint-staged.config.js; `cd pkg && ...` não funciona ali
// porque lint-staged spawna o comando sem shell.
//
// tsc não recebe lista de arquivos — projeto TypeScript é uma unidade, não
// dá para type-checar um arquivo isolado sem os que ele importa.
//
// tscMode diferencia dois casos:
//   "build" — pacote composite (frontend/, iot-simulator/ui): o tsconfig.json
//     raiz só tem `references`, então só `tsc -b` resolve os sub-projetos.
//     Seguro porque cada sub-tsconfig já tem `noEmit: true`.
//   "noEmit" — pacote não-composite (backend/, iot-simulator/server): usar
//     `tsc -b` aqui emitiria .js de verdade em dist/ a cada commit (esses
//     tsconfig não têm `noEmit`), poluindo o working tree e fazendo o
//     vitest pegar os `.test.js` compilados junto com os `.test.ts` fonte
//     (teste duplicado, achado ao ligar isto na issue #298). `tsc --noEmit`
//     evita o emit inteiramente.
// Roda incremental (tsBuildInfoFile já configurado em cada tsconfig do
// pacote), então o custo por commit é ~150-200ms com cache quente (medido);
// só o primeiro run do dia paga o custo completo (~1-3s por pacote).
import { spawnSync } from "node:child_process"
import path from "node:path"

const [, , dir, tscMode, ...files] = process.argv
const cwd = path.resolve(dir)
const relativeFiles = files.map((file) => path.relative(cwd, path.resolve(file)))
const tscArgs = tscMode === "build" ? ["-b"] : ["--noEmit"]

for (const args of [
    ["eslint", "--fix", ...relativeFiles],
    ["prettier", "--write", ...relativeFiles],
    ["tsc", ...tscArgs],
]) {
    const result = spawnSync("npx", args, { cwd, stdio: "inherit" })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
