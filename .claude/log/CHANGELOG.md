fix/537-corpo-malformado-sem-500-nem-log-de-senha
- **Tipo:** fix
- **O quê:** JSON malformado ou corpo acima do limite chegava ao `errorHandler` como erro inesperado: respondia 500 e `logger.error({ err })` gravava o `err.body` que o body-parser anexa ao erro, com a senha de um login. Agora todo erro de cliente do body-parser (http-errors com `status` 4xx e `expose: true`: `entity.*`, `charset`/`encoding` não suportado, `parameters.too.many`, `querystring.parse.rangeError`) responde com o próprio status (400, 413, 415, 403 de `verify`) e mensagem genérica, sem virar 500 e sem log; o `createErrorHandler` recebe o logger da aplicação (o erro inesperado sai pelo mesmo destino do log de requisição); `err.body` entrou nos `logRedactPaths` como defesa extra.
- **Arquivos principais:** `backend/src/shared/middlewares/errorHandler.ts`, `backend/src/shared/logger/logger.ts`.
- **Decisões/ADRs:** nenhuma. Ajustes da revisão: status vindo do próprio erro (em vez de fixo em 400), cobertura dos erros do body-parser sem prefixo `entity.` e logger injetável, para o teste de integração enxergar o que o handler loga.
- **Testes:** unitários no `errorHandler.test.ts` (400 e 413 genéricos, sem a senha em `logger.error`/`warn`) e de integração no `app.log-redaction.test.ts` (login com corpo malformado e com corpo de 200 KB: status e senha ausente do stream do logger; redação de `err.body`, que falha se o caminho sair da lista). Suíte completa do backend (2181 testes), `tsc`, `npm run lint` e dependency-cruiser passam.

## [2026-10-12] fix: teste do card "Ao vivo" do login deixa de depender de sorte

- **Branch:** fix/537-corpo-malformado-sem-500-nem-log-de-senha
- **Tipo:** fix
- **O quê:** o `frontend-test` do CI falhou no PR do #537 em `LoginPage.test.tsx` ("anima o card 'Ao vivo' via useLiveTicker"), sem relação com o backend. O passo do `useLiveTicker` é aleatório e o valor sai com duas casas decimais: um passo quase nulo (cerca de 5% dos ticks) deixa o texto igual, e o teste só tem um tick útil dentro dos 3 s (o segundo cai em 3000 ms, junto do timeout). O teste agora fixa `Math.random`, de modo que o primeiro tick sempre muda o valor, e restaura o mock no `finally`.
- **Arquivos principais:** `frontend/src/pages/auth/LoginPage.test.tsx`.
- **Decisões/ADRs:** nenhuma. Fica na mesma branch por ter sido o que travou o CI deste PR; é separável se preferir.
- **Testes:** suíte do frontend completa (1485 testes) passa; o arquivo foi rodado três vezes seguidas.


## [2026-10-12] fix: simulação falha fechado fora do Grupo B Convencional

- **Branch:** fix/542-simulacao-falha-fechado-fora-grupo-b-convencional
- **Tipo:** fix
- **O quê:** `SimulationService` não olhava `tariffGroup`, `groupBModality` nem `contractingEnvironment`: simular uma propriedade do Grupo A, da Tarifa Branca ou do ACL devolvia o custo da fórmula do Grupo B Convencional, um valor plausível e errado. Agora `simulate()` recusa esses modelos com `ValidationError` (422) logo após a checagem de posse, com mensagem dizendo que o cálculo só existe para o Grupo B Convencional. Vale para qualquer alvo (propriedade, área ou dispositivo), porque a tarifa errada contamina os três. `groupBModality` segue lista de permissão (Convencional ou nulo, este tratado como Convencional como no resto do sistema): uma modalidade nova do Grupo B não compila sem uma entrada em `UNSUPPORTED_MODALITY_LABELS`, em vez de cair na fórmula Convencional. A posse é checada antes do modelo tarifário, então quem não é dono continua recebendo 403.
- **Arquivos principais:** `backend/src/modules/simulation/simulation.service.ts`.
- **Decisões/ADRs:** o endpoint segue sem tela no frontend (decisão do usuário); nenhuma ADR nova. O bloco repetido de 10 linhas do cálculo de custo não foi tocado; o `02` não muda (RF22 segue implementado só pela API).
- **Testes:** service (Grupo A, Grupo A no ACL e Tarifa Branca recusados, cada um com a mensagem do seu ramo; ACL num Grupo B gravado direto no banco; alvo AREA recusado; Convencional explícito e `groupBModality` nulo seguem calculando; 403 antes do 422) e rota (Grupo A responde 422), todos escritos antes da correção e falhando (6 falhas). Suíte completa do backend (2191 testes), `tsc`, `npm run lint` e dependency-cruiser passam.

## [2026-10-12] docs: índice único de ADRs (sub-issue do épico de documentação viva)

- **Branch:** epic/511-documentacao-viva
- **Tipo:** docs
- **O quê:** o `.claude/docs/README.md` virou o índice canônico das ADRs, com as 25 (0001–0025), a decisão e o status de cada uma (a 0011 substituída pela 0013 e a 0008 parcialmente substituída pela 0010 constam como tal). A seção "ADRs já tomadas" do `03`, a tabela "Decisões registradas" do `04` e o texto "Resolvidas" do `07` (uma narrativa que duplicava as ADRs e contrariava a regra do próprio arquivo de listar só o que está em aberto) viraram remissão ao índice. O protocolo de ADR do `CLAUDE.md` e o passo de ADR das skills `nova-feature`, `correcao-bugs`, `refatoracao` e `scaffold-projeto` agora mandam acrescentar a linha no índice. Os quatro índices antigos estavam desatualizados (parados na 0013, 0016, 0018 e sem as resolvidas 0016, 0017, 0019–0021, 0023–0024).
- **Arquivos principais:** `.claude/docs/README.md`, `.claude/project_context/03-arquitetura.md`, `.claude/project_context/04-tech-stack.md`, `.claude/project_context/07-decisoes-em-aberto.md`, `CLAUDE.md`, `.claude/skills/*/SKILL.md`.
- **Decisões/ADRs:** nenhuma ADR nova. Fora do escopo: o script de CI que compara `ls .claude/docs/adr/` com o índice (YAGNI; o protocolo nas skills ataca a causa). A ADR retroativa dos caches em processo fica para a sub-issue do `03`.
- **Notas:** primeira de cinco sub-issues do épico; as demais (`03`, `10`, `04`/`06` e comentários) seguem na mesma branch, com um PR no fim.

## [2026-10-12] docs: 03-arquitetura.md descreve a arquitetura de hoje; ADR-0026 dos caches em processo

- **Branch:** epic/511-documentacao-viva
- **Tipo:** docs
- **O quê:** a seção "Específico do projeto" do `03` foi reconferida contra o código e corrigida: 24 módulos (entraram `acl-contract`, `demand`, `demand-alert`, `goal`, `pld-quote`, `report`, `report-schedule` e `session`); os sete schedulers no mesmo processo (`server.ts`), no lugar de "o único caminho assíncrono"; o SMTP com as quatro finalidades, inclusive o relatório enviado a terceiros; os dados pessoais novos e não cifrados (e-mails de destinatários e rótulo de dispositivo/IP mascarado das sessões); `shared/session/` e `shared/config/` no inventário; e os três caches em processo no lugar de "nenhum cache". A ADR-0026 (retroativa) registra esses caches com o requisito medido na Fase 15 (6 → 4 queries por requisição de consumo), o TTL de 5 minutos, o estado em nível de módulo e o custo aceito, e entrou no índice canônico.
- **Arquivos principais:** `.claude/project_context/03-arquitetura.md`, `.claude/docs/adr/0026-caches-em-processo-com-ttl.md`, `.claude/docs/README.md`.
- **Decisões/ADRs:** ADR-0026, aprovada pelo usuário como retroativa curta; nenhum item do `07` a remover. Cada número do laudo foi reconferido no código (24 módulos, sete schedulers, três repositórios com cache) antes de escrever.
- **Notas:** a seção de dados sensíveis tem interseção com o `09` e deve ser revisada junto da próxima `auditoria-conformidade`. Segunda de cinco sub-issues do épico.

## [2026-10-12] docs: 10-design-system.md com o inventário de telas e bundles de hoje

- **Branch:** epic/511-documentacao-viva
- **Tipo:** docs
- **O quê:** a tabela "tela → bundle → código" e as notas que a seguem foram reescritas como estado atual, conferidas contra `frontend/src/pages/`, `AppRouter.tsx`, os `TODO(design)` do código e o bundle `2026-09-06`. A linha única do app logado virou uma por seção (Painel, Análise com grandezas elétricas, Histórico, Relatórios, Alertas, Distribuidoras, Configurações, Perfil/Segurança); o template A4 passou a apontar para os geradores de relatório do backend; a Home anterior consta como histórica. A lista de telas sem handoff passou de uma para quatro, cada uma com o motivo (Sobre o projeto, comparação ACR × ACL, comparação Convencional × Branca e os campos de endereço por grandeza do `MeterForm`), e o parágrafo "a v2 ainda não tem implementação" foi trocado por "a maior parte foi entregue nas Fases 23–28".
- **Arquivos principais:** `.claude/project_context/10-design-system.md`.
- **Decisões/ADRs:** nenhuma. Nenhuma tela foi alterada.
- **Notas:** a seção "Sobre o projeto" da v2 existe, mas é um espaço vazio (`min-height:52vh`), então a `AboutPage` continua sem layout a seguir; o comentário dela ainda cita o bundle `2026-07-31` e é corrigido na sub-issue dos comentários. A `ConfirmEmailChangePage` reaproveita o layout de autenticação sem handoff próprio e não tem marcador `TODO(design)`; está registrada na tabela, sem marcador novo. Terceira de cinco sub-issues do épico.

## [2026-10-12] docs: 04-tech-stack.md e 06-code-quality-standards.md alinhados ao código

- **Branch:** epic/511-documentacao-viva
- **Tipo:** docs
- **O quê:** `04`: os jobs de CI passam a ser nomeados por grupo em vez de contados (o `ci.yml` tem 15, com o `root-format` que faltava; o número saiu para não envelhecer), o Modbus aparece já dividido (um arquivo por adaptador, oito adaptadores para sete protocolos), entraram `react-markdown` + `remark-gfm` (Sobre e documentos legais) e o React Compiler, o nodemailer e o pdfkit passam a cobrir também troca de e-mail, relatório agendado e relatórios em PDF (o CSV é próprio), e as versões de TypeScript (5.9 no backend e no simulador-servidor, 6.0 no frontend e na UI do simulador). `06`: o escopo real do JSDoc enforçado, por pacote (e o que fica sem trava), e a lista real de termos do `no-warning-comments`, que é a mesma nos quatro pacotes e não inclui "auditoria" sozinha.
- **Arquivos principais:** `.claude/project_context/04-tech-stack.md`, `.claude/project_context/06-code-quality-standards.md`.
- **Decisões/ADRs:** nenhuma. Cada afirmação foi conferida em `ci.yml`, `package.json` e `eslint.config.js` de cada pacote.
- **Notas:** a ampliação da trava de JSDoc é de outra fase; o `06` volta a ser atualizado quando ela mudar. Quarta de cinco sub-issues do épico.
