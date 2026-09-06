# Handoff bundles do Claude Design

Um diretório por export: `{YYYY-MM-DD}-<escopo>/`. O escopo pode ser uma tela, um fluxo ou o produto inteiro — nomeie pelo que o export de fato cobre. A estrutura interna de cada bundle é preservada como veio (os protótipos dependem de caminhos relativos).

Fluxo: Claude Design → **Export → Handoff to Claude Code → Send to local coding agent** → salvar aqui.

Regras completas (tokens como contrato, divergência, ausência, acessibilidade WCAG 2.2 AA e sincronização nos dois sentidos) em `../project_context/10-design-system.md`.

## Bundles

| Diretório | Escopo | Design system |
|---|---|---|
| `2026-09-06-lumitrack-completo/` | Produto inteiro — 10 telas: as 8 do export anterior (byte-idênticas) mais `LumiTrack Home v2` (app logado redesenhado, com Grupo A) e `LumiTrack Relatório A4` (template do relatório exportado). **Vigente.** | Industry (ADR-0005) |
| `2026-07-31-lumitrack-completo/` | Produto inteiro — 8 telas (landing, auth, LGPD, app logado, simulador IoT). Histórico: superado pelo bundle acima, que contém as mesmas 8 telas. | Industry (ADR-0005) |

Índice das telas, mapeamento para o código e como abrir os protótipos: seção "Bundle vigente" do `10-design-system.md`.
