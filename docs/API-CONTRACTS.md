# Mosaico Food — contratos de API

Este documento define o contrato inicial. O schema Zod compartilhado em
`packages/contracts` será a fonte executável; qualquer mudança deve atualizar
este documento, testes e consumidores.

## Convenções comuns

### Autenticação

Todas as rotas privadas usam sessão/token do usuário do Mosaico. O backend
valida organização, loja, papel e permissão. O Electron não recebe credencial
da Meta nem credencial fiscal.

### Resposta de sucesso

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "occurredAt": "2026-10-08T12:00:00.000Z"
  }
}
```

### Resposta de erro

```json
{
  "error": {
    "code": "ORDER_CONFIRMATION_REQUIRED",
    "message": "Confirme o pedido antes de continuar.",
    "fields": [],
    "requestId": "uuid"
  }
}
```

Não retornar stack trace, SQL, token, certificado, conteúdo interno do
provedor ou dado pessoal além do necessário.

### Idempotência e concorrência

Comandos de criação e efeitos externos exigem `Idempotency-Key`. O backend
persiste a chave, resultado e status. Atualizações mutáveis podem exigir
`If-Match` ou `version`. Uma repetição devolve o resultado anterior ou conflito
explícito; nunca cria uma segunda venda, mensagem, nota ou baixa.

## Rotas por módulo

| Módulo | Rotas previstas |
|---|---|
| Conta | `/api/v1/auth`, `/api/v1/users`, `/api/v1/roles` |
| Catálogo | `/api/v1/food/products`, `/api/v1/food/products/{id}` |
| Estoque | `/api/v1/ingredients`, `/api/v1/stock`, `/api/v1/stock-movements` |
| Clientes | `/api/v1/customers`, `/api/v1/customers/{id}/addresses` |
| Crediário | `/api/v1/credit-accounts`, `/api/v1/credit-entries` |
| PDV/caixa | `/api/v1/sales`, `/api/v1/cash-registers`, `/api/v1/payments`, `/api/v1/checkouts` |
| Pedidos | `/api/v1/orders`, `/api/v1/orders/{id}/status` |
| Atendimento | `/api/v1/food/conversations`, `/api/v1/food/conversations/{id}/messages` |
| WhatsApp | `/api/v1/whatsapp/connection`, `/api/v1/webhooks/whatsapp/meta` |
| Fiscal | `/api/v1/fiscal/...` |
| Notificações | `/api/v1/notifications`, `/api/v1/realtime/cursor` |
| Relatórios | `/api/v1/dashboard`, `/api/v1/reports` |
| Automação Food | `/api/v1/food-automation/status`, `/api/v1/food-automation/config`, `/api/v1/food-automation/run` |

### Backend inicial em desenvolvimento

O backend executável fica em `../mosaico-back/` e usa SQLite. Nesta
fase de desenvolvimento não há login: as rotas privadas ficam abertas apenas
quando `NODE_ENV=development`. Antes de expor o serviço publicamente, deve ser
implementada autenticação e autorização completas.

Rotas já preparadas:

- `GET /api/health`;
- `GET/POST /api/v1/customers`;
- `GET /api/v1/customers/{id}`;
- `GET/POST /api/v1/credit-entries`;
- `GET /api/v1/sync/bootstrap`;
- `GET /api/v1/sync/pull?cursor=...`;
- `POST /api/v1/sync/push`;
- `POST /api/v1/sync/resolve-conflict`, reservado para a próxima etapa.

Os valores do crediário são inteiros em centavos. O banco centraliza o saldo e
as operações de sincronização; o cliente offline nunca deve sobrescrever um
pagamento confirmado sem conflito explícito. O `sync/push` inicial aceita
`credit_entry/create`; edição offline de clientes será adicionada depois.

## Atendimento presencial: pagamento, compra ou os dois

O caixa deve iniciar um atendimento com uma intenção explícita: `credit_payment`,
`sale` ou `credit_payment_and_sale`. A intenção não substitui os lançamentos
reais; serve para impedir que um pagamento de dívida seja confundido com uma
venda.

### `POST /api/v1/checkouts`

Cria o fechamento atômico de uma visita presencial. O cliente é obrigatório
quando houver pagamento de crediário. Para `credit_payment`, `items` fica vazio;
para `sale`, `creditPaymentCents` é zero; para o caso combinado, os dois podem
ser preenchidos.

```json
{
  "intent": "credit_payment_and_sale",
  "customerId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 2, "options": [] }
  ],
  "creditPaymentCents": 5000,
  "salePayments": [
    { "method": "pix", "amountCents": 1800 }
  ],
  "salePaymentMethod": "cash",
  "idempotencyKey": "uuid"
}
```

O backend deve revalidar saldo, preço, estoque, caixa e permissões dentro da
transação. O retorno informa o `checkout`, o lançamento de pagamento da dívida
(quando houver), a venda (quando houver), o novo saldo e os movimentos de caixa.
Não é permitido transformar o pagamento da dívida em desconto da compra nem
criar venda de valor zero. Se a mesma chave for reenviada, o resultado original
é devolvido.

Casos mínimos:

- `credit_payment`: baixa o saldo pelo valor recebido e não cria venda, pedido,
  estoque ou documento fiscal;
- `sale`: cria somente a venda e seus pagamentos;
- `credit_payment_and_sale`: cria ambos, com valores e meios separados, ou
  desfaz tudo em caso de erro.

Se a compra for lançada no crediário, o débito da venda aumenta o saldo depois
da quitação registrada, sem misturar os dois lançamentos.

## Pedido e confirmação

### `POST /api/v1/orders`

Cria pedido oficial a partir de PDV, atendimento humano ou conversão de
carrinho já confirmado. Nunca aceita somente `text` como autoridade comercial.

```json
{
  "source": "whatsapp",
  "customerId": "uuid",
  "conversationId": "uuid",
  "cartId": "uuid",
  "fulfillment": "pickup",
  "items": [
    { "productId": "uuid", "quantity": "2", "options": [] }
  ],
  "paymentMethod": "pix"
}
```

O backend reconsulta produto, preço, disponibilidade, regras de entrega,
confirmação do carrinho e permissão. Responde com pedido, total, versão,
`paymentStatus`, `stockStatus` e `fiscalStatus`.

### `PATCH /api/v1/orders/{id}/status`

Recebe `nextStatus`, motivo opcional e versão. O backend valida transição,
registra `order_status_history`, emite notificação e agenda mensagem externa
quando permitida.

## Conversas e carrinho

### `POST /api/v1/carts/{id}/messages`

Rota interna para processar mensagem já normalizada. Retorna:

```json
{
  "data": {
    "conversationState": "awaiting_confirmation",
    "cart": { "id": "uuid", "version": 3, "items": [], "totalCents": 2000 },
    "interpretation": {
      "intent": "add_item",
      "confidence": "high",
      "needsClarification": false
    },
    "outgoingMessages": []
  }
}
```

`outgoingMessages` contém texto gerado com dados validados; ele não autoriza
criação de pedido por si só.

### `POST /api/v1/carts/{id}/confirm`

Exige estado `awaiting_confirmation`, versão esperada e confirmação inequívoca
registrada. Executa transação que revalida carrinho e cria um pedido. Se houver
mudança de preço ou estoque, responde `409 CART_REQUIRES_REVIEW` e não cria o
pedido.

## Webhook Meta

### `GET /api/v1/webhooks/whatsapp/meta`

Valida `hub.mode`, `hub.verify_token` e devolve `hub.challenge` em texto quando
o token estiver correto. Caso contrário, `403`.

### `POST /api/v1/webhooks/whatsapp/meta`

Recebe o envelope oficial. O backend:

- valida assinatura e `phone_number_id`;
- valida payload com Zod;
- grava `provider_event_id` de forma idempotente;
- enfileira processamento;
- devolve `200` rapidamente.

Mensagens e status não devem ser processados dentro de uma requisição que possa
expirar. Webhook inválido não deve ser aceito como mensagem do cliente.

## Emissão fiscal

### `POST /api/v1/sales/{saleId}/fiscal-issue`

Solicita emissão para venda elegível. Exige permissão fiscal e `Idempotency-Key`.
Retorna `202` quando enfileirada ou `200` quando o provedor concluir
sincronamente.

```json
{
  "data": {
    "fiscalDocumentId": "uuid",
    "status": "pending",
    "saleId": "uuid",
    "environment": "homologation"
  }
}
```

### `GET /api/v1/fiscal/documents/{id}`

Retorna status, série, número, chave, protocolo, motivo seguro de rejeição,
datas e links autenticados de XML/DANFE. Não retorna certificado ou token.

### `POST /api/v1/fiscal/documents/{id}/refresh`

Consulta o provedor/SEFAZ com idempotência e atualiza o documento. Usado depois
de timeout ou falha de comunicação, antes de tentar nova emissão.

### `POST /api/v1/fiscal/documents/{id}/cancel`

Exige motivo, permissão e validação do prazo/regra do provedor. Cria evento de
cancelamento; não apaga o documento autorizado.

## Eventos internos

Eventos mínimos:

- `order.confirmed`;
- `order.status_changed`;
- `payment.updated`;
- `stock.reservation_created`;
- `conversation.message_received`;
- `conversation.transferred_to_human`;
- `fiscal.issue_requested`;
- `fiscal.authorized`;
- `fiscal.rejected`;
- `fiscal.cancelled`;
- `notification.created`.

Todo evento tem `eventId`, `eventType`, `aggregateId`, `organizationId`,
`occurredAt`, `version`, `correlationId` e `idempotencyKey`.

## Integração de teste com WA-AKG

Durante o teste atual, o atendimento usa uma sessão exclusiva do WA-AKG. O
Mosaico Food mantém clientes, conversas, catálogo, estoque e pedidos no próprio
backend; o WA-AKG é usado somente para receber o webhook e enviar mensagens.

- `GET /api/v1/food/products` lista o catálogo persistido;
- `POST /api/v1/food/products` e `PATCH /api/v1/food/products/{id}` cadastram e atualizam o produto-base,
  sabor opcional, aliases, preço, estoque e a opção de preparar/fritar na hora;
- `POST /api/v1/food/sales` registra a venda de balcão com personalização por item,
  adicionais/remoções justificadas e marcação de brinde;
- `GET /api/v1/food/conversations` lista os atendimentos;
- `GET/POST /api/v1/food/conversations/{id}/messages` lê e envia mensagens;
- `PATCH /api/v1/food/conversations/{id}/mode` assume ou devolve a automação;
- `POST /api/v1/whatsapp/webhook` recebe eventos assinados da sessão.

- `GET /api/v1/food-automation/status` retorna o estado da automação;
- `PATCH /api/v1/food-automation/config` recebe `{ "enabled": true }` ou
  `{ "enabled": false }`;
- `POST /api/v1/food-automation/run` executa uma rodada de leitura e resposta.
- `GET /api/v1/food/orders` lista os pedidos confirmados;
- `PATCH /api/v1/food/orders/{id}/status` atualiza a etapa operacional do pedido.

A rodada ignora mensagens antigas conforme `FOOD_AUTOMATION_MAX_MESSAGE_AGE_MINUTES`,
grava a idempotência localmente e só cria o pedido depois da confirmação do
cliente. As variáveis `WA_AKG_API_KEY` e `WA_AKG_WEBHOOK_SECRET` ficam somente
no backend.

O fluxo reconhece o produto-base mesmo quando o operador digita apenas parte do
nome, separa o sabor como uma escolha própria (por exemplo, Esfirra → Carne),
pergunta se o cliente prefere entrega ou retirada e registra a escolha de
fritar/preparar na hora dentro do item do pedido.

## Permissões mínimas

- `products.read/write`;
- `inventory.read/write/adjust`;
- `customers.read/write`;
- `orders.read/write/confirm/cancel`;
- `payments.read/write/confirm`;
- `cash.open/close/move`;
- `conversations.read/reply/takeover`;
- `automation.read/write`;
- `fiscal.read/configure/issue/cancel`;
- `reports.read`;
- `audit.read`.
