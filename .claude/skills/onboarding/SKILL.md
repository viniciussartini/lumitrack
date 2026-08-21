---
name: onboarding
description: Gera ou atualiza .claude/docs/onboarding.md — o guia de entrada no projeto (setup verificado, ordem de leitura do contexto, mapa dos módulos, convenções que mais geram retrabalho e primeira tarefa sugerida). Use SEMPRE que o usuário pedir "onboarding", "guia para novo dev", "documento de entrada no projeto", "como alguém começa aqui" ou ao retomar um projeto parado há meses. Produz documento para aprovação — não altera código nem configuração.
model: opus
effort: xhigh
---

# Skill: Onboarding

Produz o guia que faz alguém sair de "clonei o repositório" até "abri meu primeiro PR" sem precisar perguntar.

> **Serve nos dois modos** (`01-descricao.md`): em equipe, é o guia de quem chega; em solo, é o guia de **você daqui a seis meses** — retomar projeto parado é onboarding de si mesmo, e o custo aparece exatamente nos detalhes que ninguém escreve ("como rodava o seed?").

## Contexto obrigatório

Leia **todos** os context files (`01`–`11`) e os artefatos vivos: `.claude/docs/roadmap.md`, `.claude/docs/adr/`, `.claude/log/CHANGELOG.md`, `README` do projeto, `package.json` (scripts reais) e a estrutura de pastas. O onboarding é **derivado** desse material — não invente processo que não existe no kit.

## Princípios

- **Ordem, não volume.** Onze context files entregues de uma vez não são lidos. Sequencie: o que ler antes de tocar em código, o que ler antes do primeiro PR, o que consultar sob demanda.
- **Verificável.** Cada passo de setup termina em algo observável ("`npm run dev` sobe em :5173 e a home carrega"). Instrução sem critério de sucesso não é instrução.
- **Não duplique os context files** — aponte para eles. O onboarding é **mapa**, não cópia; duplicar cria a segunda fonte que envelhece.
- **Anote o que costuma travar.** Cruze com o CHANGELOG e as issues fechadas: onde já houve confusão, escreva a armadilha explicitamente.

## Estrutura do documento

```markdown
# Onboarding — {projeto}
> Gerado a partir do project_context. Última atualização: {DATA} · Modo: {solo|equipe}

## 1. O que é este projeto
Problema, usuário-alvo e estado atual (fase do roadmap) — 5 linhas, do `01` e do roadmap.

## 2. Setup (do zero ao app rodando)
Pré-requisitos com versões · variáveis de ambiente (a partir do `.env.example`, e **de quem pedir os valores**) · banco (subir, migrar, seed sintético) · comandos reais do `package.json` · **critério de sucesso de cada passo**.

## 3. Como o projeto se organiza
Mapa de pastas, módulos de domínio (`03`) e a linguagem ubíqua — os termos do negócio que aparecem no código.

## 4. O que ler, em ordem
- **Antes de tocar em código:** `CLAUDE.md`, `01`, `03`.
- **Antes do primeiro PR:** `05` e `06` (o que bloqueia revisão), `08` (commits, branch, PR).
- **Sob demanda:** `02` (requisitos), `04` (stack), `07` (decisões em aberto), `09` (LGPD), `10` (design), `11` (infra), ADRs.

## 5. Como trabalhar aqui
Fluxo issue → branch → commits → PR → revisão → merge, com as skills que apoiam cada passo. Guard-rails (o que o agente não faz: commit, push, merge). O que **bloqueia** revisão vs. o que é sugestão (`08`).

## 6. Armadilhas conhecidas
O que já custou tempo: pegadinhas de setup, convenções contraintuitivas, decisões que parecem erro e não são (com link para o ADR).

## 7. Primeira tarefa sugerida
Uma issue real de tamanho XS/S da fase atual, com o caminho ponta a ponta.

## 8. [EQUIPE] Quem é quem
Papéis, quem revisa o quê (`CODEOWNERS`), canais e onde ficam os acessos — sem segredos, apenas de quem pedir.
```

## Procedimento

1. Confirme o **modo** (`01`). Em solo, omita a seção 8 e escreva a seção 5 na segunda pessoa ("você").
2. Levante os comandos **reais** do `package.json` — nunca presuma `npm run dev` sem verificar.
3. Detecte lacunas do próprio kit: `[PREENCHER]` remanescente, `.env.example` ausente, script de seed inexistente. **Reporte como lacuna** em vez de inventar o conteúdo faltante.
4. Escolha a primeira tarefa entre issues abertas da fase atual (`gh issue list`), preferindo XS/S que atravessem uma fatia vertical fina.
5. **Apresente o documento para aprovação** antes de gravar.
6. Grave em `.claude/docs/onboarding.md`.

## Ao concluir

1. Entrada em `.claude/log/CHANGELOG.md` (tipo `docs`): "onboarding criado/atualizado".
2. Texto de commit sugerido: `docs: guia de onboarding`.
3. Lembre que o documento **envelhece**: revise ao mudar stack, estrutura de módulos ou fluxo de trabalho — e sempre que alguém entrar e precisar perguntar algo que deveria estar ali (esse é o melhor sinal de lacuna).
