# Procedimento de Atendimento aos Direitos do Titular (LGPD Art. 18)

> Produzido como remediação da issue #155 (épico #154, Fase 11 do
> `.claude/docs/roadmap.md`), a partir do achado do
> `.claude/docs/2026-08-05-conformidade-audit.md`. Não é parecer jurídico —
> ver ressalva no fechamento deste documento.

## ⚠️ Este repositório é um projeto de portfólio

O LumiTrack, neste repositório, **não opera com titulares reais** — não há
encarregado, e o cadastro público continua fechado (`REGISTRATION_ENABLED=false`),
só contas de demonstração sintéticas. A partir da Fase 13.6, o canal descrito
abaixo deixou de ser o placeholder de portfólio (`privacidade@seu-dominio.com.br`)
em produção — mas **ainda não está funcional de fato**: `VITE_PRIVACY_CONTACT_EMAIL`
(ver `render.yaml`) já aponta para o endereço definitivo
(`contato@lumitrack.com.br`), só que o domínio `lumitrack.com.br` ainda não
foi registrado (dependência bloqueante da Fase 13.7). Até o registro, uma
solicitação enviada para esse endereço não chega a lugar nenhum — pendência
conhecida e assumida, não um estado seguro. Isso importa desde já porque a
demo pública já trata dado de visitante real (IP, user-agent) mesmo sem
nenhum cadastro. Este documento existe para deixar **pronto** o que um fork
comercial precisa **sanar antes do go-live**, não para descrever uma
operação em curso.

**Antes de operar com titulares reais**, quem herdar este código precisa, no
mínimo:

1. Confirmar que o endereço monitorado em `VITE_PRIVACY_CONTACT_EMAIL`
   (produção) ainda é o que o fork pretende usar — troque se for operar sob
   outro domínio/marca.
2. Nomear quem responde por este procedimento (o regime de pequeno porte
   dispensa o encarregado formal, mas não a existência de um responsável de
   fato).
3. Revisar `frontend/src/legal/privacy-policy.md` e
   `frontend/src/legal/terms-of-use.md` com apoio jurídico — ambos têm o
   aviso "documento-modelo" em aberto (ver § 1 da Política de Privacidade).
4. Reavaliar este procedimento à luz da operação real (volume esperado de
   solicitações, ferramenta de atendimento, etc.) — o que segue é o mínimo
   viável, não um processo maduro de atendimento.

## Canal

- **Endereço:** o valor configurado em `VITE_PRIVACY_CONTACT_EMAIL` — em
  produção, no bloco do site estático de `render.yaml`; localmente, o
  placeholder de `frontend/.env.example` — publicado no rodapé da Landing,
  no shell autenticado (página "Sobre o projeto") e no card "Privacidade &
  dados" do Perfil. **Pendência aberta:** o endereço de produção depende do
  registro do domínio `lumitrack.com.br` (Fase 13.7) — até lá, não é um
  canal funcional, apesar de já estar publicado.
- **Também referenciado em:** `frontend/src/legal/privacy-policy.md` (§ 1,
  § 6 e § 9), via placeholder `{{PRIVACY_CONTACT_EMAIL}}` substituído em
  tempo de build por `PrivacyPolicyPage.tsx`.

## Direitos cobertos (Art. 18 da LGPD) e como cada um é atendido hoje

| Direito | Via | Observação |
|---|---|---|
| I — Confirmação da existência de tratamento | Canal | Resposta descritiva por e-mail. |
| II — Acesso aos dados | Autoatendido | Perfil (`/perfil`) + exportação em JSON (`GET /api/users/me/data-export`). |
| III — Correção de dados incompletos/inexatos | Autoatendido (parcial) + Canal | Nome/sobrenome/razão social/e-mail editáveis no Perfil; CPF/CNPJ não são editáveis por design (prevenção a fraude) — correção desses dois campos passa pelo canal. |
| IV — Anonimização, bloqueio ou eliminação de dados desnecessários/excessivos | Canal | Sem fluxo self-service de anonimização parcial hoje — só exclusão total da conta. |
| V — Portabilidade a outro fornecedor | Autoatendido | Exportação em JSON cobre o dado estruturado; formato de portabilidade formal fica a critério do responsável em produção. |
| VI — Eliminação dos dados tratados com consentimento (Art. 16) | Autoatendido | "Excluir minha conta" no Perfil, sujeito às hipóteses de retenção legal. |
| VII — Informação sobre entidades com quem os dados foram compartilhados | Canal | A lista de operadores vive no ROPA (issue #156, quando existir) — a resposta ao titular referencia esse inventário. |
| VIII — Informação sobre a possibilidade de não fornecer consentimento e as consequências | Canal | Hoje coberta pela própria Política de Privacidade (§ 3); dúvidas pontuais pelo canal. |
| IX — Revogação do consentimento | Canal | Sem toggle de revogação granular hoje — revogar implica, na prática, encerrar a conta; o canal orienta caso a caso. |
| X (Art. 20) — Revisão de decisões tomadas unicamente por tratamento automatizado | Canal | O LumiTrack não tem hoje nenhuma decisão automatizada que produza efeito sobre o titular (alertas são informativos, não decisórios) — mantido no procedimento por completude. |

## Prazo de resposta

**30 dias corridos**, contados do recebimento da solicitação — o prazo em
dobro do regime de agente de pequeno porte (Res. CD/ANPD 2/2022) sobre o
prazo padrão do Art. 18 §3º/§5º (15 dias) e da resposta simplificada do §2º.

Se o volume ou a complexidade do pedido não permitirem resposta completa no
prazo, comunicar o titular antes do vencimento, com uma data revisada e a
razão do atraso.

## Passo a passo

1. **Registro:** toda solicitação recebida pelo canal é registrada (data,
   identidade do solicitante, direito(s) invocado(s)) — mesmo sem uma
   ferramenta dedicada, uma planilha ou pasta de e-mail com esse mínimo já
   cumpre o requisito de rastreabilidade.
2. **Verificação de identidade:** confirmar que quem solicita é o próprio
   titular (ou representante legal) antes de agir sobre dados pessoais —
   nunca aceitar a palavra do e-mail remetente sem alguma correlação com a
   conta (e-mail cadastrado, CPF/CNPJ parcial, etc.).
3. **Triagem do direito:** localizar a linha correspondente na tabela acima.
   Se autoatendido, orientar o titular a usar o fluxo já existente na
   plataforma (Perfil). Se depende do canal, seguir para o passo 4.
4. **Execução:** o responsável (ver "Antes de operar com titulares reais",
   acima) executa a ação necessária diretamente no banco de dados ou via
   suporte técnico, documentando o que foi feito.
5. **Resposta ao titular:** confirmar por escrito o que foi feito (ou a
   razão de eventual recusa, ex.: retenção legal obrigatória), dentro do
   prazo de 30 dias.
6. **Registro de encerramento:** marcar a solicitação como concluída no
   registro do passo 1, com a data de resposta.

## Ressalva

Este procedimento é um checklist de engenharia informado pela lei, não um
parecer jurídico. Antes de considerá-lo apto para titulares reais, submeta-o
a um advogado ou encarregado — especialmente os pontos de verificação de
identidade e recusa por retenção legal, que têm implicação jurídica direta.
