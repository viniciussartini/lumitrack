# 12 — Segurança por Tecnologia (catálogo)

> **Apêndice do `05` (aplicação) e do `11` (infraestrutura).** Aqueles definem o princípio universal; este lista **como cada tecnologia dispara, expõe ou mitiga** aquele risco.
>
> **Leia apenas as seções do stack em uso** (`04-tech-stack.md`). Este arquivo é consulta sob demanda — não carregue-o inteiro.
>
> **Por que existe:** o risco é universal, o gatilho é local. Quase todo incidente evitável acontece porque a pessoa conhecia o princípio ("não deixe segredo chegar ao cliente") mas não conhecia o mecanismo local que o violava (`VITE_`, `NEXT_PUBLIC_`, `@Value` num bean exposto). Um item só entra aqui se for **específico da tecnologia**; se vale para todas, o lugar é o `05`.

**Índice** — Frontend: [React](#react) · [Angular](#angular) · [Vue](#vue) · [Next.js](#nextjs) — Mobile: [React Native](#react-native) — Backend: [Express](#express) · [NestJS](#nestjs) · [Spring Boot](#spring-boot) · [ASP.NET Core](#aspnet-core) — API: [REST](#rest) · [GraphQL](#graphql) · [WebSocket/SSE](#websocket--sse) — Auth: [JWT](#jwt-jwsjwe) · [Sessão](#sessão-server-side-cookie-de-sessão) · [Chaves de API](#chaves-de-api-máquina-a-máquina) · [MFA/TOTP](#mfa--totp) · [Hash de senha](#hash-de-senha) · [Webhooks](#webhooks-entrada-e-saída) · [OAuth2/OIDC](#oauth2--oidc) — ORM: [Prisma](#prisma) · [TypeORM](#typeorm) · [JPA/Hibernate](#jpa--hibernate) · [Spring Data JPA](#spring-data-jpa) · [EF Core](#entity-framework-core) — Dados: [PostgreSQL](#postgresql) · [SQL Server](#sql-server) · [MongoDB](#mongodb) · [Redis](#redis) — Infra: [nginx](#nginx) · [Containers](#containers--docker) · [Object storage](#object-storage) · [E-mail](#e-mail-transacional) · [Serverless/Edge](#serverless--edge-functions-vercel-lambda-workers) · [Analytics/Monitoramento](#sdks-de-analytics-e-monitoramento-sentry-posthog-e-similares) · [Pagamentos](#pagamentos-stripe-e-similares) · [Filas](#filas-e-mensageria-bullmqredis-rabbitmq-kafka-sqs) · [CDN/WAF](#cdn-e-waf-cloudflare-e-similares) · [APIs de LLM](#apis-de-llm-quando-o-produto-integra-ia)

---

# Frontend

## React

- **Bypass de escape:** `dangerouslySetInnerHTML` é a única via de XSS por marcação no React — o JSX escapa por padrão. Se inevitável, sanitize com DOMPurify **no momento da renderização**, não no armazenamento (sanitizar na escrita perde contexto e não protege dados já gravados).
- **XSS por URL:** `href={userInput}` aceita `javascript:` e `data:` — o React **não** bloqueia isso. Valide o esquema (`https:` / `mailto:`) antes de renderizar link ou `src` de origem externa.
- **`ref` + DOM manual:** manipulação direta via `ref` (`innerHTML`, `insertAdjacentHTML`) escapa das proteções do React inteiramente.
- **Vite:** toda variável com prefixo `VITE_` é **substituída literalmente no bundle** em build time. Não é "exposta ao cliente" — está *dentro do arquivo público*. Grep no `dist/` é o teste definitivo.
- **CRA/Webpack:** mesmo mecanismo com `REACT_APP_`.
- **Estado no cliente não é fronteira:** dados carregados no store (Redux/Zustand/TanStack Query) estão no navegador; filtrar no `select` não impede que o payload completo tenha trafegado. Filtre no servidor.
- **Dependências transitivas:** o ecossistema React tem cadeia profunda — `npm audit` e Dependabot não são opcionais aqui (A03).

## Angular

- **Sanitização automática por contexto** é o default (DomSanitizer) — a exceção perigosa é `bypassSecurityTrustHtml` / `bypassSecurityTrustUrl` / `bypassSecurityTrustResourceUrl`. Cada chamada dessas é uma decisão de segurança e merece comentário funcional justificando (`06`).
- **`[innerHTML]`** passa pelo sanitizador, mas remove apenas o que reconhece; conteúdo de terceiro ainda deve ser sanitizado na origem.
- **Template compilado em runtime (JIT com template dinâmico)** é execução de código — nunca monte template a partir de entrada do usuário. Use AOT em produção.
- **`HttpClient` + XSRF:** o suporte embutido lê o cookie `XSRF-TOKEN` e envia `X-XSRF-TOKEN`, **mas só para requisições de mesma origem e apenas se o backend emitir o cookie**. API em outro domínio não recebe a proteção automaticamente.
- **Variáveis de ambiente:** `environment.ts` é **compilado no bundle** — é arquivo-fonte público, não configuração de servidor. Segredo ali é segredo publicado.
- **Interceptor de erro** que loga a resposta inteira vaza token e PII no console do usuário e nas ferramentas de rastreamento.

## Vue

- **`v-html`** é o bypass de escape (equivalente ao `dangerouslySetInnerHTML`); as interpolações `{{ }}` escapam por padrão.
- **Binding dinâmico de atributo** (`:href`, `:src`) aceita `javascript:` — valide o esquema.
- **`v-bind` com objeto espalhado** (`v-bind="userObject"`) permite injetar atributos arbitrários, incluindo handlers de evento (`onerror`). Nunca espalhe objeto de origem externa.
- **Compilação de template em runtime:** o build *full* do Vue permite compilar template em runtime — se algum template vier de dado dinâmico, é execução de código remota. Prefira o build *runtime-only*.
- **Vite (padrão no Vue 3):** mesma regra do prefixo `VITE_`.
- **SSR (Nuxt):** cuidado com estado serializado no HTML (`window.__NUXT__`) — tudo que o servidor coloca no store vai para a página, inclusive o que só o backend deveria ver.

## Next.js

- **A fronteira servidor/cliente é a superfície principal.** Um módulo com segredo importado por Client Component vaza para o bundle. Use `import 'server-only'` nos módulos sensíveis — ele quebra o build em vez de vazar silenciosamente.
- **`NEXT_PUBLIC_`** é o prefixo que embute a variável no bundle. Sem o prefixo, a variável **só** existe no servidor.
- **Server Actions são endpoints HTTP públicos.** Ser uma função no código não as protege: precisam de autenticação, autorização e validação de entrada como qualquer rota. É a falha mais comum em App Router.
- **Route Handlers e middleware:** o middleware roda no edge e **não deve ser a única camada de autorização** — é fácil contorná-lo com requisição direta a rota não coberta pelo matcher. Autorize também no handler.
- **Cache é superfície de vazamento:** resposta autenticada cacheada por engano (`fetch` com `cache: 'force-cache'`, rota estática indevida) pode ser servida a outro usuário. Marque rotas com dado de usuário como dinâmicas e revise `revalidate`.
- **Redirecionamento aberto** em `redirect()` com destino vindo de query string.
- **Imagens remotas:** `next/config` com `remotePatterns` muito permissivo transforma o otimizador em proxy aberto (SSRF/abuso de banda).

---

# Mobile

## React Native

- **O bundle JS é extraível do APK/IPA.** Não existe segredo no app: chave de API embutida é chave pública. Se precisa de sigilo, a chamada é do backend.
- **Armazenamento:** `AsyncStorage` é **texto plano** no sistema de arquivos do app. Token e credencial vão para Keychain (iOS) / Keystore (Android) via biblioteca dedicada.
- **`WebView` é a maior superfície:** desative JavaScript se não for necessário; nunca carregue URL de origem externa sem allowlist; `injectedJavaScript` com dado dinâmico é injeção direta; cuidado com `onMessage` sem validar origem.
- **Deep links / universal links:** parâmetro de deep link é entrada não confiável e pode vir de qualquer app instalado. Nunca autentique por deep link sem validação server-side.
- **TLS:** *certificate pinning* para APIs sensíveis; nunca desative validação de certificado em build de produção (comum sobrar de debug).
- **Detecção de root/jailbreak** é sinal, não controle — não confie nela para decisão de segurança.
- **Logs:** `console.log` em release grava no logcat/console do dispositivo, legível por outras ferramentas.
- **Backup do sistema operacional** pode incluir o storage do app — marque dados sensíveis como excluídos do backup.
- **Atualização OTA (CodePush/EAS Update):** canal de distribuição de código; comprometê-lo é comprometer o app. Trate as credenciais desse canal como as de deploy (`11`).

---

# Backend

## Express

- **Nada vem por padrão.** Sem `helmet`, sem rate limit, sem limite de body, sem timeout. O framework é minimalista: a ausência de configuração **é** a configuração insegura.
- **`express.json({ limit })`** — o default (100kb) existe, mas `urlencoded({ extended: true })` sem limite e parsers de terceiros frequentemente não têm.
- **Ordem de middleware é ordem de execução:** middleware de autenticação registrado depois da rota não protege nada. Rota registrada antes do handler de erro não passa por ele.
- **Handler de erro precisa dos 4 parâmetros** (`err, req, res, next`) — com 3, o Express o trata como middleware comum e o erro vaza com stack trace.
- **Erro assíncrono não capturado** em versões anteriores à 5 derruba o processo ou vaza para o cliente; use wrapper ou `express-async-errors`.
- **`trust proxy`:** sem configurar atrás de proxy/CDN, `req.ip` retorna o IP do proxy — rate limit por IP passa a limitar o mundo inteiro como um só. Configurado permissivamente demais, o cliente forja `X-Forwarded-For` e escapa do rate limit.
- **CORS:** `origin: true` reflete **qualquer** origem; com `credentials: true` isso equivale a desligar a same-origin policy para a API.
- **Path traversal:** `res.sendFile` / `express.static` com caminho derivado de parâmetro — normalize e confine à raiz.
- **`req.query` pode ser objeto ou array** (`?a=1&a=2`) — validação que assume string quebra ou é contornada. Schema na borda resolve.

## NestJS

- **`ValidationPipe` global com `whitelist: true` e `forbidNonWhitelisted: true`** — sem `whitelist`, propriedades não declaradas no DTO passam adiante e chegam ao ORM: é mass assignment por omissão.
- **`transform: true`** é necessário para o DTO virar instância de classe; sem isso os decoradores de validação podem não rodar como esperado.
- **Guards são a camada de authz** — mas guard global não cobre o que estiver fora do ciclo HTTP, e `@Public()` mal aplicado abre rota silenciosamente. Prefira **deny by default**: guard global + decorator explícito para exceções.
- **Injeção de dependência com escopo REQUEST** mal usada pode vazar contexto de um usuário para outro em provider singleton — nunca guarde estado de requisição em singleton.
- **Interceptor de serialização:** use `ClassSerializerInterceptor` com `@Exclude()` em campos sensíveis (hash de senha, token) — caso contrário a entidade inteira vira JSON.
- **Microservices/`@MessagePattern`:** transportes (TCP, Redis, RMQ) **não têm autenticação por padrão** — a superfície interna costuma ficar totalmente aberta.
- **Exception filter** padrão pode expor detalhes internos em erros não tratados; padronize resposta genérica.

## Spring Boot

- **Actuator** é a exposição clássica: `/actuator/env`, `/heapdump`, `/threaddump` entregam configuração, segredos e memória. Exponha apenas `health` e `info`, atrás de autenticação, em porta separada.
- **Ordem de `SecurityFilterChain` e `authorizeHttpRequests`:** a primeira regra que casa vence — regra permissiva ampla antes da restritiva anula a segunda. Termine sempre com `anyRequest().authenticated()`.
- **CSRF:** o Spring Security habilita por padrão; desabilitar (`csrf.disable()`) é correto para API stateless com token no header, mas **errado** se a autenticação for por cookie de sessão. A linha `csrf.disable()` copiada de tutorial é uma das falhas mais frequentes.
- **`@PreAuthorize` só funciona com method security habilitada** (`@EnableMethodSecurity`) e é ignorada em chamadas internas da mesma classe (autoinvocação passa por cima do proxy).
- **Desserialização:** Jackson com tipagem polimórfica habilitada (`enableDefaultTyping` / `@JsonTypeInfo` amplo) é RCE conhecida. Nunca desserialize tipo arbitrário de fonte não confiável.
- **SpEL com entrada do usuário** (em `@Value`, `@PreAuthorize` dinâmico, Thymeleaf) é execução de expressão — injeção direta.
- **Property source:** segredo em `application.yml` versionado; prefira variável de ambiente ou vault. `spring.profiles.active` errado em produção pode carregar config de dev.
- **Thymeleaf/JSP:** expressão dinâmica montada com entrada do usuário permite SSTI.
- **`server.error.include-stacktrace`** deve ser `never` em produção.

## ASP.NET Core

- **Ordem do pipeline de middleware é crítica:** `UseAuthentication` antes de `UseAuthorization`, ambos antes de `MapControllers`; `UseCors` na posição correta. Fora de ordem, o pipeline compila e roda — sem proteger.
- **Autorização por omissão:** sem `RequireAuthenticatedUser` como política de fallback, endpoint sem `[Authorize]` é público. Prefira fallback authenticated + `[AllowAnonymous]` explícito.
- **Over-posting/mass assignment:** *model binding* preenche a entidade inteira a partir do corpo; use DTO e `[Bind]`/projeção — nunca vincule direto a entidade do EF.
- **Antiforgery:** validação de token para cookie de autenticação; em SPA com Bearer não se aplica, mas cookie + `SameSite` mal configurado reabre a superfície.
- **Data Protection:** em ambiente com múltiplas instâncias/contêiner, sem persistir as chaves em storage compartilhado, cookies e tokens são invalidados a cada reinício (indisponibilidade) — e chave persistida sem proteção é comprometimento.
- **`DeveloperExceptionPage`** nunca em produção; `UseExceptionHandler` com resposta genérica.
- **Kestrel:** limites de tamanho de corpo e taxa mínima de dados configurados (defesa contra *slowloris*).
- **Secret Manager é só para desenvolvimento** — não é cofre de produção.

---

# Estilo de API

## REST

- **Autorização por objeto, não só por rota.** `GET /pedidos/{id}` autenticado mas sem checar dono é IDOR — o caso mais comum de A01. Use identificador não sequencial quando a enumeração for problema (mas ID opaco **não substitui** a checagem).
- **Verbo e efeito coerentes:** `GET` com efeito colateral pode ser disparado por prefetch, cache e crawler.
- **Métodos não usados desabilitados** (`TRACE`, `OPTIONS` amplo); erro `405` não deve revelar rotas internas.
- **Enumeração por resposta:** `404` vs `403` diferentes revelam existência de recurso; padronize quando isso for sensível.
- **Versionamento** para não quebrar cliente antigo ao endurecer validação.
- **Mensagem de erro não expõe estrutura interna** (nome de tabela, caminho de arquivo, biblioteca e versão).

## GraphQL

Superfície própria e severa — quase nada disso existe em REST:

- **Introspection desabilitada em produção.** Ela publica o schema inteiro, incluindo mutations e campos que você julgava obscuros. Desabilite junto com o GraphiQL/Playground.
- **Limite de profundidade e de complexidade obrigatórios.** Uma query recursiva (`user { posts { author { posts { ... } } } }`) é DoS trivial de escrever e caro de responder. Sem limite de custo, um único request derruba o serviço.
- **Limite de *aliases* e de batching.** Centenas de aliases num único request contornam rate limit por requisição — é o vetor clássico de brute force de senha/OTP em GraphQL. Rate limit deve contar **operações**, não requisições HTTP.
- **Autorização por campo, não por resolver de topo.** Autorizar só na query raiz deixa campos aninhados acessíveis por outro caminho do grafo. A regra de authz precisa estar onde o dado é resolvido.
- **N+1 e amplificação:** DataLoader é performance *e* segurança — sem ele, uma query barata para o cliente é cara para o servidor (amplificação assimétrica).
- **Mensagens de erro** com stack trace e caminho do resolver vazam estrutura interna; padronize e mascare em produção.
- **Upload e query via GET:** query em `GET` pode ser cacheada por intermediários; `POST` para tudo que retorna dado sensível.
- **Persisted queries** (allowlist de operações) é o controle mais forte quando o cliente é conhecido — elimina a maior parte dos vetores acima de uma vez.

## WebSocket / SSE

- **CORS não protege WebSocket.** A same-origin policy não se aplica ao handshake: **valide `Origin` explicitamente** no servidor, senão qualquer site pode abrir conexão autenticada com o cookie da vítima (*Cross-Site WebSocket Hijacking*).
- **Autentique no handshake** e revalide autorização **por mensagem** — conexão longa sobrevive a logout, expiração de token e revogação de permissão. Defina TTL e reautenticação.
- **Autorização por canal/tópico:** assinar um tópico é acesso a dado; checar só na conexão permite escutar canais alheios.
- **Rate limit e tamanho de mensagem** por conexão, e teto de conexões por identidade — sem isso, exaustão de recurso é trivial.
- **Entrada continua sendo entrada:** valide payload de mensagem com o mesmo schema do HTTP.
- **SSE:** roda sobre HTTP e herda cookies — mesma exposição a CSRF; e conexões abertas consomem *sockets*: limite por usuário.

---

# Autenticação e credenciais

> Universal (no `05`): senha com hash forte, MFA em ação sensível, cookie `HttpOnly`+`Secure`+`SameSite`, rotação de refresh com detecção de reuso. Aqui ficam as armadilhas **de cada tecnologia de credencial**.

## JWT (JWS/JWE)

- **JWT é assinado, não criptografado.** O payload é Base64 — legível por qualquer um que tenha o token. **Nunca** coloque PII, dado de negócio sensível ou segredo nas claims. Se precisa de sigilo do conteúdo, é JWE, não JWS.
- **Confusão de algoritmo** — a família de falhas mais explorada:
  - `alg: none` aceito por biblioteca permissiva ⇒ token forjado sem assinatura.
  - **RS256 → HS256:** o atacante assina com a *chave pública* (que é pública) e a biblioteca valida como HMAC usando aquela mesma chave como segredo.
  - **Mitigação:** declare o algoritmo esperado na verificação (allowlist), nunca derive do header do próprio token.
- **`kid` é entrada não confiável:** já foi usado para *path traversal* (apontar para arquivo arbitrário como chave) e para injeção de SQL na busca da chave. Valide contra allowlist de identificadores conhecidos.
- **`jku`/`x5u`** (URL de conjunto de chaves no header) — se sua biblioteca honra esses campos, o atacante indica a própria chave. Desabilite ou restrinja a host confiável.
- **Segredo HS256 fraco é quebrável offline** — o token carrega tudo que o atacante precisa para atacar por dicionário. Mínimo 256 bits aleatórios; jamais string de configuração adivinhável.
- **Validação completa, sempre:** assinatura, `exp`, `nbf`, `iss`, `aud`. Faltar `aud` permite reusar token de um serviço em outro. Tolerância de relógio pequena e explícita.
- **JWT não é revogável por natureza.** Logout, banimento e mudança de papel **não** invalidam um token válido. Consequências práticas: access token curto (minutos), refresh token rotativo e server-side, e uma lista de revogação (ou versão de credencial na claim, comparada com o banco) para os casos que exigem corte imediato.
- **Não use JWT como sessão de navegador só para "ser stateless"** — se você precisa de revogação, já não é stateless: sessão server-side costuma ser mais simples e mais segura.
- **Rotação de chave** via `kid` com período de sobreposição; chave comprometida exige invalidar tudo que ela assinou.
- **Bibliotecas:** prefira as que exigem algoritmo explícito na API. Nunca `decode()` onde deveria ser `verify()` — é o erro de uma palavra que anula toda a autenticação.

## Sessão server-side (cookie de sessão)

- **Regenere o identificador de sessão** no login e em qualquer elevação de privilégio — sem isso há *session fixation* (o atacante planta o ID antes do login e o herda autenticado).
- **Invalidação real no servidor** em logout, troca de senha e revogação — a vantagem sobre JWT só existe se for exercida.
- **Timeout ocioso + absoluto**; sessão eterna é credencial permanente.
- **Store de sessão** (Redis/banco) com TTL e escopo — ver seção Redis.
- **Cookie:** `HttpOnly`, `Secure`, `SameSite=Lax|Strict`, prefixo `__Host-`, e sem escopo de domínio mais amplo que o necessário (subdomínio comprometido lê o cookie do pai).

## Chaves de API (máquina a máquina)

- **Armazene apenas o hash** da chave, como senha — vazamento de banco não deve entregar chaves utilizáveis.
- **Prefixo identificável** (`sk_live_…`) para permitir detecção automática por secret scanning e revogação rápida.
- **Escopo e expiração** por chave; uma chave por integração e por ambiente, nunca compartilhada.
- **Rotação sem downtime:** suporte a duas chaves válidas simultaneamente durante a troca.
- **Comparação em tempo constante** na verificação; rate limit por chave.

## MFA / TOTP

- **Segredo TOTP é credencial:** criptografado em repouso, nunca logado, nunca retornado após o cadastro inicial.
- **Janela de tolerância pequena** (±1 passo) e **rejeição de reuso** do mesmo código dentro da janela (senão o código é replicável durante ~30s).
- **Códigos de recuperação:** gerados uma vez, armazenados com hash, uso único, e a geração deve invalidar os anteriores.
- **Rate limit no desafio** — 6 dígitos são 1 milhão de combinações; sem limite, é força bruta viável.
- **SMS é o fator mais fraco** (SIM swap): aceitável como último recurso, nunca como único fator para ação crítica.
- **Fluxo de reset de MFA** é o elo mais fraco de todo o esquema — trate-o com o mesmo rigor do login, não como suporte comum.

## Hash de senha

- **Argon2id** (preferido) com parâmetros de memória/tempo calibrados no hardware real, ou **bcrypt** com custo revisado periodicamente. **Nunca** SHA/MD5, com ou sem sal.
- **bcrypt trunca em 72 bytes** — senha longa (ou passphrase) perde entropia silenciosamente; se usar bcrypt, pré-processe com hash antes, de forma consistente.
- **Sal por senha** é obrigatório e vem da biblioteca; **pepper** (segredo fora do banco) é camada extra opcional, e precisa de plano de rotação.
- **Reidratação no login:** ao autenticar com sucesso, se o hash usa parâmetros antigos, regrave com os atuais.
- **Comparação em tempo constante** e resposta de erro idêntica para usuário inexistente e senha errada (inclusive no tempo — verifique um hash falso quando o usuário não existir).
- **Política:** comprimento mínimo alto vale mais que composição obrigatória; verifique contra listas de senhas vazadas.

## Webhooks (entrada e saída)

- **Entrada:** valide a assinatura do remetente com comparação em tempo constante; rejeite requisição fora da janela de tempo (anti-replay) e trate o `id` do evento como chave de idempotência. Endpoint de webhook é rota pública — sem verificação de assinatura, qualquer um a chama.
- **Nunca confie no corpo do evento como verdade de negócio:** reconsulte a API do provedor pelo identificador antes de liberar valor (o padrão em pagamentos).
- **Saída:** URL de destino fornecida pelo usuário é vetor de **SSRF** — allowlist de destinos, bloqueio de IP privado/loopback/metadata, resolução de DNS validada, sem seguir redirect para rede interna.
- **Assine o que você envia** e documente a verificação para o consumidor.

## OAuth2 / OIDC

Onde mais se erra em autenticação delegada:

- **PKCE obrigatório** em qualquer cliente público (SPA, mobile) — e recomendado também em confidencial. *Implicit flow* está obsoleto: não use.
- **`state` sempre presente e validado** (proteção CSRF do fluxo); **`nonce`** validado no ID token (proteção contra replay).
- **`redirect_uri` com correspondência exata**, sem curinga e sem *prefix match*. Redirect frouxo é a via clássica de roubo de código de autorização.
- **Valide o token de verdade:** assinatura contra o JWKS do emissor (com cache e rotação de chave), `iss`, `aud`, `exp`, `nbf`. Decodificar sem verificar assinatura é o mesmo que confiar no cliente — e `alg: none` deve ser rejeitado explicitamente.
- **ID token ≠ access token.** ID token é para o cliente saber quem entrou; **nunca** o use como credencial de API. Access token não é para o cliente ler.
- **Escopo mínimo** e *audience* correta por API; token com escopo amplo reutilizado entre serviços vira chave-mestra.
- **Revogação e logout:** logout local não invalida token no provedor; para sessão real, use *back-channel logout* ou tokens curtos com refresh rotativo.
- **Refresh token em cliente público** exige rotação com detecção de reuso (`05`, A07).
- **Login social não é verificação de identidade:** `email_verified` pode ser falso; e-mail pode ser reutilizado por outro provedor. Não vincule contas apenas por e-mail.

---

# ORM / Acesso a dados

> **Universal a todos os ORMs:** a camada parametriza as consultas que ela mesma monta — e **não** o que você concatena na API "raw". Toda injeção via ORM entra pela porta dos fundos (raw/native query) ou por trecho não parametrizável (nome de coluna, direção de ordenação, cláusula dinâmica). Identificadores dinâmicos nunca são parametrizáveis: use **allowlist**, jamais interpolação.

## Prisma

- **`$queryRaw` / `$executeRaw`:** a forma *tagged template* parametriza; **`$queryRawUnsafe` / `$executeRawUnsafe` não**. Use `Prisma.sql` com `${}` dentro do template; nunca monte a string antes.
- **Mass assignment:** `data: req.body` grava qualquer campo do modelo — inclusive `role`, `ownerId`, `status`. Sempre allowlist explícita.
- **Filtro vindo do cliente:** repassar `where: req.query.filter` permite consultar qualquer campo (inclusive `password` por `contains`, extraindo o hash por oráculo). Nunca aceite objeto `where` do cliente.
- **`select` vs retorno completo:** sem `select`/`omit`, o hash de senha e campos internos viajam para a camada superior e frequentemente para o JSON.
- **Relações aninhadas em `include`** ignoram authz: você pode entregar o dado de outro tenant por um relacionamento sem perceber.
- **`updateMany` / `deleteMany` sem `where` completo** (faltando o filtro de dono) é modificação em massa.
- **Log:** `log: ['query']` em produção grava parâmetros — inclusive PII e credenciais.
- **Migrações:** `migrate dev` **nunca** em produção (pode dropar o banco); `migrate deploy` é o comando de produção.

## TypeORM

- **`query()`** é SQL cru sem parametrização automática — use o array de parâmetros.
- **QueryBuilder:** `.where("nome = '" + input + "'")` injeta; use `:param` com objeto de parâmetros. `orderBy` recebe identificador e **não** é parametrizável — allowlist obrigatória.
- **`find({ where: req.body })`** é o mesmo problema de filtro arbitrário do Prisma, agravado: operadores (`In`, `Like`, `Raw`) podem chegar do cliente. **`Raw()` com entrada do usuário é injeção direta.**
- **`save()` com objeto parcial** faz merge e pode sobrescrever campos não intencionais; para atualização, prefira `update()` com allowlist.
- **`synchronize: true` em produção** altera o schema automaticamente — perda de dados e superfície de alteração indevida. Sempre `false` fora de desenvolvimento.
- **`eager: true`** em relações traz dados sensíveis sem que a consulta os peça.
- **Seleção de senha:** coluna com `select: false` ainda é retornada por `addSelect` — audite onde isso acontece.

## JPA / Hibernate

- **JPQL/HQL concatenado é injetável** exatamente como SQL. Use *named parameters* (`:param`); nunca concatene. `createNativeQuery` idem.
- **`ORDER BY` dinâmico** e nome de entidade/coluna não são parametrizáveis — allowlist.
- **Serialização de entidade direto na resposta:** entidade JPA como retorno de controller expõe todos os campos e dispara *lazy loading* na serialização (vazamento + N+1). Use DTO sempre.
- **`@Transactional` ausente ou em método privado/autoinvocado** não abre transação — operação que você acredita atômica não é, e falha parcial deixa dado inconsistente.
- **Second-level cache** compartilhado entre tenants sem chave de tenant serve dado de um cliente para outro.
- **`spring.jpa.hibernate.ddl-auto`:** `update`/`create` em produção altera schema; use `validate` ou `none` com migração versionada (Flyway/Liquibase).
- **`show-sql` / log de binding** em produção grava parâmetros com PII.
- **Deleção em cascata** (`CascadeType.REMOVE`, `orphanRemoval`) pode apagar mais do que se espera — e interage com a política de retenção do `09`.

## Spring Data JPA

- **Derivação por nome de método** é segura; a atenção vai para **`@Query` com concatenação** e para SpEL dentro da query.
- **`@Query(nativeQuery = true)`** com string montada é injeção clássica.
- **`Pageable` vindo do cliente:** `size` sem teto é exaustão de recurso; **`sort` aceita nome de propriedade arbitrário**, permitindo ordenar por campo sensível e inferir valores (oráculo). Limite `size` e faça allowlist de campos ordenáveis.
- **Projeção por interface** é o caminho seguro para não retornar a entidade inteira.
- **`@Modifying` sem `clearAutomatically`** deixa o contexto de persistência inconsistente com o banco — leituras subsequentes retornam dado obsoleto.
- **Repositórios expostos por Spring Data REST** publicam CRUD completo automaticamente; se usado, restrinja explicitamente.

## Entity Framework Core

- **`FromSqlRaw` / `ExecuteSqlRaw`** com interpolação são injetáveis; as variantes **`FromSqlInterpolated` / `ExecuteSqlInterpolated`** parametrizam a interpolação — a diferença de nome é sutil e decide a segurança.
- **Avaliação no cliente:** predicado que o EF não traduz é avaliado em memória depois de trazer as linhas — vaza dados e é DoS. No EF Core 3+ isso lança exceção; não a silencie.
- **Over-posting:** entidade como parâmetro de action + model binding grava campos não pretendidos (ver ASP.NET Core). Use DTO e `SetValues` seletivo.
- **Tracking:** `AsNoTracking` para leitura evita atualização acidental por mudança de estado.
- **Consulta dinâmica** com `System.Linq.Dynamic` a partir de string do usuário é execução de expressão.
- **Migrations aplicadas automaticamente no start** (`Database.Migrate()`) em múltiplas instâncias causa corrida e exige privilégio de DDL em runtime — contraria o `11`.
- **`EnableSensitiveDataLogging`** jamais em produção: grava valores de parâmetro no log.

---

# Bancos de dados

## PostgreSQL

- **`public` schema:** por padrão (antes da v15) qualquer usuário podia criar objetos ali. Revogue `CREATE` de `PUBLIC` e conceda explicitamente.
- **Row-Level Security** é o controle nativo para multi-tenant; lembre que **o dono da tabela ignora RLS** por padrão (`FORCE ROW LEVEL SECURITY` resolve) — outro motivo para o app não ser dono.
- **`SECURITY DEFINER`** em função sem `SET search_path` fixo é escalada de privilégio via *search_path hijacking*.
- **Extensões** (`dblink`, `postgres_fdw`, `pg_execute_server_program`, `COPY ... PROGRAM`) permitem saída de rede e execução — não instale sem necessidade e não conceda a usuário de app.
- **`pg_hba.conf` / rede:** nunca `trust`; exija `scram-sha-256` e TLS; não exponha a porta publicamente (o Neon/Railway já isolam, mas confirme).
- **Timeouts:** `statement_timeout` e `idle_in_transaction_session_timeout` configurados — transação ociosa segura locks e derruba o banco.
- **Pooling** (PgBouncer): em modo *transaction*, `SET`/`prepared statements` de sessão vazam entre conexões; entenda o modo antes de usar recurso de sessão.
- **Backup lógico** com `pg_dump` contém PII em texto: criptografe e trate como dado de produção (`11`).

## SQL Server

- **SQL dinâmico** em procedure: use `sp_executesql` com parâmetros, nunca `EXEC(@sql)` concatenado.
- **`EXECUTE AS` / *ownership chaining*** mal usado eleva privilégio de forma não óbvia.
- **`xp_cmdshell`** desabilitado sempre; historicamente é o caminho de injeção → execução no sistema operacional.
- **Contas:** autenticação integrada (Entra ID/Windows) quando possível; `sa` desabilitado; usuário de app com *least privilege* e sem `db_owner`.
- **Criptografia:** TDE para dados em repouso; **Always Encrypted** quando o próprio DBA não deve ver o dado; `Encrypt=True` na string de conexão (o default mudou entre versões do driver — declare explicitamente).
- **Auditoria nativa** (SQL Server Audit) para acesso a tabela sensível.
- **Erro detalhado** com nome de objeto e schema vaza estrutura; mascare na aplicação.

## MongoDB

- **Injeção de operador é o risco número um.** Se o corpo JSON chega ao filtro, `{"senha": {"$ne": null}}` faz *login bypass*, e `$regex`/`$where` viram DoS e oráculo. **Nunca** passe objeto do cliente como filtro; valide com schema e rejeite chaves começando com `$`.
- **`$where` e `mapReduce`** executam JavaScript no servidor — desabilite (`--noscripting`) se não usar.
- **Autenticação e bind:** historicamente a maior fonte de vazamentos públicos foi instância sem autenticação exposta à internet. Autenticação sempre habilitada, bind restrito, TLS obrigatório.
- **Autorização por papel** com escopo por banco/coleção; nada de `root` para a aplicação.
- **Schema validation** ativado — a flexibilidade do documento não elimina a necessidade de contrato.
- **Agregações do cliente:** permitir pipeline arbitrário equivale a permitir consulta arbitrária, incluindo `$lookup` para coleções alheias.
- **Criptografia:** *Client-Side Field Level Encryption* para campo sensível, além de criptografia em repouso.

## Redis

- **Não é banco público, nem seguro por padrão.** Sem `requirepass`/ACL e sem bind restrito, é acesso total — e há histórico de comprometimento de servidor via Redis exposto (escrita de chave em caminho arbitrário).
- **ACL por usuário** (Redis 6+) com comandos mínimos; desabilite/renomeie comandos perigosos (`FLUSHALL`, `CONFIG`, `KEYS`, `DEBUG`, `EVAL` se não usar Lua).
- **TLS** para conexão fora da rede privada.
- **Sessão em cache:** invalide na revogação de acesso — cache é a razão mais comum de permissão revogada continuar valendo.
- **Chave de cache deve incluir a identidade/tenant** quando o conteúdo for específico do usuário. Chave sem escopo entrega dado de um usuário a outro — é o vazamento silencioso mais comum em cache.
- **TTL obrigatório** em dado de sessão e em cache de PII (cruza com retenção, `09`); dado sensível em cache é dado armazenado.
- **Lua (`EVAL`)** montado com entrada do usuário é execução de script.
- **Persistência:** RDB/AOF gravam o conteúdo em disco — se há PII em cache, esses arquivos entram no escopo de proteção e de backup criptografado.

---

# Infraestrutura

## nginx

- **Barra final em `proxy_pass` e `location` mal combinados** causam *path traversal* para o upstream; a combinação `location /api { proxy_pass http://back/; }` com normalização diferente entre nginx e aplicação é fonte de *request smuggling* e bypass de authz.
- **Cabeçalhos de proxy:** defina `X-Forwarded-For`/`X-Real-IP` explicitamente e **limpe o que veio do cliente** — senão o cliente forja o IP e escapa de rate limit e de allowlist.
- **`autoindex off`**, `server_tokens off` (não revelar versão), e páginas de erro genéricas.
- **Terminação TLS:** protocolos e cifras modernos, HSTS emitido aqui quando o proxy é a borda, OCSP stapling.
- **`alias` mal configurado** (sem barra) é *path traversal* clássico — prefira `root`.
- **Rate limit e limites de tamanho** (`limit_req`, `client_max_body_size`, `client_body_timeout`) na borda, como primeira camada antes da aplicação.
- **Buffer/timeout** ajustados contra *slowloris*; `proxy_read_timeout` coerente com o backend.
- **Cache:** nunca cachear resposta com `Set-Cookie` ou conteúdo autenticado; a chave de cache deve considerar o que diferencia usuários.

## Containers / Docker

- **Usuário não-root** no `Dockerfile` (`USER`), sistema de arquivos somente-leitura quando possível, `--cap-drop=ALL` com capacidades adicionadas sob demanda.
- **Segredo em `ARG`/`ENV` ou em `COPY` fica na camada da imagem para sempre** — mesmo que removido em camada posterior. Use *build secrets* ou injeção em runtime.
- **Imagem base mínima** (distroless/alpine) e **pinada por digest**, não por tag mutável (mesmo princípio do SHA nas Actions, `11`).
- **`.dockerignore`** para não copiar `.env`, `.git` e credenciais para o contexto de build.
- **Varredura de imagem** (Trivy/Grype) no CI, junto com o `npm audit` do A03.
- **Sem socket do Docker montado** no contêiner (`/var/run/docker.sock`) — é root no host.
- **Multi-stage build** para não publicar toolchain e código-fonte na imagem final.
- **Healthcheck e limites de recurso** (CPU/memória) — contêiner sem limite é DoS por vizinho barulhento.

## Object storage

- **Bucket nunca público.** Acesso via **URL pré-assinada com TTL curto**, escopada por objeto e por método.
- **Upload direto do cliente** exige validação server-side depois: tipo por *magic bytes*, tamanho, e nunca confiar no `Content-Type` enviado.
- **Nome de objeto gerado pelo servidor** — nome vindo do cliente permite sobrescrever objeto alheio e *path traversal* na chave.
- **Servir de domínio separado** (ou com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`) para que HTML/SVG enviado por usuário não execute no domínio da aplicação — SVG é vetor de XSS frequentemente esquecido.
- **Criptografia em repouso** e política de retenção alinhada ao `09`; versionamento para recuperar deleção acidental (mas cuidado: versão antiga de arquivo apagado a pedido do titular precisa ser expurgada também).
- **Logs de acesso** habilitados; alerta em listagem anômala.

## E-mail transacional

- **SPF, DKIM e DMARC configurados** — sem eles, qualquer um envia e-mail se passando pelo seu domínio, e o fluxo de recuperação de senha vira vetor de phishing convincente.
- **Link de recuperação:** token de alta entropia, uso único, TTL curto, invalidado na troca de senha; não coloque o token na URL de uma página que carrega script de terceiro (vaza por `Referer`).
- **Não revele existência de conta** na resposta de "esqueci a senha" — mensagem idêntica para e-mail existente e inexistente.
- **Rate limit por conta e por IP** no envio (evita uso do seu servidor como ferramenta de assédio).
- **Conteúdo:** nada de dado sensível no corpo do e-mail (senha temporária em texto, dados de saúde, documento) — e-mail é canal não confiável e persistente.
- **Rastreamento (pixel/link) é tratamento de dado pessoal** — cruza com o `09`.

## Serverless / Edge functions (Vercel, Lambda, Workers)

- **Cada função é um endpoint público** com sua própria superfície de authz — não existe "rota interna" só porque o arquivo não está linkado no front.
- **Variáveis de ambiente por escopo:** em plataformas com preview/produção, variável marcada para todos os ambientes vaza para builds de PR. Escope por ambiente (`11`).
- **Estado entre invocações:** o contêiner é reutilizado; variável de módulo persiste entre requisições de **usuários diferentes**. Nunca guarde contexto de usuário fora do escopo do handler — é vazamento cruzado silencioso.
- **Timeout e limite de execução** são também controle de custo: função sem teto exposta publicamente é DoS financeiro.
- **Cold start e segredo:** buscar segredo em cofre a cada invocação custa caro; cachear em memória é aceitável, mas respeite TTL para que rotação surta efeito.
- **Metadata endpoint** (`169.254.169.254`) alcançável de dentro da função é escalada via SSRF — bloqueie saída para IP de link-local.
- **Logs da plataforma** capturam o que a função imprime; a redaction do `05` vale igual.

## SDKs de analytics e monitoramento (Sentry, PostHog e similares)

- **Session replay grava a tela do usuário.** Sem máscara explícita, ele captura senha digitada, CPF, cartão e dado de saúde — é o vazamento de PII mais volumoso e menos percebido. Mascare por padrão e libere campo a campo (allowlist), não o contrário.
- **Captura automática de eventos** registra texto de botão, rótulo e conteúdo de input; revise o que é enviado antes de ativar.
- **Breadcrumbs e contexto de erro** carregam corpo de requisição, headers (`Authorization`!) e query string — configure o scrubbing antes do primeiro deploy, não depois do primeiro incidente.
- **Chave do SDK no cliente é pública** — configure limites de origem/domínio no provedor para evitar poluição de dados por terceiros.
- **É tratamento de dado pessoal:** base legal, retenção e transferência internacional entram no `09`.
- **Terceiro no cliente lê o DOM autenticado** (`05`) — minimize a quantidade de SDKs.

## Pagamentos (Stripe e similares)

- **Nunca toque no número do cartão.** Use os elementos hospedados do provedor; qualquer campo de cartão renderizado por você joga o sistema inteiro no escopo de PCI-DSS.
- **A confirmação vem do webhook assinado**, não do retorno do navegador — o cliente pode não voltar, voltar duas vezes, ou forjar o retorno. Verifique assinatura, trate replay e reconsulte o provedor antes de liberar valor (ver Webhooks).
- **Idempotência obrigatória** na criação de cobrança: chave por intenção, não por requisição.
- **Valores e cálculo no servidor** — preço vindo do cliente é fraude trivial.
- **Chaves:** `secret key` só no backend, uma por ambiente; a `publishable` é pública por design.
- **Estorno, disputa e cancelamento** também são fluxos autorizáveis: exigem authz de dono e trilha de auditoria.

## Filas e mensageria (BullMQ/Redis, RabbitMQ, Kafka, SQS)

- **O broker é infraestrutura interna sem autenticação por padrão** em várias configurações — exija credencial, TLS e rede privada (ver Redis e `11`).
- **Payload de job é dado armazenado:** PII na fila herda retenção, criptografia e minimização do `09`. Prefira referência (ID) a dado completo.
- **Mensagem é entrada não confiável** mesmo vindo do próprio sistema: valide com schema no consumidor. Quem produz hoje pode ser outro serviço amanhã.
- **Desserialização de tipo arbitrário** no consumidor é RCE (mesma armadilha do Jackson/`BinaryFormatter`).
- **Idempotência no consumidor:** entrega *at-least-once* é o padrão; job que cobra ou envia e-mail precisa de chave de deduplicação.
- **DLQ (fila morta) acumula payloads com PII** e costuma ficar sem retenção definida — inclua no inventário de dados.
- **Job envenenado** que sempre falha e reentra consome o worker: limite de tentativas com backoff.
- **Autorização não viaja sozinha:** o job carrega o contexto do usuário, mas o worker precisa reavaliar permissão no momento da execução — ela pode ter sido revogada desde o enfileiramento.

## CDN e WAF (Cloudflare e similares)

- **Bypass de origem:** se o IP do servidor for descoberto, o atacante fala direto com a origem e pula CDN, WAF e rate limit. Restrinja a origem para aceitar apenas o CDN (allowlist de IP ou autenticação de origem).
- **Cache poisoning e chave de cache:** header não incluído na chave mas usado pela aplicação permite envenenar a resposta de outros usuários. Nunca cacheie resposta autenticada; use `Vary` corretamente e `Cache-Control: private, no-store` no que for de usuário.
- **WAF é camada, não substituto** — regra genérica é contornável; a validação da aplicação continua obrigatória.
- **Cabeçalho de IP real:** confie apenas no header que o seu CDN define e limpe o resto (ver nginx/`trust proxy`).
- **Regras de segurança em modo "log only"** esquecidas dão falsa sensação de proteção — audite o modo efetivo.

## APIs de LLM (quando o produto integra IA)

- **Prompt injection é injeção, e a saída não é confiável.** Conteúdo vindo do usuário (ou de página, PDF, e-mail que o sistema leia) pode reescrever a instrução. Trate a resposta do modelo como entrada não validada: nunca a execute, nunca a interpole em SQL/HTML/comando, nunca a use para decidir autorização.
- **Autorização é da aplicação, nunca do modelo.** Se o modelo aciona ferramentas, cada ferramenta valida permissão do usuário final — modelo não é sujeito de authz.
- **PII no prompt é transferência de dado a terceiro:** base legal, contrato, retenção do provedor e transferência internacional entram no `09`. Minimize antes de enviar.
- **Custo e abuso:** endpoint que chama LLM sem rate limit e sem teto de tokens é prejuízo financeiro direto; limite por usuário e por período.
- **Saída para o navegador** renderizada como HTML/markdown é XSS se não sanitizada.
- **Chave do provedor só no backend** — chamada direta do cliente expõe a credencial e o custo.
