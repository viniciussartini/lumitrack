# 07 — Decisões em Aberto

> **Pergunte antes de assumir qualquer item listado aqui.** Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova o item desta lista** — este arquivo contém apenas o que ainda está em aberto. Lista vazia é o estado saudável.

**O que entra aqui:** decisão que **bloqueia ou condiciona implementação** e ainda não foi tomada — normalmente uma feature que esbarrou numa escolha não feita.

**O que NÃO entra:** ideia de melhoria (vira issue), preferência sem impacto técnico, decisão já tomada (vira ADR) e tarefa (vira roadmap).

**Formato:** `- **{Assunto}:** opções consideradas · o que a decisão impacta · o que falta para decidir.`

## Em aberto

- **Provedor(es) OAuth:** Google · GitHub · nenhum (manter só credencial própria) · impacta o fluxo de cadastro e login, o modelo de `User` (conta federada vs. senha) e o consentimento LGPD do dado vindo do provedor · falta definir se o público-alvo ganha algo com login social. Hoje só existe login por e-mail/senha (+ MFA opcional).
- **App mobile:** existe · não existe · impacta a estratégia de token (a ADR-0002 já prevê o canal MOBILE com Bearer), o escopo da API e a stack de UI · falta decidir se haverá app.
- **Simulador Modbus TCP/RTU embutido × externo:** implementar o servidor Modbus dentro do `iot-simulator` (como já é o MQTT) · integrar com um simulador Modbus externo · manter só MQTT no simulador · impacta FNC009 e a capacidade de exercitar de ponta a ponta os 8 adaptadores de protocolo do worker (hoje só o caminho MQTT é exercitado com dado real de simulador) · falta avaliar o custo de um servidor Modbus embutido contra o de orquestrar um processo externo no `docker-compose.yml` (ADR-0017).
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas · manter só o rate limiter · impacta A07 (`05`) e o risco de DoS por bloqueio de conta alheia · falta escolher o critério (por conta, por IP+conta, backoff progressivo) e o canal de desbloqueio. **Gap conhecido:** hoje a única defesa é o rate limiter por IP+e-mail (ver ADR-0003). **Urgência agora permanentemente baixa (ADR-0014):** com `REGISTRATION_ENABLED=false` por padrão nos dois ambientes e a decisão de que eles nunca terão titular real, não há conta de titular real para um atacante esgotar por força bruta — o risco é teórico e deve seguir assim. O item continua em aberto por mérito próprio de robustez (não é exclusivo de conta real), sem o gatilho de "abrir cadastro" que o motivava antes.
- **E-mail de relatório a terceiros — saída da lista, identificação e verificação:** link de descadastro por destinatário (token por endereço) · texto do e-mail que identifica quem programou o envio · exigir e-mail verificado do titular antes de agendar · manter como está (cobertura só pela ADR-0014) · impacta o direito de oposição do destinatário (Art. 18 §2º LGPD), o texto de `sendScheduledReportEmail`, o modelo de `report_schedules` (lista de supressão) e o risco de abuso do domínio de envio (20 configurações × 10 destinatários diárias por conta) · falta decidir antes de contratar um SMTP ou de abrir cadastro real. Hoje nenhum e-mail real sai dos ambientes publicados (contas de demonstração só leem e não há SMTP contratado).

## Resolvidas

Decisão tomada não fica aqui: vira ADR e sai da lista de abertos. O índice de todas as ADRs, com o status de cada uma, está em [`../docs/README.md`](../docs/README.md).
