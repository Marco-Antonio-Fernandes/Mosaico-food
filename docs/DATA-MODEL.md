# Mosaico Food — modelo de dados inicial

## Convenções

- PostgreSQL com Prisma;
- UUID em todas as entidades públicas;
- datas UTC em `timestamptz` e ISO 8601 na API;
- `created_at`, `updated_at` e `deleted_at` quando houver exclusão lógica;
- dinheiro em unidade mínima inteira (`amount_cents`) e `currency`;
- percentuais e quantidades com precisão decimal definida no schema;
- nenhuma senha, token, certificado ou chave privada em texto aberto;
- eventos e históricos são append-only sempre que tiverem valor fiscal ou
  financeiro;
- chaves únicas devem considerar `organization_id`/`store_id`.

## Núcleo administrativo

| Entidade | Responsabilidade | Campos relevantes |
|---|---|---|
| `organization` | conta empresarial | `id`, `name`, `status` |
| `store` | estabelecimento e UF | `id`, `organization_id`, `cnpj`, `state_registration`, `uf`, `timezone` |
| `user` | usuário do sistema | `id`, `organization_id`, `name`, `email`, `status` |
| `role` / `permission` | autorização | papel, ação e escopo |
| `audit_log` | auditoria | ator, ação, entidade, id, antes/depois resumido, `correlation_id` |
| `automation_setting` | mensagens e regras | loja, chave, valor validado, versão |
| `notification` | alertas internos | destinatário, tipo, prioridade, lida, `dedupe_key` |

## Catálogo e estoque

| Entidade | Responsabilidade |
|---|---|
| `product_category` | categorias do catálogo |
| `product` | nome, descrição, preço, disponibilidade, unidade, perfil fiscal |
| `product_alias` | sinônimos e frases reconhecidas |
| `product_option_group` / `product_option` | adicionais e escolhas |
| `ingredient` | item controlado no estoque |
| `recipe` / `recipe_item` | composição opcional do produto |
| `stock_balance` | saldo por item e local |
| `stock_movement` | entrada, saída, reserva, liberação, perda e ajuste |
| `stock_reservation` | reserva ligada a pedido |
| `price_history` | histórico de preços e vigência |

Regras:

- preço e disponibilidade são revalidados ao criar venda/pedido;
- `stock_movement` nunca é apagado;
- produto sem foto continua plenamente utilizável;
- alias pertence ao produto e tem normalização para busca;
- baixa e reserva seguem política da loja e não ficam dentro do interpretador.

## Clientes, pedidos e vendas

| Entidade | Responsabilidade |
|---|---|
| `customer` | nome, telefone normalizado, consentimentos e status |
| `customer_address` | endereços de retirada/entrega |
| `credit_account` | limite e saldo do crediário |
| `credit_entry` | débito, pagamento, estorno e ajuste |
| `order` | pedido unificado por canal |
| `order_item` | snapshot do produto, quantidade e preço |
| `order_status_history` | transições do Kanban |
| `sale` | venda oficial e vínculo com pedido/caixa |
| `sale_item` | snapshot fiscal/comercial da venda |
| `payment` | estado e meio de pagamento |
| `cash_register` | abertura e fechamento |
| `cash_movement` | entrada, saída, sangria e suprimento |

`order_item` e `sale_item` armazenam nome, unidade e preço no momento da
operação. Alterar o cadastro atual não reescreve histórico. `order.status`,
`payment.status`, `stock.status` e `fiscal.status` não devem ser condensados em
um único campo.

## Conversas e automação

| Entidade | Responsabilidade |
|---|---|
| `conversation` | telefone, modo automático/humano, estado e versão |
| `conversation_message` | mensagem recebida/enviada e status do provedor |
| `conversation_event` | transição, interpretação e auditoria resumida |
| `cart` | carrinho temporário, expiração e estado |
| `cart_item` | item identificado, quantidade, snapshot e origem da mensagem |
| `interpretation` | intenção, candidatos, confiança e pendências |
| `message_template` | template externo, idioma, versão e aprovação |
| `outbox_job` | envio, processamento e retentativas |
| `provider_event` | webhook externo e idempotência |
| `whatsapp_connection` | WABA, phone number ID e estado não secreto |

O corpo bruto de mensagem deve ter retenção configurável. Segredos e tokens não
entram em `conversation_message` nem `provider_event`.

## Fiscal

| Entidade | Responsabilidade |
|---|---|
| `fiscal_configuration` | CNPJ, IE, UF, série, ambiente e política |
| `fiscal_product_profile` | NCM, CEST, CFOP, CST/CSOSN e demais dados aprovados |
| `fiscal_document` | documento, modelo, número, série, chave, status e venda |
| `fiscal_document_item` | snapshot fiscal de cada item |
| `fiscal_event` | emissão, consulta, cancelamento, contingência e retorno |
| `fiscal_artifact` | XML, DANFE, QR Code e metadados de armazenamento |
| `fiscal_sequence` | controle de série/número por loja e ambiente |

Campos mínimos de `fiscal_document`:

```text
id
store_id
sale_id
order_id nullable
model
environment
series
number nullable
access_key nullable
provider_document_id nullable
status
issued_at nullable
authorized_at nullable
cancelled_at nullable
total_amount_cents
protocol nullable
rejection_code nullable
rejection_message_safe nullable
idempotency_key unique
created_at
updated_at
```

O XML e a representação auxiliar podem ficar em armazenamento de objetos
protegido, com hash e referência em `fiscal_artifact`. O banco registra o
histórico e metadados necessários para localizar o arquivo.

## Relacionamentos essenciais

```text
store ──< product ──< product_alias
  │          └── fiscal_product_profile
  ├──< customer ──< customer_address
  ├──< order ──< order_item ──> product
  │      └──< order_status_history
  ├──< sale ──< sale_item
  │      ├──< payment
  │      ├──< stock_reservation
  │      └──< fiscal_document ──< fiscal_event
  └──< conversation ──< conversation_message
               └──< cart ──< cart_item
```

## Invariantes

- uma mensagem externa com o mesmo `provider_event_id` é processada uma vez;
- um comando de criação com o mesmo `idempotency_key` retorna o mesmo resultado;
- carrinho pertence a uma única conversa e loja;
- pedido oficial pertence a um único cliente/telefone e canal;
- item vendido conserva o preço validado no momento;
- venda não pode ter dois documentos fiscais autorizados para a mesma emissão;
- documento autorizado não é editável;
- cancelamento fiscal cria evento e não apaga documento;
- pagamento confirmado não é excluído por conflito de sincronização;
- mudança de status do pedido gera histórico;
- modo humano impede outbox automático de resposta de negócio;
- exclusão lógica não quebra auditoria nem referência fiscal.

## Índices mínimos

- `customer(store_id, normalized_phone)`;
- `product(store_id, normalized_name, deleted_at)`;
- `product_alias(store_id, normalized_alias)`;
- `order(store_id, status, created_at)`;
- `conversation(store_id, normalized_phone)`;
- `conversation_message(conversation_id, provider_message_id)`;
- `provider_event(provider_event_id)`;
- `fiscal_document(store_id, status, created_at)`;
- `fiscal_document(store_id, access_key)`;
- `outbox_job(status, next_attempt_at)`.
