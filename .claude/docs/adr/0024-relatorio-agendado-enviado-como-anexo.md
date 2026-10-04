# ADR-0024 — Relatório agendado enviado por e-mail como anexo

- **Data:** 2026-09-28
- **Status:** aceita
- **Branch/Issue relacionada:** planejamento da Fase 27 do roadmap (ainda sem épico/issue aberta)

## Contexto

O agendamento de relatórios (RF41) envia o relatório a destinatários digitados pelo usuário, que podem ser e-mails de terceiros. O relatório contém dado pessoal (endereço da propriedade, consumo). É preciso decidir se o e-mail leva o arquivo anexo ou um link de acesso. Um link autenticado exigiria login do destinatário, o que na prática só serve ao próprio titular e frustra o propósito de compartilhar com terceiros (síndico, contador, gestor).

## Decisão

Vamos enviar o relatório como anexo do e-mail, via Nodemailer já em uso. O envio fica registrado no histórico com origem "agendada". Endereços de destinatários nunca vão para log.

## Alternativas consideradas

- **Link autenticado** — exige conta do destinatário; inviabiliza o compartilhamento com terceiros.
- **Link público assinado com expiração** — cria superfície nova (URL como credencial, revogação, expiração) sem necessidade proporcional ao contexto atual.

## Consequências

- Positivas: funciona para qualquer destinatário; sem nova superfície de acesso público; reaproveita SMTP existente.
- Negativas/custos: dado pessoal sai da plataforma para caixas de terceiros, fora do nosso controle de exclusão; hoje o risco é coberto pela ADR-0014 (ambientes permanentemente de demonstração, sem titular real). A ação de o titular indicar destinatário é ato dele, mas o fluxo precisa constar no ROPA e no aviso de privacidade; abrir cadastro real exige a auditoria de conformidade completa já prevista pela ADR-0014. Limite de tamanho do anexo e de nº de destinatários por configuração.
- Não havia item correspondente em `07-decisoes-em-aberto.md`.
- **Garantia de entrega e premissa de instância única:** o envio é "pelo menos uma vez". O e-mail sai antes de a execução ser registrada (`nextRunAt` avança e o histórico é gravado numa transação só depois), então uma falha do banco entre os dois passos, ou duas instâncias vivas ao mesmo tempo, podem repetir um envio. A premissa é a do monólito de uma instância (`03`), com uma trava de passada dentro do processo. Reservar a execução antes de enviar (uma coluna de reserva com prazo) fica para quando houver mais de uma instância.
- **Opt-out, identificação do remetente e verificação do e-mail do titular** não existem hoje e estão em `07-decisoes-em-aberto.md`, como pré-requisito para contratar SMTP ou abrir cadastro real.
