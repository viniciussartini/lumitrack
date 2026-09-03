# ADR-0014 — Ambientes permanentemente de demonstração, sem dado real de titular

- **Data:** 2026-08-23
- **Status:** aceita
- **Branch/Issue relacionada:** issue #260 (épico #259, Fase 14 do roadmap)
- **Resolve:** fecha em definitivo a condicional "cadastro fechado hoje, mas o dia em que abrir reabre toda a análise" espalhada em ADR-0008, ADR-0010, ADR-0012, `ROPA.md` e `09-conformidade-legal.md`.

## Contexto

O LumiTrack roda hoje em dois ambientes públicos — produção (VPS Hostinger, São Paulo, branch `main`, ADR-0012) e staging/validação (Render + Neon, EUA, branch `staging`, ADR-0010/0012). Os dois têm cadastro público fechado (`REGISTRATION_ENABLED=false`) e só contêm contas de demonstração sintéticas (`backend/prisma/seed-demo/`).

Desde a ADR-0008, todo documento de conformidade do projeto (ROPA, RIPD, `09-conformidade-legal.md`) trata isso como um estado **transitório**: o cadastro está fechado *por enquanto*, e há uma lista de "gates de go-live" e de trabalho pendente (DPA com os operadores, SCC do staging, retenção de dado por titular, DSAR completo, atribuição formal de base legal, reaceite de consentimento) que se tornaria obrigatório no dia em que ele abrisse. A Fase 14 do roadmap (épicos #259 e #266, criados a partir dela) foi desenhada inteiramente em cima dessa premissa: que a produção real do LumiTrack um dia teria titulares reais para proteger.

Essa premissa não é verdadeira. O dono do projeto decidiu que **os dois ambientes publicados nunca vão tratar dado real de titular — são permanentemente demonstração.** Isso muda a natureza do trabalho de conformidade pendente: ele deixa de ser "a fazer em breve" e passa a ser "não vai ser feito, porque o risco que ele mitigaria não existe". Manter o backlog como estava — DPA a assinar, SCC a negociar, retenção por titular a implementar — é desproporcional ao risco real (viola a precedência de YAGNI/KISS do `06-code-quality-standards.md`) e mantém uma ambiguidade que o próprio projeto já vinha sinalizando, sem nunca fechar: qual é, exatamente, o gatilho que faria esse trabalho começar?

## Decisão

1. **Os dois ambientes publicados — produção (VPS, branch `main`) e staging (Render/Neon, branch `staging`) — são declarados permanentemente ambientes de demonstração.** `REGISTRATION_ENABLED=false` permanece fixado nos dois por configuração, e o **default no código** (`backend/src/config/env.ts`) passa de `true` para `false` — reforço técnico de defesa em profundidade: um ambiente novo que suba sem configurar a variável explicitamente nasce fechado, não aberto.
2. **O risco residual que já existe é assumido explícita e permanentemente:** o staging processa registros de acesso de visitante (IP, data/hora, rota) via Render/Neon nos EUA, sem SCC celebrada (Res. CD/ANPD 19/2024). Isso deixa de ser uma pendência "a resolver por contrato" e passa a ser um risco aceito de forma consciente e definitiva, documentado como tal em `ROPA.md` e `09-conformidade-legal.md`.
3. **O trabalho de conformidade operacional que só se justifica havendo titular real não será feito enquanto esta ADR vigorar** — não é adiamento vago, é decisão de não fazer: adesão a DPA de Render/Neon/provedor da VPS; celebração de SCC do staging; retenção de dado pessoal por titular (`MeterReading`/`AlertTriggerEvent`/`MfaBackupCode`/`TariffFlagHistory`); export DSAR completo; atribuição formal de base legal por operação; reaceite de consentimento via `consentVersion`. Os artefatos que já existem (`ROPA.md`, `RIPD.md`) continuam mantidos e atualizados quando o schema mudar — eles têm valor como evidência de maturidade de portfólio e como checklist pronto para quem precisar deles.
4. **Quem fizer fork deste repositório e decidir operar com titular real herda essa responsabilidade integralmente a partir daquele ponto.** O estado atual do repositório — mesmo com ROPA/RIPD bem cuidados — não deve ser tomado como conformidade suficiente para operação real; é um ponto de partida, não uma certificação.
5. **Se o próprio projeto decidir um dia abrir cadastro real**, isso exige, como pré-requisito obrigatório antes de `REGISTRATION_ENABLED=true` em qualquer ambiente, uma nova execução completa da `auditoria-conformidade` e a resolução de todos os achados — não a retomada informal do que ficou pendente aqui. Este ponto substitui, de forma mais explícita, a lógica de "gate de go-live" que a ADR-0008 já registrava.

## Alternativas consideradas

- **Seguir os épicos #259/#266 como planejados** (DPA, SCC, retenção por titular, DSAR completo, base legal, consentimento) — descartada: desproporcional a um risco que não existe enquanto os ambientes forem só demonstração; violaria a precedência de YAGNI/KISS do `06`.
- **Deixar a condicional implícita como estava**, espalhada em ADR-0008/0010/0012, ROPA e `09` — descartada: não fecha o assunto como o dono do projeto pediu, e mantém ambíguo qual evento dispara o trabalho pendente.
- **Remover ROPA/RIPD por não haver mais necessidade prática** — descartada: os dois documentos têm valor como evidência de maturidade de portfólio e como checklist pronto para um fork que decida operar com dado real; descartá-los jogaria fora esse valor sem necessidade.

## Consequências

**Positivas**
- Fecha um backlog de conformidade desproporcional ao risco real, liberando esforço de engenharia para trabalho que de fato importa hoje (desempenho, robustez do worker IoT, design system — Fases 15–18).
- Substitui a lógica de "reabre no futuro", hoje duplicada em 4+ documentos, por uma única fonte de verdade (esta ADR).
- `REGISTRATION_ENABLED` fail-closed por padrão reduz o risco de um ambiente novo (ex.: um terceiro ambiente futuro, ou um fork mal configurado) nascer com cadastro aberto por omissão.

**Negativas/custos**
- O risco residual do staging (registro de acesso de visitante nos EUA, sem SCC) passa a ser permanente, não mais transitório — é um risco aceito de forma consciente, não eliminado.
- Se o dono do projeto mudar de ideia no futuro, nada do trabalho de conformidade operacional foi adiantado por esta ADR — a auditoria completa (ponto 5) precisa ser feita do zero, com o mesmo esforço que teria hoje.
- Documentos que hoje tratam "abrir cadastro real" como um evento razoavelmente próximo (privacy-policy.md, ROPA.md) precisam de revisão para não sugerir uma trajetória que o projeto não vai seguir.

Atualiza `.claude/project_context/07-decisoes-em-aberto.md`: acrescenta esta ADR à lista de Resolvidas; ajusta o item **Lockout de conta**, que hoje cita "abrir cadastro para usuários reais" como gatilho de reavaliação esperado — o gatilho passa a ter probabilidade permanentemente baixa, sem que isso feche o item (ele continua válido por razões de robustez geral, independentes de titular real).
