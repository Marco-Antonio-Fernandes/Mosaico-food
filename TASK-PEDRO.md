# Mosaico Food — task do Pedro


## Andamento registrado — 09/10/2026

O protótipo frontend completo foi solicitado pelo usuário com dados mockados.
Esta decisão substitui, somente nesta prévia, a restrição anterior a dados fictícios.
Os requisitos integrais abaixo continuam valendo para a implementação real.

### Entregas já realizadas

- [x] ~~Visão geral com indicadores, gráfico e filtros visuais (mock).~~
- [x] ~~Catálogo, categorias, busca, ficha técnica e estoque (mock).~~
- [x] ~~PDV com carrinho, quantidades, pagamento e fechamento simulado.~~
- [x] ~~Clientes, crediário, caixa e financeiro (mock).~~
- [x] ~~Pedidos em Kanban com mudança local de etapa.~~
- [x] ~~Fiscal com documentos, revisão e configuração visual (mock).~~
- [x] ~~Backend inicial de clientes/conta de crediário/lançamentos e sync restrito implementado.~~

### Pendências desta responsabilidade

- [ ] Ligar clientes e crediário ao backend existente.
- [ ] Persistência real de produtos, ingredientes, estoque, vendas e pedidos.
- [ ] FiscalProvider, emissão/consulta/cancelamento/XML/DANFE e homologação.
- [ ] Eventos/contratos finais, auditoria, idempotência concorrente e validação ponta a ponta.

**Tasks principais: parciais.** Uma tela mock concluída não conclui seu backend.
Não foram executados novos testes/builds nesta etapa, conforme solicitado.

Veja [status consolidado de frontend, backend e servidor](<../Servidor Rotatix/STATUS-MOSAICO.md>)
e [plano das telas](docs/PLANO-FRONTEND-MOCK.md).


## Responsabilidade

O Pedro é responsável por:

- catálogo, produtos, categorias, aliases e preços;
- ingredientes, receitas e estoque;
- clientes, endereços e crediário;
- PDV, vendas, caixa, pagamentos e financeiro;
- pedidos, itens, Kanban e histórico de status;
- dashboard comercial;
- domínio e persistência fiscal;
- mapeamento de venda para NFC-e/NF-e quando aplicável;
- contrato `FiscalProvider`, emissão, consulta, cancelamento e contingência.

O Pedro não duplica autenticação, transporte da Meta, central de atendimento ou
notificações. Consome os contratos do Marco.

## PEDRO-FOOD-01 — Catálogo e estoque

Implementar produtos sem exigir foto, aliases normalizados, preço, categoria,
disponibilidade, ingredientes, receitas, saldo, reserva, baixa e histórico.

O backend sempre revalida nome, preço e estoque. O interpretador nunca cria
produto ou altera preço.

## PEDRO-FOOD-02 — Clientes, PDV e financeiro

Implementar clientes, telefone normalizado, endereços, crediário, vendas,
pagamentos, caixa, despesas e conciliação manual. Pagamento confirmado exige
fluxo autorizado; mensagem do cliente não basta.

### Crediário e sincronização básica

Quando o modo offline comercial for implementado, o crediário será uma das
entidades básicas sincronizáveis com o banco central. A operação poderá levar
para a cópia local somente:

- `customer_id` e identificação mínima autorizada do cliente;
- `credit_account_id`, limite configurado e saldo atual;
- lançamentos de débito, pagamento, estorno e ajuste com seus identificadores;
- `version`, `updated_at`, `deleted_at` quando aplicável e `operation_id`.

O servidor continua sendo a fonte de verdade. Lançamentos locais devem ser
idempotentes, auditáveis e nunca podem sobrescrever silenciosamente um saldo ou
pagamento confirmado; conflitos financeiros exigem decisão explícita.

## PEDRO-FOOD-03 — Pedidos

Implementar entidade unificada, itens com snapshot, origem, confirmação,
cancelamento, Kanban, status independentes de pagamento/estoque/fiscal e
eventos para o Marco.

Pedido vindo do WhatsApp só nasce depois de confirmação inequívoca e revalidação
transacional.

## PEDRO-FOOD-04 — Fiscal

Implementar:

- `fiscal_configuration` e perfil fiscal de produto;
- contrato `FiscalProvider` sem acoplamento ao PDV;
- emissão automática em homologação e produção autorizada;
- consulta depois de timeout;
- rejeição e reprocessamento;
- cancelamento, eventos permitidos e auditoria;
- XML, protocolo, chave, QR Code e DANFE;
- numeração, série e idempotência;
- contingência apenas quando aplicável e configurada;
- integração com pedido, venda, estoque e financeiro sem misturar estados.

Não escolher classificação tributária por heurística. Exigir configuração
revisada pelo contador e bloquear produção para produto sem dados fiscais
obrigatórios.

## PEDRO-FOOD-05 — Contratos e eventos

Entregar ao Marco:

- `order.confirmed`;
- `order.status_changed`;
- `payment.updated`;
- `fiscal.authorized`, `fiscal.rejected` e `fiscal.cancelled`;
- contratos de leitura de pedido, cliente, total e documento fiscal;
- permissões necessárias para cada tela.

## Testes

- catálogo sem foto;
- alias, acento, ambiguidade e produto indisponível;
- pedido sem confirmação não criado;
- revalidação de preço/estoque;
- pagamento não confundido com confirmação;
- webhook/evento duplicado não duplica pedido ou documento;
- emissão autorizada em homologação;
- rejeição, consulta, cancelamento e contingência;
- XML/DANFE protegido por permissão;
- timeout não gera segunda nota.
