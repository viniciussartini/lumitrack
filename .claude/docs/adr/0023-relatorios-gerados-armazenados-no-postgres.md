# ADR-0023 — Relatórios gerados armazenados como bytes no PostgreSQL

- **Data:** 2026-09-28
- **Status:** aceita
- **Branch/Issue relacionada:** planejamento da Fase 27 do roadmap (ainda sem épico/issue aberta)

## Contexto

A Fase 27 (Relatórios) emite PDF/CSV que devem ser **imutáveis** (RN35) e ficar num histórico com download e exclusão. É preciso decidir onde o arquivo mora. Os dois ambientes publicados têm perfis de armazenamento diferentes: a produção roda numa VPS com disco persistente (ADR-0012), mas o staging roda no Render, cujo disco é efêmero (ADR-0010/0013). Os arquivos são pequenos (PDF/CSV de poucos KB) e contêm dado pessoal (endereço, consumo), então precisam de retenção, exclusão e backup controlados.

## Decisão

Vamos guardar o conteúdo do relatório como bytes numa coluna do modelo `Report` no PostgreSQL, sem dependência de disco local nem de object storage.

## Alternativas consideradas

- **Volume em disco** — o disco do Render é efêmero, então o staging perderia o histórico a cada deploy; ainda exigiria backup e purga separados do banco.
- **Object storage externo (S3 e similares)** — dependência e operador novos, com implicação de transferência internacional (ADR-0008/0014), sem necessidade real para arquivos de poucos KB.
- **Guardar só os parâmetros e regerar no download** — viola a imutabilidade (RN35): os dados de origem mudam.

## Consequências

- Positivas: funciona igual nos dois ambientes; entra no backup e na retenção que já existem (`RetentionPurgeScheduler`); a exclusão do relatório remove o dado de fato; o DSAR (RF17) pode incluí-lo.
- Negativas/custos: o banco cresce com o histórico (mitigado por teto de tamanho por arquivo e retenção); leitura do arquivo passa pela API, não por URL direta; se o volume ou o tamanho dos relatórios crescer muito, será preciso reavaliar (nova ADR).
- Não havia item correspondente em `07-decisoes-em-aberto.md`.
- **Teto e contas de demonstração:** o histórico guarda no máximo 100 relatórios manuais por usuário (checado sob trava, com os agendados fora da conta) e a retenção expurga os mais antigos. As contas de demonstração podem emitir e excluir relatórios de propósito, para mostrar a funcionalidade; o abuso fica limitado pelo teto e pela retenção, e não por bloqueio de escrita como nos agendamentos (que guardam e-mail digitado pelo usuário).
