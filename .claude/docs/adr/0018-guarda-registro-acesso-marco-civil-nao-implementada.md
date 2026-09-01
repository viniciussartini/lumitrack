# ADR-0018 — Guarda formal de registros de acesso (Marco Civil Art. 15) não será implementada

- **Data:** 2026-08-31
- **Status:** aceita
- **Branch/Issue relacionada:** issue #269 (sub-issue do épico #266, Fase 14 do roadmap)

## Contexto

A issue #269 pedia a implementação de guarda formal de registros de acesso (IP, timestamp, recurso acessado) por 6 meses sob sigilo, conforme Art. 15 do Marco Civil da Internet — obrigação de provedor de aplicação, distinta do `AuditLog` de domínio já existente. Era a última sub-issue aberta do épico #266 (Fase 14 — ciclo de vida de dados: retenção e DSAR).

A **ADR-0014** (2026-08-23), posterior à criação do épico #266, declarou os dois ambientes publicados do LumiTrack (produção VPS e staging Render/Neon) **permanentemente de demonstração** — nunca vão tratar dado real de titular — e decidiu que "o trabalho de conformidade operacional que só se justifica havendo titular real não será feito enquanto esta ADR vigorar", citando explicitamente o risco de registro de acesso do staging como **assumido de forma permanente**, não mais como pendência a resolver.

A ADR-0014 não listou literalmente a guarda do Art. 15 no seu rol de itens não-a-fazer (esse rol cobria DPA, SCC, retenção de dado por titular, DSAR completo, base legal, consentimento) — daí a issue #269 ter permanecido aberta e precisar de confirmação explícita antes de decidir seu destino (`07-decisoes-em-aberto.md`).

## Decisão

Estendemos o racional da ADR-0014 para a guarda formal do Art. 15: **não será implementada enquanto a ADR-0014 vigorar.** A obrigação do Marco Civil visa proteger o registro de acesso de usuários reais de uma aplicação real; com os dois ambientes publicados permanentemente restritos a demonstração/dado sintético (`REGISTRATION_ENABLED=false` fixado, sem titular real), formalizar guarda de 6 meses sob sigilo para esse registro é desproporcional ao risco (mesma trava de YAGNI/KISS que fundamentou a ADR-0014). A issue #269 é fechada como não-vai-fazer.

Se a ADR-0014 for revertida (cadastro real aberto em algum ambiente), esta decisão é revertida junto — a auditoria completa de conformidade exigida pelo ponto 5 da ADR-0014 antes de `REGISTRATION_ENABLED=true` deve reavaliar também a guarda de registros de acesso.

## Alternativas consideradas

- **Implementar a guarda mesmo assim** — descartada: sem titular real protegido, o custo de manter um mecanismo de captura/retenção/sigilo de 6 meses não se paga; seria o mesmo tipo de trabalho desproporcional que a ADR-0014 já cortou para os itens análogos (SCC, retenção por titular, DSAR completo).
- **Deixar a issue aberta indefinidamente** — descartada: mantém ambíguo, igual ao problema que a própria ADR-0014 fechou para os outros itens — sem gatilho claro de quando isso seria retomado.

## Consequências

- Positivas: fecha o último item pendente do épico #266, elimina ambiguidade sobre o escopo real da ADR-0014, evita esforço de engenharia em mecanismo sem titular real a proteger.
- Negativas/custos: se um dia um ambiente publicado ganhar titular real, este item some do radar até a auditoria de conformidade completa (ponto 5 da ADR-0014) recolocá-lo — não há lembrete automático fora da própria ADR-0014.
- Atualiza `.claude/project_context/07-decisoes-em-aberto.md`: nenhuma remoção necessária — este item nunca chegou a ser registrado lá (foi resolvido diretamente com o usuário nesta sessão, antes de virar pendência formal).
