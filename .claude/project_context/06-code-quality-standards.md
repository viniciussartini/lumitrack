# 06 — Padrões de Qualidade de Código

> Fonte única referenciada por todas as skills. **Princípio-guia: qualidade é enforçada por ferramenta, não por disciplina manual.** Toda regra que puder virar lint, type-check ou gate de CI **deve** virar.

> **Trava anti-over-engineering (ler antes do resto):** aplique os princípios **onde eles se pagam**, não por ritual. Abstração especulativa, camadas e generalizações "para o futuro" custam mais do que rendem. **YAGNI e KISS têm precedência** sobre qualquer princípio abaixo em caso de conflito.
>
> **Calibre pelo contexto, não pelo hábito:** o que é over-engineering num protótipo de uma pessoa pode ser requisito num sistema com equipe, rotatividade e dado de terceiro. Em equipe, o custo de leitura por outra pessoa entra na conta — explicitude vence esperteza. Segurança, conformidade e os controles verificáveis do `05`/`11` **nunca** são cortados por YAGNI.

## SOLID (com pragmatismo)

- **S — Single Responsibility:** cada módulo/classe/função tem uma razão para mudar.
- **O — Open/Closed:** estender sem alterar código estável — **só quando** já há variação real, não antecipada.
- **L — Liskov:** subtipos honram o contrato do tipo base.
- **I — Interface Segregation:** interfaces pequenas e focadas.
- **D — Dependency Inversion:** depender de abstrações, não de implementações concretas.

## Clean Code

- Nomes que revelam intenção; funções pequenas com uma responsabilidade.
- Sem números/strings mágicos — constantes nomeadas.
- Comentário explica o **porquê**, não o **o quê** (regras completas em "Comentários e documentação de código", abaixo).
- Sem código morto, sem `console.log` esquecido, sem TODO órfão.
- Tratamento de erro explícito e consistente (falhar fechado — ver A10).

## Comentários e documentação de código

> **Critério único: o comentário é funcional?** Ele deve explicar o que o código é, o que faz, como funciona ou por que faz assim. Se não explica nada disso, não entra.

**O que documentar (formato Javadoc / JSDoc / TSDoc):**

- **Classes, interfaces e tipos de domínio** — responsabilidade e papel no módulo.
- **Funções e métodos públicos** — propósito, parâmetros, retorno e erros lançados.
- **Trechos de lógica complexa** — algoritmos, regras de negócio não óbvias, cálculos, máquinas de estado.
- **Decisões não óbvias no código** — por que esta abordagem e não a esperada (ex.: ordem de operações que evita race condition, workaround de limitação de biblioteca).
- **Invariantes e pré-condições** que o tipo não consegue expressar.

**Formato por linguagem:**

- **TypeScript/JavaScript:** JSDoc/TSDoc (`/** ... */`) com `@param`, `@returns`, `@throws`, `@example` quando ajudar.
- **Java:** Javadoc (`/** ... */`) com `@param`, `@return`, `@throws`.
- Comentários de linha (`//`) só para esclarecer um trecho pontual dentro do corpo — a documentação de contrato é sempre em bloco.

```typescript
/**
 * Calcula o saldo disponível da conta, descontando reservas ainda não liquidadas.
 *
 * Reservas expiradas (mais de 24h sem liquidação) são ignoradas, pois o provedor
 * de pagamento já as libera automaticamente do lado dele.
 *
 * @param conta - Conta com as reservas já carregadas.
 * @returns Saldo em centavos; nunca negativo (piso em zero).
 * @throws {ContaInativaError} Se a conta não estiver ativa.
 */
```

**Proibido — comentário de rastreabilidade:**

Nada de referências a **issues, PRs, relatórios de auditoria, achados, sprints, datas, autores ou números de RF/RNF/RN/FNC**. Não é funcional, não explica o código e envelhece mal.

```typescript
// ❌ Corrigido conforme achado A-03 da auditoria de segurança de 12/03
// ❌ Ver issue #142
// ❌ Adicionado no PR #87 por solicitação da revisão
// ❌ TODO(#55): refatorar depois
// ❌ RN23 — Grupo A não tem piso de disponibilidade
// ❌ Implementa RF25 (subgrupo/modalidade/demanda contratada obrigatórios)

// ✅ Compara os hashes em tempo constante para não vazar o tamanho do prefixo correto.
// ✅ Grupo A não tem piso de disponibilidade — o papel equivalente é da
//    demanda contratada, paga integralmente mesmo sem uso.
```

**Por quê:** rastreabilidade já tem lugar próprio no kit — histórico no **git** (Conventional Commits com `Closes #N`), o que foi decidido nos **ADRs**, o que foi entregue no **CHANGELOG**, o que falta nas **issues**, e o que cada **RF/RNF/RN/FNC** exige no `02-requisitos.md`. Repetir isso no código cria uma quinta (ou sexta) fonte, que ninguém atualiza e que sobrevive ao contexto que a originou: seis meses depois, "achado A-03" não significa nada para quem lê, e "RN23" exige abrir outro arquivo para descobrir o que a regra realmente diz — enquanto a explicação do *porquê*, escrita por extenso, continua valendo sozinha.

RF/RNF/RN/FNC são um caso à parte dos demais: não são artefato de processo de desenvolvimento (isso morreria mesmo sem a regra), são identificadores **estáveis e append-only** do `02-requisitos.md` — por isso é tentador tratá-los como uma citação normativa legítima (a exemplo de "REN 1.000/2021 art. 291", que é sobre a *norma externa*, não sobre o *documento interno do kit*, e continua permitida). A direção da citação, porém, é sempre **do `02-requisitos.md` para o código** ("RN01: regra cruzada validada no `meter.service.ts`"), nunca o inverso — o código explica a regra por extenso, sem precisar do número para ser entendido. Um comentário como "mesmo padrão de RN01 do Medidor" ainda é comentário de rastreabilidade: quem lê o código não tem por que saber o que é "RN01" sem abrir outro arquivo, e o `02-requisitos.md` já registra esse mesmo apontamento na direção certa.

**Higiene:**

- Comentário desatualizado é pior que comentário ausente — ao alterar a função, atualize o bloco.
- Não comente código morto: **apague**. O git guarda.
- Nada de comentário redundante que repete o nome (`// incrementa o contador` sobre `contador++`).
- `TODO` sem dono e sem prazo vira issue, não comentário. Exceção do kit: `TODO(design)` para tela aguardando handoff (ver `10`).

**Enforcement (obrigatório — esta regra é ignorada com frequência quando fica só na prosa):**

- `eslint-plugin-jsdoc` valida presença e forma dos blocos em exports públicos (`jsdoc/require-jsdoc`, `jsdoc/require-param`, `jsdoc/require-returns`).
- **`no-warning-comments` bloqueia comentário de rastreabilidade** — regra nativa do ESLint, casa o termo em qualquer posição do comentário:

```js
"no-warning-comments": ["error", {
  terms: ["issue #", "closes #", "fixes #", "pr #", "auditoria", "achado",
          "conforme revisão", "solicitado na revisão", "ver issue", "ref #"],
  location: "anywhere"
}]
```

Coerente com o princípio do topo: o que pode virar lint, vira lint. Se um termo legítimo cair na regra, a saída é reescrever o comentário em termos funcionais — não adicionar exceção.

**`RF`/`RN`/`RNF`/`FNC` seguido de número é pego por uma regra local própria**, não pelo `no-warning-comments` nativo: `no-warning-comments` só casa substring literal, e não há como listar "RF"/"RN"/"RNF"/"FNC" como termos sem também barrar toda ocorrência legítima dessas letras em prosa comum. A regra `local/no-comment-req-refs` (`eslint-rules/no-comment-req-refs.js`, um arquivo por pacote — `backend`, `frontend`, `iot-simulator/server`, `iot-simulator/ui`) varre todo comentário do arquivo contra o padrão `\b(RF|RN|RNF|FNC)\d+\b` e falha o lint na primeira ocorrência. Achado real (Fase 20, PR #401, revisão de código): a lacuna documentada aqui por muito tempo — "não é pego mecanicamente, depende de revisão" — se provou real: ~25 comentários de produção citando RN/RF entraram numa única branch sem o lint acusar nada, porque o texto desta seção dizia que o `no-warning-comments` "barra" sem qualificar que RF/RN/RNF/FNC ficavam de fora. As três skills de implementação citavam a mesma frase incompleta — corrigidas junto.

**Gap que continua exigindo revisão, não lint:** issue number abreviado dentro de parênteses (`(issues #323/#328)`) ainda escapa de `"issue #"` — não presumir que "o lint não acusou" significa "está limpo" para esse caso.

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
- **ESLint** com regras de complexidade (`complexity`, `max-lines-per-function`, `max-depth`) + **Prettier** + **`eslint-plugin-jsdoc`** (documentação de exports públicos).
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
