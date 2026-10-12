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

