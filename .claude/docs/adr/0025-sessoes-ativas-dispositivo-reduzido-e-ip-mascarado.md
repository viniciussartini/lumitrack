# ADR-0025 — Sessões ativas: dispositivo reduzido e IP mascarado, ligados por `sessionId`

- **Data:** 2026-10-08
- **Status:** aceita
- **Branch/Issue relacionada:** issue #500 (Fase 30 do roadmap)

## Contexto

O bloco "Sessões ativas" da página Segurança (RF44, FNC012) precisa mostrar dispositivo, origem e último acesso de cada sessão. Hoje `AuthToken` (JWT de acesso, web e mobile) e `RefreshToken` (web) guardam só canal, validade e datas, e não há elo entre o JWT de acesso e o refresh token: cada refresh cria um `AuthToken` novo sem revogar o anterior e o refresh rotaciona por `replacedByTokenId`. Sem um identificador estável de sessão não existe "sessão atual" a partir do JWT, e a #501 não teria como revogar uma sessão inteira (refresh, cadeia de rotação e JWTs de até 1 h).

IP e user-agent são dado pessoal (`09`). `audit_logs` já guarda os dois completos nos eventos de login por 730 dias, mas sem chave para o token.

## Decisão

1. **Captura mínima.** O login, o login de demonstração, o segundo passo do MFA e o refresh gravam, no token emitido, apenas um `deviceLabel` reduzido a navegador e sistema (`Chrome · Windows`; sem user-agent reconhecível, `Navegador` ou `App móvel` conforme o canal) e uma `origin` com o IP mascarado (`189.45.xx.xx`; IPv6 só pelo prefixo, `2804:14c:xx`). O user-agent e o IP brutos **não são gravados** por esta funcionalidade. Cidade e UF do desenho não são captadas: exigiriam geolocalização por IP, uma base externa.
2. **Elo por `sessionId`.** `AuthToken` e `RefreshToken` ganham a coluna `sessionId` (uuid), gerada no login e herdada na rotação, na janela de graça e a cada novo `AuthToken` da sessão. Linhas existentes recebem um id próprio na migração e aparecem sem origem ("Origem não registrada"), nunca com dado inventado. O default do id fica no banco (`gen_random_uuid()`), para a versão anterior da aplicação continuar inserindo tokens durante o deploy e num rollback só da aplicação; a versão nova sempre o informa. Não há tabela `Session`. O encerramento revoga por `sessionId` o refresh token e os JWTs de acesso da sessão, e um refresh token revogado sem substituto (logout, sessão encerrada, reset de senha) só é recusado: reuso de token rotacionado continua sendo tratado como roubo, mas o aparelho encerrado por outra sessão não derruba as demais.
3. **O que é "sessão".** Web: o refresh token vigente (não revogado e não expirado) de cada `sessionId`. Mobile: o `AuthToken` MOBILE vigente. "Último acesso" é a emissão desse token (web: último refresh, em geral há menos de 1 h; mobile: o login), sem escrita por requisição.
4. **Base legal e retenção.** Segurança da conta e prevenção a fraude (LGPD Art. 7º IX e Art. 6º VII), registrada no ROPA; a formalização jurídica segue deferida pela ADR-0014. A retenção acompanha o token: o expurgo existente remove `auth_tokens` e `refresh_tokens` 30 dias depois de expirados ou revogados. Na rotação do refresh token, o token substituído é limpo de dispositivo e origem no mesmo passo: só o token vigente os guarda, e os anteriores não formam uma trilha de IPs além da vida da sessão. Os campos entram na exportação do titular, uma entrada por sessão (início no primeiro token, dispositivo e origem do mais recente, encerrada só quando nenhum token segue vigente e o último foi revogado).
5. **Conta de demonstração.** A conta é compartilhada entre visitantes, então a lista real expõe sessões de terceiros; o endpoint devolve uma lista fixa e representativa, sem consultar o banco.

## Alternativas consideradas

- **Só canal e data** — sem dado pessoal novo, mas a lista só diria "Web" ou "Mobile" e a data, o que não cumpre "dispositivo, origem" do RF44.
- **User-agent bruto e IP completo** — mais detalhe, mas contra a minimização e sem ganho para a pessoa reconhecer a própria sessão.
- **Tabela `Session` própria** — mais limpa para um `lastUsedAt` futuro, mas é tabela, expurgo, clean de testes e ROPA a mais, sem necessidade hoje (YAGNI).
- **Identificar a atual pelo cookie de refresh** — o cookie só chega a rotas sob `/api/auth`, não liga os JWTs à sessão e empurraria o problema para a #501.
- **`lastUsedAt` por requisição** — uma escrita por chamada autenticada; o "último acesso" aproximado pela emissão do token basta para o RF44.

## Consequências

- Positivas: cumpre o RF44 com a menor exposição de dado pessoal; a sessão atual é identificada sem depender de cookie; a #501 revoga por `sessionId`, inclusive os JWTs de acesso; sem tabela nem expurgo novos.
- Negativas/custos: duas colunas de texto e um uuid a mais em duas tabelas; o último acesso da sessão web tem a granularidade do refresh; `trust proxy` só existe em produção, então em staging a origem pode ser a do proxy; o rótulo vem de um parser próprio de navegador e sistema, que erra em user-agents raros (cai no rótulo genérico).
- Não havia item correspondente em `07-decisoes-em-aberto.md`; a decisão entra na lista de Resolvidas.
