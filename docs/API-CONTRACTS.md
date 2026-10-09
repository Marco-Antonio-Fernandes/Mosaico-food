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
| Catálogo | `/api/v1/categories`, `/api/v1/products`, `/api/v1/product-aliases` |
| Estoque | `/api/v1/ingredients`, `/api/v1/stock`, `/api/v1/stock-movements` |
| Clientes | `/api/v1/customers`, `/api/v1/customers/{id}/addresses` |
| Crediário | `/api/v1/credit-accounts`, `/api/v1/credit-entries` |
| PDV/caixa | `/api/v1/sales`, `/api/v1/cash-registers`, `/api/v1/payments` |
| Pedidos | `/api/v1/orders`, `/api/v1/orders/{id}/status` |
| Atendimento | `/api/v1/conversations`, `/api/v1/messages`, `/api/v1/carts` |
| WhatsApp | `/api/v1/whatsapp/connection`, `/api/v1/webhooks/whatsapp/meta` |
| Fiscal | `/api/v1/fiscal/...` |
| Notificações | `/api/v1/notifications`, `/api/v1/realtime/cursor` |
| Relatórios | `/api/v1/dashboard`, `/api/v1/reports` |

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
