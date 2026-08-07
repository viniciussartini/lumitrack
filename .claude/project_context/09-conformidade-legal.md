# 09 — Conformidade Legal Brasileira (LGPD + correlatas)

> Fonte única de conformidade legal, referenciada pelas skills. Lei nº 13.709/2018 (LGPD) + regulamentação da ANPD + legislação correlata.
>
> **Checklist de engenharia informado pela lei — não é parecer jurídico.** Tratamento de alto risco pede apoio de encarregado/advogado. A interseção *segurança × proteção de dados* (PII em log, criptografia) vive em `05-security-standards.md`.

## Regime aplicável — Agente de Pequeno Porte (Res. CD/ANPD 2/2022)

- Solo dev / MVP / startup geralmente **se enquadra** (microempresa, EPP, startup, pessoa natural).
- Benefícios: **encarregado (DPO) dispensado** — porém **obrigatório manter canal de comunicação** com o titular; registro de operações simplificado; **prazos em dobro** (resposta a titulares e comunicação de incidentes).
- **Não dispensa:** bases legais, princípios, direitos do titular, transparência e segurança.

## Bases legais (Art. 7 / Art. 11)

- [ ] Cada operação de tratamento tem **base legal definida e documentada** (consentimento, execução de contrato, legítimo interesse, obrigação legal, etc.).
- [ ] Dados sensíveis (Art. 5º, II) usam as bases restritas do Art. 11.

## Direitos do titular (Art. 18 + Art. 20)

- [ ] Estrutura para atender: confirmação, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento, **revogação de consentimento** e **revisão de decisões automatizadas** (Art. 20).
- [ ] **Canal de comunicação** para exercício dos direitos (obrigatório mesmo no pequeno porte).

## Consentimento e transparência (Art. 8, 9)

- [ ] Quando a base for consentimento: livre, informado, específico, **granular** e revogável tão facilmente quanto concedido.
- [ ] **Aviso de Privacidade** claro: finalidade, retenção, compartilhamento, contato do responsável.

## Dados sensíveis e de crianças/adolescentes (Art. 5º II, 11, 14)

- [ ] Dados sensíveis: tratamento restrito + segurança reforçada.
- [ ] Crianças/adolescentes: melhor interesse; consentimento **específico e destacado** de um dos pais/responsável.

## Minimização, retenção e eliminação (Art. 6, 15, 16)

- [ ] Coletar só o necessário; documentar quais dados e por quê.
- [ ] **Prazo de retenção definido**; eliminação após cumprida a finalidade.

## Registro de operações e RIPD (Art. 37, 38)

- [ ] **ROPA** (registro das atividades de tratamento) — simplificado no pequeno porte.
- [ ] **RIPD/DPIA** quando o tratamento for de alto risco.

## Operadores / DPA (Art. 39)

- [x] **Contrato de tratamento (DPA)** com cada operador. **Estado atual: não há operador** — a ADR-0008 escolheu hospedagem própria (VM Oracle Cloud Always Free em São Paulo) com PostgreSQL na mesma máquina e sem provedor SMTP contratado, então o controlador é o único agente de tratamento. Inventário vivo na tabela de operadores de `.claude/docs/ROPA.md`.
- [ ] **Ao adotar qualquer operador novo** (SMTP, APM, agregador de log, banco gerenciado, CDN): assinar DPA **antes** do primeiro byte de dado pessoal, acrescentar a linha no ROPA e reavaliar a seção abaixo. Requisitos técnicos mínimos a exigir em contrato: `.claude/docs/AUDITORIA_SEGURANCA.md` § 7.1.

## Notificação de incidente (Art. 48 + Res. 15/2024)

- [ ] Comunicar **ANPD e titulares afetados em até 3 dias úteis** do conhecimento de que o incidente afetou dados pessoais (**em dobro** no pequeno porte) — quando houver risco/dano relevante.
- [ ] Manter **registro de incidentes por 5 anos** (mesmo os não comunicados, com a justificativa de não comunicar).
- [ ] **Plano de resposta a incidentes** pronto — conecta com A09 (logging/alerting) e A10 (error handling) em `05`.

## Transferência internacional (Art. 33-36 + Res. 19/2024)

- [x] **Estado atual: não se aplica** — a ADR-0008 hospeda tudo em São Paulo, sem provedor estrangeiro. Não há transferência internacional a cobrir, por inexistência do fato gerador (não por dispensa). Foi a aplicação da última regra desta lista: preferir região Brasil/UE **elimina** o problema em vez de contratá-lo.
- [ ] Qualquer provedor fora do Brasil (hospedagem, banco, APM, agregador de log, SMTP, CDN) = transferência internacional de dados, e reabre todos os itens abaixo.
- [ ] Sem decisão de adequação para os EUA → **incorporar as Cláusulas-Padrão Contratuais (SCCs) da ANPD** nos contratos com cada provedor (período de graça encerrado em ago/2025).
- [ ] UE reconhecida como adequada (Res. 32/2026); EUA **não**.
- [ ] Preferir, quando possível, **região de hospedagem no Brasil ou na UE** para reduzir exposição.

## Marco Civil da Internet (Lei 12.965/2014)

- [ ] Guarda de **registros de acesso a aplicações por 6 meses** (Art. 15) — equilibrar com a minimização da LGPD (não logar PII desnecessária).

## Cookies / Analytics (PostHog)

- [ ] Banner/consentimento para cookies não essenciais; PostHog (analytics) com base legal/consentimento conforme o caso.

## Definition of Done — Conformidade

- Toda operação de tratamento tem **base legal documentada**.
- **Canal de direitos do titular** disponível; aviso de privacidade publicado.
- **DPAs** assinados com os operadores; **transferência internacional coberta por SCCs**.
- **Plano de resposta a incidentes** com prazo de 3 dias úteis e registro de 5 anos.
