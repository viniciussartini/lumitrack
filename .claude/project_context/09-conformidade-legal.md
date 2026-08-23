# 09 — Conformidade Legal Brasileira (LGPD + correlatas)

> Fonte única de conformidade legal, referenciada pelas skills. Lei nº 13.709/2018 (LGPD) + regulamentação da ANPD + legislação correlata.
>
> **Checklist de engenharia informado pela lei — não é parecer jurídico.** Tratamento de alto risco pede apoio de encarregado/advogado. A interseção *segurança × proteção de dados* (PII em log, criptografia) vive em `05-security-standards.md`.
>
> **Ver [ADR-0014](../docs/adr/0014-ambientes-permanentemente-demonstracao.md):** os dois ambientes publicados do LumiTrack (produção VPS + staging Render/Neon) são **permanentemente ambientes de demonstração**, sem titular real. Os itens abaixo marcados **"Deferido — ver ADR-0014"** continuam como checklist de referência (útil para quem fizer fork e operar com dado real), mas não são trabalho ativo enquanto essa ADR vigorar — não confundir "documentado" com "pendente a fazer em breve".

## Regime aplicável — Agente de Pequeno Porte (Res. CD/ANPD 2/2022)

- Solo dev / MVP / startup geralmente **se enquadra** (microempresa, EPP, startup, pessoa natural).
- Benefícios: **encarregado (DPO) dispensado** — porém **obrigatório manter canal de comunicação** com o titular; registro de operações simplificado; **prazos em dobro** (resposta a titulares e comunicação de incidentes).
- **Não dispensa:** bases legais, princípios, direitos do titular, transparência e segurança.

## Bases legais (Art. 7 / Art. 11)

> **Atribuição formal com revisão jurídica: deferido — ver ADR-0014.** O `ROPA.md` já registra uma base legal por operação (o que o código implementa); a atribuição formal, com revisão de advogado/encarregado, só se justifica havendo titular real.

- [ ] Cada operação de tratamento tem **base legal definida e documentada** (consentimento, execução de contrato, legítimo interesse, obrigação legal, etc.).
- [ ] Dados sensíveis (Art. 5º, II) usam as bases restritas do Art. 11.

## Direitos do titular (Art. 18 + Art. 20)

- [ ] Estrutura para atender: confirmação, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento, **revogação de consentimento** e **revisão de decisões automatizadas** (Art. 20).
- [ ] **Canal de comunicação** para exercício dos direitos (obrigatório mesmo no pequeno porte).

## Consentimento e transparência (Art. 8, 9)

> **Reaceite via `consentVersion` e granularidade Termos/Política separados: deferido — ver ADR-0014.** O campo já existe no schema; comparar/forçar reaceite só se justifica havendo titular real aceitando algo de fato.

- [ ] Quando a base for consentimento: livre, informado, específico, **granular** e revogável tão facilmente quanto concedido.
- [ ] **Aviso de Privacidade** claro: finalidade, retenção, compartilhamento, contato do responsável.

## Dados sensíveis e de crianças/adolescentes (Art. 5º II, 11, 14)

- [ ] Dados sensíveis: tratamento restrito + segurança reforçada.
- [ ] Crianças/adolescentes: melhor interesse; consentimento **específico e destacado** de um dos pais/responsável.

## Minimização, retenção e eliminação (Art. 6, 15, 16)

> **Retenção por titular (`MeterReading`/`AlertTriggerEvent`/etc.) e DSAR completo: deferido — ver ADR-0014.** Sem titular real, não há prazo de retenção a cumprir nem urgência de export. A questão de `meter_readings` crescer indefinidamente passa a ser tratada como armazenamento/performance (Fase 15 do roadmap), não conformidade.

- [ ] Coletar só o necessário; documentar quais dados e por quê.
- [ ] **Prazo de retenção definido**; eliminação após cumprida a finalidade.

## Registro de operações e RIPD (Art. 37, 38)

- [x] **ROPA** (registro das atividades de tratamento) — `.claude/docs/ROPA.md`, mantido vivo a cada mudança de schema.
- [x] **RIPD/DPIA** quando o tratamento for de alto risco — `.claude/docs/RIPD.md` (medição contínua). Riscos residuais reavaliados por ADR-0014 (ver documento).

## Operadores / DPA (Art. 39)

> **DPA e SCC dos 3 operadores atuais: deferido, permanentemente — ver ADR-0014.** Não é lacuna a fechar; é risco assumido de forma consciente enquanto os ambientes forem só demonstração.

- [ ] **Contrato de tratamento (DPA)** com cada operador. **Estado atual (ADR-0010 + ADR-0012, Fase 13.7; ADR-0014, 2026-08-23): dois ambientes, três operadores, nenhum DPA assinado — e nenhum será, enquanto a ADR-0014 vigorar.** A **produção** (VPS, São Paulo) tem **um** operador — o provedor de infraestrutura que aluga a máquina: armazenar dado por conta do controlador é tratamento (Art. 5º, X) e quem o faz é operador (Art. 5º, VII), independentemente de não acessar o conteúdo da aplicação. A diferença que importa em relação ao staging não é "ter ou não ter operador", é que **esse processa integralmente no Brasil** — sem transferência internacional, sem SCC a celebrar. O **staging/validação** (Render + Neon, EUA) tem dois operadores, sem DPA e com transferência internacional descoberta. **Risco assumido permanentemente pela ADR-0014**: nenhum dos dois ambientes tem ou terá titular real (cadastro fechado por padrão, contas sintéticas) — a exposição real se limita a registro de acesso de visitante. Inventário vivo na tabela de operadores de `.claude/docs/ROPA.md`. Nenhum provedor SMTP contratado em nenhum dos dois ambientes.
- [ ] **Ao adotar qualquer operador novo** (SMTP, APM, agregador de log, banco gerenciado, CDN): assinar DPA **antes** do primeiro byte de dado pessoal, acrescentar a linha no ROPA e reavaliar a seção abaixo. Requisitos técnicos mínimos a exigir em contrato: `.claude/docs/AUDITORIA_SEGURANCA.md` § 7.1. **Esta regra continua valendo** mesmo sob a ADR-0014 — ela deferiu o trabalho de regularizar os 3 operadores já existentes, não abriu exceção para operadores futuros.

## Notificação de incidente (Art. 48 + Res. 15/2024)

- [ ] Comunicar **ANPD e titulares afetados em até 3 dias úteis** do conhecimento de que o incidente afetou dados pessoais (**em dobro** no pequeno porte) — quando houver risco/dano relevante.
- [ ] Manter **registro de incidentes por 5 anos** (mesmo os não comunicados, com a justificativa de não comunicar).
- [ ] **Plano de resposta a incidentes** pronto — conecta com A09 (logging/alerting) e A10 (error handling) em `05`.

## Transferência internacional (Art. 33-36 + Res. 19/2024)

> **SCC do staging: deferido, permanentemente — ver ADR-0014.** A exposição abaixo deixou de ser "gate que reabre a análise" e passa a ser risco aceito de forma consciente e definitiva, enquanto o staging existir com esse papel.

- [ ] **Estado atual (ADR-0010 + ADR-0012, Fase 13.7; ADR-0014, 2026-08-23): aplica-se só ao staging, de forma limitada e sem SCC — a produção não tem transferência internacional.** A **produção** (VPS, São Paulo) roda inteira no Brasil — seu único operador, o provedor de infraestrutura, processa em território nacional. Sem transferência, por inexistência do fato gerador, restaurando a conclusão da ADR-0008 no que ela tem de decisivo. O **staging/validação** (Render + Neon, EUA) continua com exposição: o único dado pessoal que sai do Brasil ali são os **registros de acesso de visitantes** (IP, data/hora, rota) — as contas da aplicação são sintéticas e o cadastro está fechado por padrão nos dois ambientes, então não há dado de titular real no produto. **Não há SCC celebrada**: risco assumido permanentemente pela ADR-0014, não uma lacuna a sanar. **Se o próprio projeto abrir cadastro real** um dia (não planejado), isso exige uma nova `auditoria-conformidade` completa antes de `REGISTRATION_ENABLED=true` em qualquer ambiente (ADR-0014).
- [ ] Qualquer provedor fora do Brasil (hospedagem, banco, APM, agregador de log, SMTP, CDN) = transferência internacional de dados, e reabre todos os itens abaixo.
- [ ] Sem decisão de adequação para os EUA → **incorporar as Cláusulas-Padrão Contratuais (SCCs) da ANPD** nos contratos com cada provedor (período de graça encerrado em ago/2025).
- [ ] UE reconhecida como adequada (Res. 32/2026); EUA **não**.
- [ ] Preferir, quando possível, **região de hospedagem no Brasil ou na UE** para reduzir exposição.

## Marco Civil da Internet (Lei 12.965/2014)

- [x] Guarda de **registros de acesso a aplicações por 6 meses** (Art. 15) — já coberta na prática: `audit_logs` retém 730 dias (`DATA_RETENTION_AUDIT_LOG_DAYS`, `RetentionService`), acima do mínimo de 180 dias exigido.

## Cookies / Analytics

- **Estado atual: não há analytics.** Os únicos cookies são os essenciais de sessão (`AUTH_COOKIE_NAME`, `CSRF_COOKIE_NAME` e os equivalentes de refresh) — estritamente necessários ao funcionamento, portanto sem exigência de consentimento prévio.
- [ ] **Ao adotar qualquer analytics ou cookie não essencial:** banner de consentimento granular e revogável, base legal definida por finalidade, e a linha correspondente no ROPA. Vale a mesma trava de região da ADR-0008 registrada em `05` — ferramenta estrangeira reabre a transferência internacional.

## Definition of Done — Conformidade

- Toda operação de tratamento tem **base legal documentada** (no ROPA — a atribuição formal/jurídica é deferida por ADR-0014).
- **Canal de direitos do titular** disponível; aviso de privacidade publicado.
- **DPAs** assinados com os operadores; **transferência internacional coberta por SCCs** — deferido por ADR-0014 enquanto os ambientes forem permanentemente demonstração.
- **Plano de resposta a incidentes** com prazo de 3 dias úteis e registro de 5 anos.
