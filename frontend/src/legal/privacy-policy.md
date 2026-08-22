# Política de Privacidade do LumiTrack

**Versão 1.2 — vigente desde 09/08/2026**

Esta Política de Privacidade descreve como o LumiTrack ("nós", "plataforma")
coleta, utiliza, armazena e protege os dados pessoais dos seus usuários
("você", "titular"), em conformidade com a Lei Geral de Proteção de Dados
Pessoais — LGPD (Lei nº 13.709/2018).

Ao marcar a caixa de aceite no cadastro, você declara ter lido e concordado
com os termos abaixo.

## 1. Quem trata os seus dados (controlador)

O LumiTrack é o controlador dos dados pessoais tratados na plataforma.
Dúvidas, solicitações ou exercício de direitos podem ser enviados para o
canal de privacidade: **{{PRIVACY_CONTACT_EMAIL}}**.

> Aviso: este é um documento-modelo gerado como parte de uma auditoria de
> segurança e conformidade. Antes do uso em produção com usuários reais, os
> dados de identificação do controlador e do encarregado (DPO) devem ser
> completados e o texto revisado por um profissional jurídico.

## 2. Quais dados coletamos

| Categoria | Dados | Finalidade |
|---|---|---|
| Identificação | Nome, sobrenome ou razão social/nome fantasia, e-mail | Criar e gerenciar sua conta, autenticação |
| Documentos | CPF (pessoa física) ou CNPJ (pessoa jurídica) | Identificação única do titular, prevenção a fraude |
| Senha | Hash da senha (nunca em texto claro) | Autenticação segura |
| Localização | Endereço, cidade, estado e CEP das propriedades cadastradas | Vincular o consumo de energia ao imóvel monitorado |
| Consumo de energia | Histórico de consumo (kWh) e custo estimado (R$) por propriedade, área ou dispositivo | Geração de relatórios, simulações e alertas de consumo |
| Dispositivos e IoT | Nome, marca, modelo e potência de aparelhos; configuração técnica de conectividade (protocolo, host, porta, endereço) | Monitoramento de consumo em tempo real |
| Sessão | Tokens de autenticação, data de login/logout | Manter sua sessão segura e permitir revogação de acesso |
| Consentimento | Data do aceite e versão da Política aceita | Comprovar a base legal do tratamento (Art. 7º/8º da LGPD) |

Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção
religiosa ou política, etc.).

## 3. Base legal do tratamento

- **Consentimento** (Art. 7º, I): obtido no momento do cadastro, mediante
  aceite explícito desta Política e dos Termos de Uso.
- **Execução de contrato** (Art. 7º, V): necessário para prestar o serviço de
  monitoramento de consumo de energia que você contratou.
- **Cumprimento de obrigação legal/regulatória** (Art. 7º, II): quando
  aplicável, para fins fiscais ou de auditoria.

## 4. Com quem compartilhamos seus dados e onde eles são processados

> **Este é um ambiente de demonstração.** O LumiTrack publicado é uma
> demonstração de portfólio: o **cadastro de novos usuários está
> desabilitado** e as únicas contas existentes são fictícias, criadas com
> dados sintéticos (CPF/CNPJ matematicamente válidos porém nunca emitidos,
> e-mails em domínio inexistente). Nenhum dado pessoal de pessoa real é
> coletado ou armazenado pela aplicação.

A infraestrutura que hospeda a demonstração fica **fora do Brasil**:

| Componente | Operador | País | O que trata |
|---|---|---|---|
| Aplicação (API e interface) | Render | Estados Unidos | Registros de acesso (IP, data/hora, rota) |
| Banco de dados PostgreSQL | Neon | Estados Unidos | Apenas os dados sintéticos das contas de demonstração |

- **Há transferência internacional de dados, limitada aos registros de
  acesso.** Como a aplicação não possui usuários reais, o único dado
  pessoal que sai do Brasil é o gerado pela sua própria visita — endereço
  IP e registro de acesso, tratados pelos provedores de infraestrutura
  acima. Não celebramos Cláusulas-Padrão Contratuais (Resolução CD/ANPD
  nº 19/2024) com esses provedores, e informamos isso de forma transparente
  em vez de omitir: é uma limitação assumida de um ambiente de
  demonstração.
- **Compromisso:** caso o LumiTrack passe a operar com usuários reais, a
  infraestrutura será migrada para o **Brasil** antes da abertura do
  cadastro, eliminando a transferência internacional.
- Não compartilhamos dados pessoais com terceiros para fins de
  publicidade, venda ou qualquer finalidade não descrita nesta Política.
- Não utilizamos cookies de análise, rastreadores de terceiros ou
  ferramentas de analytics.
- **Envio de e-mail:** nenhum provedor de e-mail (SMTP) está contratado no
  ambiente atual. Como consequência, a redefinição de senha por e-mail não
  está operante. Caso um provedor venha a ser contratado, ele passará a ser
  um operador nos termos do Art. 39 da LGPD, esta seção será atualizada com
  o nome e o país de processamento, e uma nova versão desta Política será
  publicada.

## 5. Como protegemos seus dados

- Senhas armazenadas com hash criptográfico (bcrypt), nunca em texto claro.
- Conexões protegidas por cabeçalhos de segurança HTTP e TLS/HTTPS em produção.
- Controle de acesso: cada usuário só acessa os próprios dados — verificado
  em toda requisição.
- Limitação de tentativas (*rate limiting*) em endpoints de autenticação,
  para reduzir o risco de ataques de força bruta.
- Tokens de sessão podem ser revogados a qualquer momento (logout).
- CPF/CNPJ, endereço e o segredo de autenticação em duas etapas são
  armazenados criptografados (AES-256-GCM), com chaves independentes entre
  si — o comprometimento de uma não expõe as demais.
- Infraestrutura hospedada por provedores de nuvem especializados — ver
  seção 4 para o país de cada componente —, sem acesso de terceiros além
  desses provedores.

## 6. Seus direitos como titular (Art. 18 da LGPD)

Você pode, a qualquer momento:

- **Confirmar e acessar** os dados que mantemos sobre você;
- **Corrigir** dados incompletos, inexatos ou desatualizados;
- **Eliminar** sua conta e os dados associados (sujeito às hipóteses de
  retenção legal, quando aplicável);
- **Solicitar a portabilidade** dos seus dados a outro fornecedor de serviço;
- **Revogar o consentimento** e se opor a tratamentos realizados com base nele;
- **Solicitar informações** sobre o compartilhamento de seus dados.

Você pode exercer os direitos de acesso, retificação e eliminação
diretamente na plataforma, na área de configurações da sua conta. Para os
demais direitos, entre em contato pelo canal de privacidade:
**{{PRIVACY_CONTACT_EMAIL}}**. Respondemos em até 30 dias (prazo em dobro
do regime de agente de pequeno porte).

## 7. Retenção e eliminação dos dados

Mantemos seus dados enquanto sua conta estiver ativa e pelo tempo necessário
para cumprir as finalidades descritas nesta Política. Ao excluir sua conta,
os dados pessoais e os dados de consumo associados são removidos da nossa
base de dados, exceto quando a retenção for exigida por obrigação legal.

## 8. Alterações nesta Política

Esta Política pode ser atualizada para refletir mudanças no serviço ou na
legislação aplicável. Alterações materiais terão uma nova versão registrada
nesta página, e poderemos solicitar um novo aceite quando isso ocorrer.

## 9. Contato

Em caso de dúvidas sobre esta Política ou sobre o tratamento dos seus dados
pessoais, entre em contato pelo canal de privacidade: **{{PRIVACY_CONTACT_EMAIL}}**.
