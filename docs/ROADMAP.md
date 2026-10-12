# Mosaico Food — roadmap

## Andamento em 11/10/2026

- [x] ~~Fundação visual, shell e execução web.~~
- [x] ~~Catálogo Food, estoque, receitas, produção, venda de balcão e assistente universal.~~
- [x] ~~Backend único mosaico-back com SQLite, clientes, crediário e sync inicial.~~
- [x] ~~Deploy via systemd/Nginx/Cloudflare e health com banco conectado, confirmado pelo usuário.~~
- [x] ~~Atendimento Food pelo WA-AKG, carrinho, confirmação e status de pedido.~~
- [x] ~~Empacotamento Electron preparado para Linux/Windows e voz local Whisper.~~
- [ ] Testes de aceitação em máquina limpa e pacote completo com binário/modelo Whisper.
- [ ] Sincronização Food entre SQLite local e backend remoto.
- [ ] Login, permissões, WhatsApp Cloud API oficial, fiscal e atualizações desktop.

As fases abaixo são histórico de planejamento. O estado funcional deve ser
conferido em [HANDOFF-IMPLEMENTACAO.md](HANDOFF-IMPLEMENTACAO.md). Ainda há
pendências de integração, segurança e testes; a existência de uma tela não
significa que todos os cenários de produção estejam validados.

As fases mantêm a ordem de dependências. A emissão fiscal foi incluída sem
remover os módulos administrativos e sem depender de credenciais externas para
começar o desenvolvimento.

## Fase 1 — Fundação

- monorepositório e CI;
- Electron Windows/Linux e layout base do desktop;
- Next.js backend;
- PostgreSQL, Prisma e migrations;
- autenticação, organizações, lojas e permissões;
- design system, componentes compartilhados e estados de interface;
- contratos Zod, erros, eventos e idempotência;
- fila/outbox e observabilidade básica;
- interfaces `WhatsAppProvider` e `FiscalProvider`, com adaptadores fake apenas
  para testes.

**Saída:** aplicação autenticada e backend com contratos, banco e workers,
sem declarar integrações externas funcionais.

## Fase 2 — Gestão principal

- categorias, produtos, aliases e preços;
- ingredientes, receitas e estoque;
- clientes, endereços e crediário;
- PDV, vendas, caixa e pagamentos;
- financeiro, despesas e dashboards básicos;
- perfis fiscais dos produtos e configuração fiscal da loja;
- telas administrativas com carregando, vazio, erro e permissão.

**Saída:** gestão interna utilizável sem WhatsApp, portal ou dados simulados.

## Fase 3 — Pedidos

- entidade única de pedidos por canal;
- itens com snapshot de preço;
- Kanban e histórico de status;
- reservas/baixas de estoque;
- notificações internas;
- cancelamento e alteração auditáveis;
- estado fiscal associado à venda sem criar documento para rascunho.

**Saída:** PDV e atendimento manual conseguem operar pedidos no mesmo domínio.

## Fase 3.5 — Fiscal em homologação

- confirmação do tipo de documento com contador;
- cadastro de CNPJ, IE, UF, regime, série e perfil de produto;
- escolha do provedor ou decisão de integração direta;
- integração do `FiscalProvider`;
- emissão, consulta, rejeição e cancelamento em homologação;
- XML, DANFE/QR Code e auditoria;
- fila, retentativa, consulta após timeout e idempotência;
- contingência conforme UF e orientação fiscal;
- testes reais de homologação.

**Saída:** emitir em homologação, com documentação por loja, sem produção
liberada automaticamente.

## Fase 4 — WhatsApp

- criação do Meta App/WABA e número de teste;
- autenticação segura no backend;
- webhook GET/POST, assinatura e validação;
- assinatura da WABA;
- envio e recebimento de texto;
- status de envio, entrega, leitura e falha;
- histórico de conversa e central de atendimento;
- takeover humano e notificações em tempo real.

**Saída:** mensagens reais entram e saem pelo canal oficial; ainda sem afirmar
que o interpretador completo está pronto.

## Fase 5 — Pedidos automáticos

- normalização de mensagens;
- intenções, quantidades, aliases e ambiguidades;
- carrinho persistido e expirável;
- retirada, delivery e endereço;
- resumo, confirmação inequívoca e criação idempotente;
- integração com estoque, pedido, financeiro e fiscal;
- testes com mensagens naturais;
- revalidação de preço e disponibilidade no momento da confirmação.

**Saída:** o cliente consegue montar e confirmar pedido pelo WhatsApp sem portal.

## Fase 6 — Automação operacional

- mensagens de boas-vindas e fora do expediente;
- mensagens de pedido recebido, preparo, pronto, trânsito e entrega;
- envio opcional de comprovante/documento fiscal;
- configurações administrativas persistidas;
- filas, retentativas e dead-letter;
- métricas de interpretação e conversão;
- exceções, mensagens repetidas, fora de ordem e produtos indisponíveis;
- revisão de custos e limites atuais da Meta.

**Saída:** operação híbrida com automação controlável, auditável e observável.

## Fase 7 — Evolução

- IA auxiliar com validação obrigatória do backend;
- portal web futuro usando os mesmos contratos;
- novos provedores fiscais;
- integração bancária e conciliação;
- novos canais de pedido;
- modo offline comercial, com regras de conflito;
- relatórios avançados e multi-loja.

## Portões de liberação

### Antes de homologação

- perfil fiscal revisado pelo contador;
- credenciais somente no backend;
- teste de emissão, rejeição e cancelamento;
- nenhuma dependência de mock em código de produção.

### Antes de produção fiscal

- empresa credenciada e habilitada conforme a UF;
- certificado/credencial válido;
- série e numeração conferidas;
- ambiente de produção configurado;
- contingência documentada;
- backup de XML e DANFE testado;
- permissões fiscais restritas;
- teste controlado com o responsável da loja.

### Antes de produção WhatsApp

- Meta App e WABA autorizados;
- webhook público HTTPS validado;
- token de produção e permissões revisados;
- templates necessários aprovados;
- teste real de mensagem, status, duplicidade e takeover;
- custos e limites atuais registrados.
