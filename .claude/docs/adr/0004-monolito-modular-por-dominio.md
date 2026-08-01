# ADR-0004 — Monólito modular por domínio, DI via `createApp(deps)`

- **Data:** 2026-07-31
- **Status:** aceita
- **Branch/Issue relacionada:** —

## Contexto

O item "Módulos de domínio iniciais: quais existem no MVP" estava aberto em `07-decisoes-em-aberto.md` desde a criação do kit. O projeto já passou dessa fase: os módulos de domínio existem, estabilizaram e o padrão estrutural se repete de forma consistente em todos eles. Este ADR formaliza a fronteira e o mecanismo de composição já em uso, para que novas features (`nova-feature`) e refatorações tenham um padrão explícito a seguir em vez de precisar inferi-lo lendo módulos existentes toda vez.

## Decisão

Vamos manter um **monólito modular**, com um módulo por conceito de domínio em `backend/src/modules/<nome>/`, cada um seguindo a cadeia `routes → controller → service → repository` (schema Zod na borda). Módulos não acessam tabelas de outro módulo diretamente — quando precisam de dado de outro domínio, recebem o repository correspondente por parâmetro (ex.: `meter-target.ts` recebe os repositories de Property/Area/Device para resolver posse, sem importar os services desses módulos).

A composição da aplicação é feita por **injeção de dependência explícita** via `createApp(deps: AppDependencies)` ([backend/src/app.ts](../../backend/src/app.ts)): a função aceita (ou constrói default para) `prismaClient`, `processor`, `userEventHub`, `alertEvaluator`, `notificationStore` e os rate limiters. Isso é o que permite testes de integração instanciarem a app inteira com um Postgres de teste e mocks pontuais, sem subir o processo real (`server.ts`).

Os 16 módulos ativos hoje: `admin`, `alert`, `alert-event`, `area`, `auth`, `consumption`, `device`, `distributor`, `export`, `iot`, `meter`, `notification`, `property`, `simulation`, `tariff-flag`, `user`.

## Alternativas consideradas

- **Microsserviços** — over-engineering para um projeto solo/MVP; nenhum requisito real de escala, deploy independente ou time separado o justifica hoje (mesma trava de proporcionalidade de `03-arquitetura.md`).
- **Um container de DI (ex.: InversifyJS/tsyringe)** — a injeção manual via parâmetros de função já resolve o caso de uso (testabilidade) sem introduzir decorators, reflection metadata ou uma dependência nova; revisitar se o grafo de dependências crescer a ponto de a montagem manual ficar difícil de ler.
- **Acesso direto entre módulos via import de service** — descartado porque reintroduziria o acoplamento que a fronteira de módulo existe para evitar; a passagem de repository por parâmetro mantém a fronteira sem duplicar código.

## Consequências

- Positivas: fronteira de módulo clara e testável isoladamente; app inteira instanciável em memória para testes de integração; adicionar um módulo novo segue um template já validado 16 vezes.
- Negativas/custos: `createApp(deps)` cresce a cada nova dependência transversal (hoje 7 parâmetros opcionais) — se continuar crescendo, pode valer a pena agrupar em um objeto de contexto único; disciplina manual necessária para não vazar acesso direto a tabelas de outro módulo (nada impede mecanicamente hoje, é convenção).
- Veio de `07-decisoes-em-aberto.md` — item removido de lá.
