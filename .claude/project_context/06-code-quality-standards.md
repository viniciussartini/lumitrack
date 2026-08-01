# 06 — Padrões de Qualidade de Código

> Fonte única referenciada por todas as skills. **Princípio-guia: qualidade é enforçada por ferramenta, não por disciplina manual.** Toda regra que puder virar lint, type-check ou gate de CI **deve** virar.

> **Trava anti-over-engineering (ler antes do resto):** este é um MVP solo. Aplique os princípios **onde eles se pagam**, não por ritual. Abstração especulativa, camadas e generalizações "para o futuro" custam mais do que rendem. **YAGNI e KISS têm precedência** sobre qualquer princípio abaixo em caso de conflito.

## SOLID (com pragmatismo)

- **S — Single Responsibility:** cada módulo/classe/função tem uma razão para mudar.
- **O — Open/Closed:** estender sem alterar código estável — **só quando** já há variação real, não antecipada.
- **L — Liskov:** subtipos honram o contrato do tipo base.
- **I — Interface Segregation:** interfaces pequenas e focadas.
- **D — Dependency Inversion:** depender de abstrações, não de implementações concretas.

## Clean Code

- Nomes que revelam intenção; funções pequenas com uma responsabilidade.
- Sem números/strings mágicos — constantes nomeadas.
- Comentário explica o **porquê**, não o **o quê**.
- Sem código morto, sem `console.log` esquecido, sem TODO órfão.
- Tratamento de erro explícito e consistente (falhar fechado — ver A10).

## DRY · KISS · YAGNI

- **DRY** com cautela: não deduplicar coincidências.
- **KISS:** a solução mais simples que resolve.
- **YAGNI:** não construir para requisito hipotético.

## Eficiência e complexidade (consciência, não otimização prematura)

> Sujeito à trava do topo: **otimização prematura está sob o YAGNI**. Isto não é "espremer ciclos" — é não escrever código *acidentalmente* ineficiente.

- **Conheça a complexidade no caminho quente / não-limitado:** evite O(n²) em loops aninhados sobre coleções que crescem; cuidado com N+1 (laço que dispara uma query por item).
- **Escolha a estrutura de dados certa:** `Map`/`Set` (O(1)) em vez de busca linear em array (O(n)) quando há muitas buscas.
- **Não materialize o desnecessário:** pagine listagens; faça `select` só dos campos usados; não carregue coleção inteira em memória sem necessidade.
- **Meça antes de otimizar:** para dados pequenos e limitados, prefira o código mais simples (KISS). Otimize com base em medição, não em palpite.

> Lado proativo (build-time) da `auditoria-desempenho`, que faz o lado detective. Mesma linguagem: Big-O, N+1, Map/Set.

## Enforcement automatizado (verificável)

- **TypeScript strict** — `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `noImplicitReturns`. Proibir `any`.
- **ESLint** com regras de complexidade (`complexity`, `max-lines-per-function`, `max-depth`) + **Prettier**.
- **husky + lint-staged:** lint, format e type-check no **pre-commit**.
- **dependency-cruiser:** valida a **direção de dependência** (domínio não importa framework/infra).
- **CI falha** se type-check, lint, format ou testes falharem.

## Arquitetura limpa (nível de módulo)

- Direção de dependência apontando para dentro (DIP); domínio testável sem framework nem banco.

## Testes como qualidade

- **Pirâmide:** muitos unitários (regra de negócio), integração nos contratos, poucos E2E (Playwright) nos fluxos críticos.
- Testes legíveis (arrange-act-assert); o nome descreve o **comportamento**.
- Cobertura como **sinal**, não meta cega — priorizar caminhos de negócio e segurança.

## Abordagem de desenvolvimento (test-first onde se paga)

> Mesma lógica de proporcionalidade da trava do topo: TDD é ferramenta, não ritual.

- **TDD obrigatório em correção de bugs** — reproduzir com teste que falha antes de corrigir (já é o procedimento da skill `correcao-bugs`).
- **TDD recomendado em lógica de domínio** — regras de negócio, cálculos, validações: escreva o teste antes (red → green → refactor). O teste força a pensar o contrato antes da implementação.
- **Teste-depois é aceitável** em UI exploratória, código de cola e scaffold — nesses, test-first custa mais do que rende.
- **ATDD-lite:** os critérios de aceite da issue viram os primeiros casos de teste da feature.
- **Estilo BDD nos nomes:** estruture testes por comportamento, no espírito Given/When/Then ("dado X, quando Y, então Z") — sem framework adicional (Cucumber etc. é tooling desnecessário aqui).
- **Type-driven na borda:** estados inválidos irrepresentáveis via TS strict + schemas Zod ("parse, don't validate") — o tipo elimina classes inteiras de teste.
