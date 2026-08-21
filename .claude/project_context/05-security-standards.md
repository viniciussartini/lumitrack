# 05 — Padrões de Segurança (OWASP Top 10:2025)

> Fonte única de **segurança técnica**, referenciada por todas as skills. Cada controle deve ser **verificável** (teste ou regra automatizada). Use bibliotecas maduras — não reinvente auth, cripto, nada.
>
> **Conformidade legal (LGPD, transferência internacional, direitos do titular, incidentes) vive em `09-conformidade-legal.md`.** **Banco de dados, CI/CD, deploy e ciclo de vida de segredos vivem em `11-seguranca-infraestrutura.md`.** Este arquivo cobre os controles da **aplicação** e a interseção *segurança × proteção de dados* (PII em log, criptografia).
>
> **Profundidade: OWASP ASVS 5.0, alvo L2** (L3 em auth, authz, pagamento e dado sensível). O Top 10 abaixo é o ranking de risco; o ASVS é a checklist verificável — ver `11`.
>
> **Este arquivo é universal — vale para qualquer linguagem, framework ou ferramenta.** As particularidades (como cada tecnologia expõe ou mitiga cada risco) vivem em `12-seguranca-por-tecnologia.md`, consultado sob demanda conforme o `04`. Princípio aqui, gatilho lá: o risco é o mesmo em toda parte; o que muda é o nome do mecanismo que o dispara. Para este projeto, as seções pertinentes são React, Express, REST, WebSocket/SSE, JWT, MFA/TOTP, hash de senha, Prisma, PostgreSQL, containers e e-mail transacional.

## OWASP Top 10:2025

- **A01 — Broken Access Control:** authz server-side em toda rota; *deny by default*; checagem de ownership (previne IDOR); proteção SSRF (allowlist) em requisições saída-servidor.
- **A02 — Security Misconfiguration:** helmet, CORS restrito, sem stack trace ao usuário, sem credenciais default, config separada por ambiente. Redirect HTTP→HTTPS sempre para host canônico fixo, nunca o header `Host` do cliente (Host forjado é open redirect); CSP no SPA além da CSP deny-all da API.
- **A03 — Software Supply Chain:** lockfile fixo, `npm audit` no CI, Dependabot ativo (config entregue em `.github/dependabot.yml`), **secret scanning bloqueante** (gitleaks — allowlist específica e comentada por achado, nunca regra desligada nem allowlist genérica), atenção a typosquatting.
- **A04 — Cryptographic Failures:** TLS em prod; senha com **argon2/bcrypt**; segredos via env/secret manager (nunca no código); criptografia em repouso para PII sensível.
- **A05 — Injection:** 100% das queries parametrizadas (Prisma); validação por schema (Zod) na borda; escape de output por contexto.
- **A06 — Insecure Design:** rate limiting **global** + reforçado em login/reset/OTP; modelagem de abuso além do happy path; decisões em ADR.
- **A07 — Authentication Failures:** auth via lib consolidada; sessão/token seguros; cookies `HttpOnly` + `Secure` + `SameSite` + prefixo `__Host-`; **rotação de refresh token com detecção de reuso** (reuso ⇒ revogar a família inteira); **timeout absoluto** além do idle; invalidação no logout; MFA em ações sensíveis.
- **A08 — Software/Data Integrity:** validar payloads contra schema antes de processar; sem desserialização de dado não confiável.
- **A09 — Logging & Alerting:** logar eventos de auth; **nunca** logar dado sensível (senha, token, CPF); estrutura pronta para alertas.
- **A10 — Mishandling of Exceptional Conditions:** error handler central que **falha fechado**, mensagem genérica ao usuário, detalhe só no log interno.

## Hardening de runtime (backend, independente de framework)

- **Rate limiting global** por IP/identidade, além do reforço em rotas de autenticação; resposta `429` sem revelar a política.
- **Limite de tamanho de body** e de campos em multipart; **timeouts** em toda chamada de saída e em query de banco.
- **Paginação obrigatória com teto** em listagens (default + máximo).
- **Upload de arquivo:** tipo validado por *magic bytes* (nunca por extensão ou `Content-Type`), teto de tamanho, nome sanitizado e gerado pelo servidor, storage sem permissão de execução, servido por domínio/rota que não executa código.
- **ReDoS:** sem regex de origem do usuário; cuidado com backtracking catastrófico em validações complexas.
- **Prototype pollution:** merge profundo de objeto vindo do cliente é proibido; bloquear `__proto__`/`constructor` na desserialização.
- **Idempotência** em operações não repetíveis (pagamento, criação de pedido) via chave de idempotência.
- **Cabeçalhos além do helmet default:** HSTS com `includeSubDomains`; CSP com nonce (sem `unsafe-inline`); `frame-ancestors` contra clickjacking; `Referrer-Policy` e `Permissions-Policy`.

## Segurança de cliente (universal — web, SPA, SSR, mobile)

- **Armazenamento de credencial** — **decidido na ADR-0002**: cookie `HttpOnly` no canal WEB (mitiga XSS) e Bearer no canal MOBILE. Não é decisão em aberto; qualquer proposta de guardar token em `localStorage` contraria a ADR e exige revisá-la primeiro. Consistente com os cookies de A07. Storage persistente legível por script (`localStorage`, `sessionStorage`, `AsyncStorage`) **não é lugar de token de longa duração** — qualquer XSS o lê. Em mobile, use o cofre do sistema (Keychain/Keystore).
- **Injeção de HTML/marcação:** todo framework tem uma API de escape *bypass* — usá-la com conteúdo de origem externa é XSS. No React, `dangerouslySetInnerHTML`: evitar, sanitizar com biblioteca dedicada quando inevitável. Nomes por tecnologia no `12`.
- **Segredo nunca alcança o artefato do cliente.** Todo build tool expõe variáveis por convenção de prefixo, e o prefixo é o **mecanismo do vazamento**, não uma proteção — no Vite, `VITE_` é substituído literalmente no bundle. Chave de API de terceiro que exige sigilo vai para o backend, sempre — se foi publicada, trate como vazada (procedimento no `11`).
- **Source maps não vão para produção** (ou vão só para a ferramenta de erro, com upload privado).
- **Open redirect:** parâmetros de retorno (`?next=`, `?redirect=`) validados contra allowlist de caminhos internos; nunca refletir URL absoluta recebida do cliente.
- **Comunicação entre janelas/frames:** validar sempre a origem da mensagem; nunca enviar dado sensível com destino curinga.
- **Código de terceiro no cliente é leitor do DOM autenticado.** Minimize; use **SRI** para script externo; nada de tag de analytics com acesso a formulário de credencial ou a dado sensível.
- **Nada de PII em storage do cliente** (cruza com `09`).
- **Autorização não existe no cliente.** Esconder botão é UX; a decisão vale no servidor. Toda rota/ação renderizada condicionalmente tem checagem equivalente no backend.
- **Deep link / URL scheme (mobile e web):** parâmetro de deep link é entrada não confiável — valide como qualquer input, nunca use para autenticar.
- **CSP** configurada; variáveis de ambiente do front sem segredos (só o que pode ser público).

## Proteção de PII em observabilidade (segurança × LGPD)

- **Redaction no logger:** lista de campos sensíveis (senha, token, `authorization`, cookie de sessão, CPF, e-mail conforme o caso) removidos na origem, não no destino. No **pino**, `redact` — é o que existe hoje, e a única saída de log do projeto.
- **Scrubbing antes do envio:** toda ferramenta de rastreamento de erro precisa de um hook que remova PII (corpo de requisição, headers, identificação do usuário, query string) **antes** de sair da aplicação. No Sentry, `beforeSend`. **APM / agregador de log ainda não adotado neste projeto (ver `07`)** — se e quando entrar, o hook é pré-requisito, não refinamento.
- **Trava de região (ADR-0008):** a escolha da ferramenta é restrita antes de ser técnica. Um APM ou agregador de log estrangeiro **reintroduz a transferência internacional** que a decisão de hospedagem eliminou, e traz de volta SCC + DPA. A opção precisa ser região Brasil/UE ou auto-hospedada.
- **Log estruturado, não interpolado:** string concatenada impede redaction automática e facilita *log injection* (quebra de linha forjada pelo usuário poluindo a trilha).
- **A trilha de auditoria é o oposto do log de aplicação:** ela precisa registrar quem fez o quê, com retenção definida e acesso restrito — não misture as duas.
- A obrigação legal por trás disso está em `09-conformidade-legal.md` (A09 + minimização).

## Definition of Done — Segurança

- Negar por padrão. Validar no servidor. **Falhar fechado.**
- Nenhuma concatenação de input em query/comando.
- Nenhum segredo no código-fonte.
- Todo controle crítico (A01, A04, A05, A07, A10) tem teste/regra que **falha se o controle for removido**.
- PII fora dos logs e criptografada em repouso.
- Nenhum segredo alcança o bundle do frontend.
- Controles de infraestrutura (banco, pipeline, deploy, segredos) verificados conforme o **DoD do `11`**.
- **Particularidades do stack em uso** conferidas no `12-seguranca-por-tecnologia.md` (as seções correspondentes ao `04`).
