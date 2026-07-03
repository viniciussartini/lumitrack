# RBAC — Design para uma versão futura mais extensível

> **Status:** documento de referência, **não implementado**. Descreve como o
> RBAC mínimo entregue na sub-issue #16 (enum `Role` com `USER`/`ADMIN` +
> middleware `requireRole`) poderia evoluir para um sistema de permissões
> mais rico, caso surjam requisitos que o modelo binário atual não cubra
> (ex.: papéis intermediários como suporte/financeiro, ou administração
> restrita a um subconjunto de recursos). Nenhum destes itens está no
> roadmap ativo — este arquivo existe apenas para não perder o raciocínio
> quando (e se) essa necessidade aparecer.

## O que existe hoje (#16)

Um enum `Role { USER ADMIN }` no `User`, lido do banco a cada requisição
(nunca um claim do JWT — ver `authenticate.ts`) e checado por um middleware
`requireRole(...allowed: Role[])` aplicado rota a rota. Suficiente para
gatear um único endpoint administrativo (consulta ao audit log), mas não
generaliza bem além de "é ou não é admin".

## Limitações do modelo atual e como endereçá-las no futuro

- **Só dois níveis.** Não há como expressar um papel intermediário (ex.:
  `SUPPORT` que só lê, `BILLING_ADMIN` que só mexe em cobrança) sem
  transformar `Role` num enum cada vez maior e `requireRole` numa lista
  cada vez mais confusa de combinações. Uma evolução natural é substituir a
  coluna única `role` por tabelas `Role`/`Permission`/`RolePermission` (ou,
  mais simples, um claim `permissions: string[]` por papel, resolvido uma
  vez e cacheado), permitindo compor um papel a partir de permissões
  nomeadas por ação (`audit_log:read`, `user:impersonate`, etc.) em vez de
  um `if (role === "ADMIN")` espalhado pelo código.
- **Sem escopo por recurso.** O admin de hoje é global — não há como
  restringir um admin a, por exemplo, um subconjunto de propriedades ou
  distribuidoras. Isso exigiria autorização ciente de recurso (não só de
  papel), provavelmente combinando `requirePermission` com uma checagem de
  ownership/escopo específica do recurso, similar ao que já existe hoje
  para usuários comuns (ex.: `property.service.ts`), mas parametrizável por
  papel.
- **Sem generalização declarativa.** `requireRole` hoje é uma comparação de
  igualdade contra uma lista fixa de valores passados manualmente em cada
  rota. Um sistema mais maduro declararia a permissão exigida por rota de
  forma centralizada (ex.: um mapa `rota → permissão`), tornando auditável
  de forma estática quais permissões cada endpoint exige, sem precisar ler
  o código de cada `*.routes.ts` individualmente.
- **Fonte da role e cache.** A decisão de sempre ler a role do banco a cada
  requisição (#16) foi deliberada — garante revogação/promoção imediata,
  sem exigir novo login. Se o modelo de permissões crescer (múltiplos
  papéis, permissões compostas, joins mais caros), pode fazer sentido
  introduzir uma camada de cache de curta duração (ex.: alguns segundos,
  invalidada ativamente na promoção/rebaixamento) para não pagar o custo de
  um join mais pesado em todo request. **Qualquer cache futuro precisa
  preservar a garantia atual de que revogar um admin tem efeito
  quase-imediato** — não deve reintroduzir silenciosamente o problema que
  esta decisão evitou (precisar de novo login para uma mudança de
  permissão valer).

## Quando revisitar este documento

Se surgir um segundo caso de uso administrativo além da consulta ao audit
log (#16) — por exemplo, um endpoint para desativar contas, ou para
gerenciar consentimentos LGPD de outros usuários — é o sinal de que vale a
pena promover o modelo binário atual para algo mais expressivo, usando as
direções acima como ponto de partida.
