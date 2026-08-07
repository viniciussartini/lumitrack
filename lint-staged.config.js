// backend/, frontend/ e iot-simulator/{server,ui} são pacotes independentes,
// cada um com seu próprio eslint.config.js/.prettierrc (03-arquitetura.md) —
// não existe eslint/prettier de raiz. Cada glob roda o eslint/prettier
// *daquele* pacote, só nos arquivos staged que caem dentro dele.
function scoped(dir) {
    return (filenames) => {
        const args = filenames.map((f) => JSON.stringify(f)).join(" ")
        return `node scripts/lint-staged-run.mjs ${JSON.stringify(dir)} ${args}`
    }
}

export default {
    "backend/**/*.ts": scoped("backend"),
    "frontend/**/*.{ts,tsx}": scoped("frontend"),
    "iot-simulator/server/**/*.ts": scoped("iot-simulator/server"),
    "iot-simulator/ui/**/*.{ts,tsx}": scoped("iot-simulator/ui"),
}
