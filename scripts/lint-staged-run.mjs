#!/usr/bin/env node
// Roda eslint --fix e prettier --write com cwd no pacote certo, para os
// arquivos staged que caem dentro dele (backend/, frontend/ e
// iot-simulator/{server,ui} são pacotes independentes — cada um com seu
// próprio eslint.config.js/.prettierrc, sem tooling de raiz). Usado só pelo
// lint-staged.config.js; `cd pkg && ...` não funciona ali porque lint-staged
// spawna o comando sem shell.
import { spawnSync } from "node:child_process"
import path from "node:path"

const [, , dir, ...files] = process.argv
const cwd = path.resolve(dir)
const relativeFiles = files.map((file) => path.relative(cwd, path.resolve(file)))

for (const args of [
    ["eslint", "--fix", ...relativeFiles],
    ["prettier", "--write", ...relativeFiles],
]) {
    const result = spawnSync("npx", args, { cwd, stdio: "inherit" })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
