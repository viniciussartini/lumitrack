#!/usr/bin/env bash
# Hook PreToolUse (matcher: Read|Edit|Write) — bloqueia acesso a arquivos .env (segredos).
# Exceção: .env.example (documentação de variáveis, sem segredos).
node -e '
let d = "";
process.stdin.on("data", c => d += c).on("end", () => {
  try {
    const j = JSON.parse(d);
    const p = (j.tool_input && (j.tool_input.file_path || j.tool_input.path)) || "";
    const base = p.split(/[\\/]/).pop() || "";
    if (base.startsWith(".env") && !base.startsWith(".env.example")) {
      console.error("Bloqueado pelo kit: arquivos .env contêm segredos e não devem ser lidos/editados pelo agente (ver A04 em .claude/project_context/05-security-standards.md). Use .env.example para documentar variáveis.");
      process.exit(2);
    }
  } catch (e) { /* não bloquear em erro de parse */ }
  process.exit(0);
});'
