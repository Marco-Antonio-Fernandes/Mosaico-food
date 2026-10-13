# Mosaico Food — plano técnico

**Status:** frontend em protótipo mock completo; backend inicial publicado e parcial  
**Plataformas:** Windows prioritário; Linux compatível  
**Canal remoto do MVP:** WhatsApp Business Platform — Cloud API oficial  
**Canal futuro preservado:** portal web público e outros canais por adaptador

## 1. Objetivo e limites

### Implementação atual — 09/10/2026

- [x] ~~Layouts mock de visão geral, PDV, pedidos, atendimento, produtos,
  estoque, clientes/crediário, caixa/financeiro, fiscal, notificações,
  automação, configurações e offline.~~
- [x] ~~Backend compartilhado em ../mosaico-back; Next.js/Prisma/SQLite.~~
- [x] ~~Health, clientes, crediário, CORS e endpoints iniciais de sync.~~
- [x] ~~Servidor na porta 3001, Nginx e túnel Cloudflare funcionando
  conforme confirmação do usuário.~~
- [ ] Integração dos mocks com API, Cloud API oficial, fiscal e offline real.

SQLite é usado também no servidor nesta fase; PostgreSQL não foi implantado.
O desenho de monorepositório abaixo é uma previsão, não a estrutura atual:
o backend está separado em mosaico-back.
Os frontends atuais usam somente mocks por solicitação explícita do usuário.
Veja [plano de frontend](PLANO-FRONTEND-MOCK.md) e
[entregas/pêndencias](<../../Servidor Rotatix/STATUS-MOSAICO.md>).

O Mosaico Food será um software desktop para a operação completa de uma
lanchonete. O funcionário usará o aplicativo para vender, controlar produtos,
ingredientes, estoque, clientes, crediário, caixa, financeiro, pedidos,
atendimento e indicadores.

Na primeira versão, o cliente não acessará portal, site ou aplicativo para
pedir. Ele conversará naturalmente pelo WhatsApp. O sistema precisa transformar
essa conversa em carrinho e, depois de confirmação explícita, em pedido oficial.

O escopo administrativo existente permanece. A alteração é somente a troca do
portal web de pedidos por WhatsApp como canal remoto inicial, além dos módulos
necessários para atendimento automatizado.

Não fazem parte do MVP:

- portal web público de pedidos;
- aplicativo móvel do cliente;
- catálogo externo obrigatório ou dependência de fotos;
- automação baseada em sessão do WhatsApp Web;
- IA generativa paga obrigatória;
- confirmação automática de pagamento apenas por mensagem do cliente.

## 2. Arquitetura geral

```text
Cliente WhatsApp
       │ mensagens / status
       ▼
Meta Cloud API ◄──────────────┐
       │ HTTPS webhook         │ HTTPS API
       ▼                       │
Backend Next.js ── SQLite/Prisma no desenvolvimento; PostgreSQL previsto
para a etapa de servidor
       │  │  ├── catálogo, estoque, pedidos e financeiro
       │  │  ├── fiscal-provider e documentos fiscais
       │  │  ├── fila, outbox, auditoria e notificações
       │  └── interpretador e carrinho conversacional
       │
       ├── HTTP/WebSocket autenticado
       ▼
Mosaico Food Desktop (Electron + React)
       ├── PDV
       ├── Atendimento
       ├── Kanban
       └── gestão administrativa
```

### Desktop

O Electron fornece janela, atualização, notificações do sistema, som,
atalhos, armazenamento seguro de preferências não sensíveis e integração com
Windows/Linux. O renderer React não recebe token da Meta e não acessa banco.
O preload expõe somente operações explicitamente autorizadas.

O desktop deve continuar operando a gestão localmente enquanto houver conexão
com o backend. Um modo offline controlado poderá ser adicionado depois, com
operações sincronizáveis e sem duplicar as regras comerciais.

### Backend

O Next.js será o ponto único de autenticação, autorização, regras comerciais,
persistência, processamento de webhooks, filas e comunicação com a Meta.
SQLite é a fonte de verdade durante o desenvolvimento inicial; PostgreSQL será
a fonte de verdade quando o backend for promovido para o servidor. Prisma será
usado somente no backend.

Processamentos demorados ou que possam ser repetidos usam uma fila/outbox:

1. a API grava o evento e o efeito transacional local;
2. um worker busca a tarefa pendente;
3. o worker executa com `operation_id` idempotente;
4. sucesso, falha e próxima tentativa são registrados;
5. a interface recebe atualização por WebSocket ou consulta incremental.

### Monorepositório previsto

```text
apps/
├── desktop/       # Electron, React e renderer
└── backend/       # Next.js, API, workers e Prisma
packages/
├── contracts/     # Zod, tipos, enums e eventos
└── domain/        # regras puras de catálogo, carrinho e pedidos
```

## 3. Módulos preservados e ampliados

### Fundação, conta e configuração

- organização e loja;
- usuários, papéis e permissões;
- login, logout, expiração e auditoria;
- preferências de sons e notificações;
- horário de funcionamento;
- regras de entrega e retirada;
- dados da loja e configuração do WhatsApp.

### Catálogo

- categorias;
- produtos vendidos;
- preço atual e histórico de preço;
- disponibilidade;
- adicionais e opções, quando cadastrados;
- sinônimos e aliases;
- ingredientes e fichas técnicas opcionais;
- foto opcional, sem ser requisito para vender ou interpretar.

O proprietário cadastra o produto uma única vez. PDV, WhatsApp, estoque,
relatórios e pedidos consultam o mesmo catálogo.

### Estoque

- ingredientes e produtos controlados;
- unidades de medida e conversões;
- estoque mínimo;
- entrada, saída, ajuste, perda e inventário;
- reserva ao confirmar pedido, conforme política configurada;
- baixa no momento definido pela loja;
- alerta de indisponibilidade;
- histórico imutável de movimentações.

### Clientes e crediário

- cadastro por nome e telefone;
- endereço de entrega opcional;
- consentimentos e preferências de comunicação;
- histórico de pedidos e vendas;
- limite de crédito;
- lançamentos de débito, pagamento, estorno e ajuste auditado.

O telefone normalizado identifica a conversa, mas não substitui as regras de
duplicidade e confirmação do cadastro.

### PDV, caixa e financeiro

- venda presencial ou retirada;
- itens, descontos autorizados, acréscimos e observações;
- dinheiro, cartão, Pix e outros meios configuráveis;
- abertura, fechamento e sangria de caixa;
- contas a receber, despesas e categorias;
- crediário;
- conciliação manual ou integração futura;
- dashboard de vendas, ticket médio, estoque e caixa.

Uma confirmação de pedido não equivale a pagamento. O `payment_status` só muda
por fluxo financeiro autorizado, conciliação ou confirmação manual com usuário
responsável.

O atendimento presencial deve distinguir três situações, sem obrigar o caixa a
criar uma venda que não aconteceu:

1. **Somente pagamento:** o cliente veio quitar parte ou todo o crediário. O
   sistema registra um lançamento `credit_entry` do tipo `payment` e a entrada
   correspondente no caixa, mas não cria venda, pedido, baixa de estoque ou
   documento fiscal.
2. **Somente compra:** o cliente veio comprar. A venda segue o fluxo normal; um
   eventual saldo antigo do crediário não é alterado automaticamente.
3. **Pagamento + compra:** o cliente quita uma dívida e também faz uma compra na
   mesma visita. A interface pode mostrar um único atendimento e um único
   comprovante, mas grava separadamente o pagamento da dívida e a venda nova.
   Cada valor recebido deve ter destinação explícita — dívida, venda à vista ou
   troco — e a venda pode continuar no crediário sem consumir o pagamento da
   dívida por engano.

O caixa deve identificar o cliente antes de registrar pagamento de crediário,
mostrar saldo anterior, valor destinado à dívida, total da compra e novo saldo.
As duas operações do caso combinado devem ser atômicas e idempotentes: ou as
duas são gravadas, ou nenhuma é. O fiscal incide somente sobre a venda elegível,
enquanto o pagamento de dívida é financeiro e não gera novo documento fiscal.

### Fiscal

O sistema terá um módulo fiscal integrado ao fluxo de vendas. Para uma
lanchonete, a hipótese inicial é emissão de **NFC-e, modelo 65**, para venda a
consumidor final, inclusive retirada e delivery quando permitido pela UF. A
obrigação, o documento adequado, o regime tributário e as regras de emissão
devem ser confirmados pelo contador e pela SEFAZ do estado da loja. NF-e modelo
55 ou NFS-e não serão tratados como sinônimos de NFC-e.

O módulo será um adaptador fiscal independente do domínio de pedidos:

- `fiscal-provider`: contrato para provedor autorizado ou integração direta;
- `fiscal-mapper`: conversão de venda para os dados fiscais;
- `fiscal-issuer`: emissão, consulta, cancelamento e contingência;
- `fiscal-storage`: XML, protocolo, chave, DANFE e QR Code;
- `fiscal-events`: autorização, rejeição, cancelamento e inutilização quando
  aplicável;
- `fiscal-audit`: usuário, motivo, data e resposta técnica sem expor segredo.

A primeira implementação deve preferir um provedor com API para reduzir o
acoplamento a diferenças de webservice entre estados. O contrato também deve
permitir integração direta com a SEFAZ caso essa seja a decisão comercial e
fiscal. A escolha do provedor não será feita no código do PDV.

O documento fiscal será emitido somente quando houver uma venda/pedido oficial,
nunca para carrinho temporário. O momento exato — confirmação do pedido,
aceite da venda ou finalização no caixa — será configurável apenas dentro da
política aprovada pelo contador. O padrão do plano é emitir após a confirmação
da venda pelo backend e antes de marcá-la como fiscalmente concluída.

Se a autorização falhar, a venda não será apagada nem duplicada. Ela ficará com
`fiscal_status=pending` ou `rejected`, com ação de reprocessamento e mensagem
para o funcionário. Cancelamento, devolução e correção seguirão eventos fiscais
permitidos; nunca serão resolvidos apagando o lançamento.

Dados tributários necessários no cadastro, conforme o enquadramento da empresa
e orientação contábil:

- CNPJ, inscrição estadual, UF e município;
- ambiente de homologação ou produção;
- série e numeração fiscal;
- regime tributário;
- CFOP, NCM, CEST, origem, unidade e GTIN quando aplicáveis;
- CST/CSOSN e demais alíquotas ou benefícios;
- certificado digital A1 ou credencial do provedor em armazenamento seguro;
- CSC/token e parâmetros de QR Code quando exigidos pela UF.

O Mosaico não calculará tributo por heurística. O backend validará o perfil
fiscal cadastrado, mas o contador continuará responsável pela classificação.

### Pedidos e Kanban

Todos os canais usam a mesma entidade de pedido. A origem é identificada por
`pos`, `whatsapp`, `manual` ou um canal futuro.

Estados de preparo/entrega:

1. `received` — recebido;
2. `preparing` — em preparo;
3. `ready` — pronto;
4. `out_for_delivery` — em trânsito;
5. `delivered` — entregue;
6. `cancelled` — cancelado, com motivo e auditoria.

Para retirada, `ready` pode seguir diretamente para `delivered` ou
`completed`, conforme a decisão do domínio. O histórico de transições nunca é
apagado. O pedido finalizado vai para o histórico, sem remoção do banco.

## 4. Atendimento WhatsApp

### Integração escolhida

Usar a WhatsApp Business Platform — Cloud API oficial da Meta. O Mosaico Food
será um consumidor da API e manterá um adaptador para que o domínio não dependa
de detalhes da Meta.

Não usar como dependência principal:

- automação de WhatsApp Web;
- QR code de sessão do usuário;
- bibliotecas que imitam cliente não oficial;
- tokens dentro do Electron;
- envio direto do renderer para `graph.facebook.com`.

### Componentes

- `whatsapp-provider`: cliente HTTP da Cloud API;
- `whatsapp-webhook`: verificação GET, recebimento POST e validação;
- `whatsapp-normalizer`: conversão de payload externo para evento interno;
- `conversation-service`: estado da conversa e modo automático/humano;
- `cart-service`: carrinho temporário persistido;
- `message-interpreter`: intenção e itens identificados;
- `message-composer`: mensagens em português com dados vindos do backend;
- `outbox-worker`: envio, retentativas e status;
- `template-service`: mensagens que dependam de template aprovado;
- `audit-service`: trilha de eventos sem segredos.

### Autenticação e credenciais

Na preparação inicial, usar o número de teste, WABA, phone number ID e token
da Meta somente em variáveis protegidas do backend. Na produção, usar a forma
de token e permissões exigidas pela versão vigente da Meta, preferencialmente
um System User Access Token ou fluxo oficial de onboarding adequado ao produto.

Credenciais mínimas a validar no onboarding:

- Meta App ID;
- Meta App Secret, quando exigido pelo fluxo;
- WABA ID;
- Phone Number ID;
- token de acesso de servidor;
- verify token do webhook;
- app secret para assinatura do webhook;
- versão da Graph API;
- permissões atualmente exigidas, incluindo envio de mensagens e gestão do
  WABA quando aplicável.

Esses valores ficam no secret manager ou no ambiente seguro do backend. A tela
do desktop mostra apenas estado da conexão e dados mascarados.

### Fluxo de webhook

1. Meta envia GET de verificação para o endpoint público.
2. O backend confere `hub.verify_token` e devolve `hub.challenge` somente se o
   token estiver correto.
3. Meta envia POST com eventos da WABA.
4. O backend valida origem, assinatura `X-Hub-Signature-256`, estrutura e
   `phone_number_id` autorizado.
5. O evento bruto mínimo necessário é salvo com chave idempotente.
6. A API responde rapidamente com sucesso após enfileirar o processamento.
7. O worker normaliza a mensagem, atualiza conversa e processa o carrinho.
8. Status de envio, entrega, leitura e falha atualizam a mensagem existente.

O webhook nunca cria pedido diretamente no handler HTTP. A criação passa por
serviço transacional que verifica confirmação, catálogo, preço, disponibilidade,
idempotência e permissão.

### Interpretação sem IA paga

O primeiro interpretador será determinístico e extensível:

1. normalizar Unicode, caixa, acentos, pontuação e espaços;
2. identificar idioma e tokens relevantes;
3. detectar intenção;
4. localizar quantidades escritas em algarismos ou palavras;
5. procurar nome exato, alias e sinônimo;
6. usar correspondência aproximada somente com limite seguro;
7. detectar adicionais, remoções e observações cadastradas;
8. consultar o catálogo e validar preço/disponibilidade no backend;
9. devolver resultado com confiança, ambiguidades e perguntas pendentes;
10. encaminhar para humano quando a confiança não for suficiente.

Intenções iniciais:

- `greeting`;
- `add_item`;
- `remove_item`;
- `change_quantity`;
- `ask_price`;
- `ask_availability`;
- `show_cart`;
- `confirm_order`;
- `reject_order`;
- `choose_pickup`;
- `choose_delivery`;
- `provide_address`;
- `ask_order_status`;
- `cancel_order`;
- `request_discount`;
- `request_human`;
- `unknown`.

A IA generativa poderá ser adicionada como classificadora auxiliar no futuro,
mas nunca poderá decidir sozinha preço, estoque, total, pagamento ou pedido.

### Carrinho conversacional

O carrinho tem dono, conversa, versão e expiração. Cada mudança gera histórico
e versão para impedir que webhooks fora de ordem sobrescrevam alterações novas.

Estados mínimos:

- `active`;
- `awaiting_clarification`;
- `awaiting_fulfillment`;
- `awaiting_confirmation`;
- `confirmed`;
- `expired`;
- `abandoned`;
- `converted`.

Fluxo obrigatório:

1. cliente menciona produtos;
2. backend valida itens e quantidades;
3. carrinho é atualizado;
4. sistema informa resumo e total calculado no backend;
5. sistema pergunta retirada ou entrega;
6. coleta endereço quando necessário;
7. sistema apresenta resumo final;
8. cliente confirma de forma inequívoca;
9. backend revalida preço, estoque e regras;
10. transação cria pedido oficial e eventos de estoque/financeiro;
11. sistema informa o número do pedido.

Antes da confirmação, "sim" só vale se houver uma pergunta de confirmação
pendente na mesma conversa. Depois da confirmação, alterações criam nova versão
ou solicitam atendimento humano conforme o estado do pedido.

### Exemplos de respostas

Para `"Quero três coxinhas e um refrigerante"`, o sistema deve usar somente
produtos encontrados e responder com o resumo validado. Se "refrigerante"
corresponder a mais de um produto, deve perguntar qual opção está disponível.

Para `"Tem pastel de carne?"`, deve consultar disponibilidade e preço atuais.
Para `"Pode colocar mais um pastel?"`, deve usar o contexto do carrinho e pedir
esclarecimento quando houver mais de um pastel possível.

Para `"Paguei no Pix"`, deve registrar a mensagem como informação recebida e
deixar o pagamento pendente até conciliação ou confirmação manual autorizada.

## 5. Central de Atendimento no desktop

O módulo `Atendimento` terá:

**Coluna esquerda**

- conversas recentes;
- pesquisa por nome, telefone ou número do pedido;
- não lidas;
- filtro automático/manual;
- prioridade;
- estado da conexão.

**Área central**

- histórico de mensagens;
- indicação de mensagens enviadas, entregues, lidas ou falhas;
- compositor manual;
- estado do atendimento;
- aviso de automação pausada;
- ação para assumir ou devolver o atendimento.

**Painel direito**

- cliente e telefone;
- carrinho atual e versão;
- produtos identificados;
- pedido associado;
- modalidade de entrega/retirada;
- pagamento;
- status do Kanban;
- ações rápidas.

Quando o modo humano estiver ativo, o worker automático não envia respostas de
negócio. Eventos recebidos continuam sendo armazenados para o funcionário não
perder contexto.

## 6. Notificações e tempo real

Mensagens novas, pedidos confirmados e falhas importantes devem atualizar a
interface sem exigir recarregamento completo.

- contador de não lidas por conversa;
- som configurável e botão de teste;
- toast ou banner persistente para pedido novo;
- badge no menu do Atendimento;
- alerta para falha de envio ou webhook;
- preferência por usuário e prioridade;
- chave idempotente por evento para evitar duplicação.

WebSocket ou SSE serve apenas para refletir eventos já persistidos. Se a conexão
em tempo real cair, o desktop consulta por cursor e reconcilia a lista.

## 7. Configurações da automação

Persistir no banco, por loja:

- automação ligada/desligada;
- boas-vindas;
- mensagem fora do expediente;
- horário e dias de funcionamento;
- mensagens de confirmação e status;
- tempo de expiração do carrinho;
- regras de entrega e retirada;
- limite de distância ou taxa de entrega;
- transferência para humano;
- política de reserva/baixa de estoque;
- sons, prioridades e notificações;
- idioma e formato monetário;
- aliases e termos de interpretação.

Mensagens editáveis nunca ficam fixas no código. Templates sujeitos às regras
da Meta possuem estado de aprovação e versão.

## 9. Segurança, LGPD e confiabilidade

- autenticação única com RBAC;
- autorização por organização/loja e função;
- webhook com verificação de token, assinatura e idempotência;
- rate limit e proteção contra replay;
- fila com backoff e limite de retentativas;
- dead-letter queue para falhas permanentes;
- auditoria para alterações de preço, estoque, pedido, pagamento e atendimento;
- logs estruturados sem token, corpo completo desnecessário ou dados sensíveis;
- criptografia em trânsito e em repouso;
- retenção configurável de conversas;
- exportação e exclusão controlada de dados pessoais;
- backup e restauração testados;
- health checks de backend, worker, banco e provedor.

## 10. Observabilidade

Métricas mínimas:

- latência do webhook;
- mensagens recebidas, enviadas, entregues e falhas;
- tamanho e idade da fila;
- taxa de interpretação ambígua;
- carrinhos expirados;
- pedidos confirmados por origem;
- tempo entre pedido recebido e início do preparo;
- erros de estoque e conflitos de preço;
- falhas de autenticação;
- disponibilidade do backend e da Meta.

Cada evento externo terá `provider_event_id`, e cada comando interno terá
`operation_id` e `correlation_id`.

## 11. Critério de pronto

O Mosaico Food só será considerado pronto para operação quando:

- os módulos administrativos funcionarem sem dados simulados;
- PDV e WhatsApp criarem pedidos pelo mesmo domínio;
- nenhum pedido definitivo nascer sem confirmação explícita;
- o carrinho sobreviver à reinicialização do desktop;
- webhooks duplicados não duplicarem mensagens ou pedidos;
- atendimento humano impedir respostas automáticas concorrentes;
- estoque, caixa e financeiro registrarem origem e auditoria;
- vendas elegíveis gerarem documento fiscal com autorização, rejeição,
  consulta, cancelamento e contingência testados em homologação;
- testes unitários e de integração passarem;
- o fluxo real com a Cloud API tiver sido executado;
- requisitos, custos e limitações vigentes da Meta estiverem registrados no
  checklist da integração.
