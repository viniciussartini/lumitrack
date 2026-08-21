#!/usr/bin/env bash
# Hook UserPromptSubmit — força a ativação das skills do kit.
# Motivo: a ativação automática por descrição é inconsistente na prática (~50%);
# a listagem de skills também pode ser descartada quando estoura o orçamento de contexto.
# Este hook detecta palavras-gatilho no prompt e injeta uma instrução explícita.
# Lê o JSON do evento no stdin; o stdout (exit 0) é adicionado ao contexto do Claude.
node -e '
let d = "";
process.stdin.on("data", c => d += c).on("end", () => {
  try {
    const j = JSON.parse(d);
    const p = ((j.prompt) || "").toLowerCase();

    // Ordem importa: a primeira regra que casar vence (evita instrução dupla).
    // Sem \b no fim dos verbos — "refatora" precisa casar com "refatorar", "refatoração" etc.
    const regras = [
      ["auditoria-seguranca",   /\b(auditoria de seguran|revis(ã|a)o de seguran|checar vulnerabilidade|est(á|a) seguro|pentest|owasp)/, "agente"],
      ["auditoria-conformidade",/\b(auditoria de conformidade|lgpd|prote(ç|c)(ã|a)o de dados|base legal|dado pessoal)/, "agente"],
      ["auditoria-desempenho",  /\b(auditoria de desempenho|performance|est(á|a) lento|gargalo|otimiza(r|ção) (a )?(consulta|query|bundle))/, "agente"],
      ["auditoria-qualidade",   /\b(auditoria de qualidade|sa(ú|u)de do c(ó|o)digo|code smell|avaliar a arquitetura|d(í|i)vida t(é|e)cnica)/, "agente"],
      ["onboarding",        /\b(onboarding|guia (para|de) (novo|nova) (dev|pessoa|membro)|documento de entrada|como algu(é|e)m come(ç|c)a|retomar o projeto)/],
      ["revisao-codigo",    /\b(revisa(r)? (esse |este |o )?(pr|pull request|diff|branch|c(ó|o)digo)|code review|revis(ã|a)o de c(ó|o)digo|o que voc(ê|e) mudaria)/, "agente"],
      ["scaffold-projeto",  /\b(scaffold|inicia(r)? o projeto|inicializar o projeto|estrutura inicial|montar o reposit|come(ç|c)ar o projeto|definir? (a )?(stack|arquitetura)|entrevista (de|da) (stack|arquitetura))/],
      ["criar-issues",      /\b(cria(r)? (as |a )?issues?|abre(r)? (as |a )?issues?|issue (para|de)|transforma(r)? os achados|(é|e)pico|epic\b)/],
      ["planejar-roadmap",  /\b(roadmap|planeja(r)? a implementa|planejamento do mvp|o que construir primeiro|prioriza\w* (as )?features|replaneja)/],
      ["correcao-bugs",     /\b(bug\b|erro\b|exce(ç|c)(ã|a)o|stack trace|n(ã|a)o funciona|comportamento errado|corrigi|fix\b)/],
      ["refatoracao",       /\b(refator|limpar o c(ó|o)digo|reduzir complexidade|code smell|extrair (m(é|e)todo|fun(ç|c)(ã|a)o))/],
      ["nova-feature",      /\b(nova feature|implementa(r)? (a |o )?(feature|m(ó|o)dulo|tela|endpoint)|adicionar funcionalidade|construir (o|a) (endpoint|tela))/],
      ["preparar-pr",       /\b(prepara(r)? o (pr\b|texto do pr)|texto do (pr\b|pull request)|descri(ç|c)(ã|a)o do pr\b|resumir a branch|o que mudou nesta branch)/]
    ];

    for (const [nome, re, tipo] of regras) {
      if (re.test(p)) {
        const t = tipo === "agente" ? "o subagente" : "a Skill";
        console.log("[kit] Gatilho detectado para `" + nome + "`. Use " + t + " `" + nome + "` para atender este pedido, seguindo o procedimento dele. Se o pedido claramente não corresponder a esse escopo, ignore esta instrução e siga normalmente.");
        break;
      }
    }
  } catch (e) { /* JSON inválido: não injetar nada */ }
  process.exit(0);
});'
