// backend/, frontend/ e iot-simulator/{server,ui} são pacotes independentes,
// cada um com seu próprio eslint.config.js/.prettierrc/tsconfig.json
// (03-arquitetura.md) — não existe eslint/prettier/tsc de raiz. Cada glob
// roda o eslint/prettier *daquele* pacote nos arquivos staged que caem
// dentro dele, e o type-check do pacote inteiro — ver
// scripts/lint-staged-run.mjs sobre por que tsc não filtra por arquivo e
// sobre a diferença entre tscMode "build" (composite, exige `-b`) e
// "noEmit" (não-composite, `-b` emitiria dist/ a cada commit).
function scoped(dir, tscMode) {
    return (filenames) => {
        const args = filenames.map((f) => JSON.stringify(f)).join(" ")
        return `node scripts/lint-staged-run.mjs ${JSON.stringify(dir)} ${tscMode} ${args}`
    }
}

export default {
    "backend/**/*.ts": scoped("backend", "noEmit"),
    "frontend/**/*.{ts,tsx}": scoped("frontend", "build"),
    "iot-simulator/server/**/*.ts": scoped("iot-simulator/server", "noEmit"),
    "iot-simulator/ui/**/*.{ts,tsx}": scoped("iot-simulator/ui", "build"),
}
