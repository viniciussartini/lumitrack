#!/usr/bin/env bash
# Hook PreToolUse (matcher: Bash) — política do kit: commits, push e criação/merge de PR são MANUAIS.
# Lê o JSON do evento no stdin; exit 2 bloqueia a ferramenta e devolve o motivo ao Claude.
node -e '
let d = "";
process.stdin.on("data", c => d += c).on("end", () => {
  try {
    const j = JSON.parse(d);
    const cmd = (j.tool_input && j.tool_input.command) || "";
    if (/\bgit\s+(commit|push)\b/.test(cmd) || /\bgh\s+pr\s+merge\b/.test(cmd)) {
      console.error("Política do kit (.claude/project_context/08-convencoes-git.md): commits, push e merge de PR são feitos MANUALMENTE pelo usuário. Gere o texto do commit em vez de executar. Permitidos: gh pr create (via skill preparar-pr, exige branch já publicada) e gh issue create (via skill criar-issues, com aprovação).");
      process.exit(2);
    }
  } catch (e) { /* JSON inválido: não bloquear */ }
  process.exit(0);
});'
