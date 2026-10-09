# Mosaico Food — task do Marco


## Andamento registrado — 09/10/2026

O protótipo frontend completo foi solicitado pelo usuário com dados mockados.
Esta decisão substitui, somente nesta prévia, a restrição anterior a dados fictícios.
Os requisitos integrais abaixo continuam valendo para a implementação real.

### Entregas já realizadas

- [x] ~~Shell de navegação e execução web de desenvolvimento (fundação Electron/preload existente).~~
- [x] ~~Vitral temático no menu inteiro, sem logo e sem barra extra.~~
- [x] ~~Atendimento em três áreas com mensagens locais e modo humano/automático (mock).~~
- [x] ~~Central de notificações, automação e preferências (mock).~~
- [x] ~~Painel offline e conflitos (mock).~~
- [x] ~~Backend compartilhado, health check, CORS e configuração inicial de deploy.~~

### Pendências desta responsabilidade

- [ ] Login/sessão/permissões, atualização e distribuição desktop.
- [ ] Cloud API oficial, webhooks, fila, envio/recebimento e takeover reais.
- [ ] Notificações nativas/sons/tempo real e preferências persistidas.
- [ ] Sync offline confiável e resolução de conflitos; integração real com fiscal.

**Tasks principais: parciais.** Uma tela mock concluída não conclui seu backend.
Não foram executados novos testes/builds nesta etapa, conforme solicitado.

Veja [status consolidado de frontend, backend e servidor](<../Servidor Rotatix/STATUS-MOSAICO.md>)
e [plano das telas](docs/PLANO-FRONTEND-MOCK.md).


## Responsabilidade

O Marco é responsável por:

- shell Electron, preload, atualização e notificações do desktop;
- autenticação, sessão, usuários e permissões;
- comunicação com o WhatsApp Cloud API;
- webhooks, fila, outbox e retentativas de mensagens;
- central de atendimento e takeover humano;
- notificações em tempo real e preferências;
- configurações de automação;
- observabilidade da integração externa;
- transporte seguro dos contratos definidos com o Pedro.

O Marco não altera diretamente regras de catálogo, estoque, venda, financeiro,
pedido ou fiscal do Pedro. Consome os contratos e eventos documentados.

## Ordem de início

O Marco começa pelo layout base do desktop. As telas de domínio do Pedro devem
usar esse shell, a mesma navegação e os mesmos estados visuais. Enquanto o
backend ainda não estiver disponível, a interface deve usar estados vazios e
placeholders claramente identificados, sem inventar produtos, preços, estoque,
pedidos ou pagamentos.

## MARCO-FOOD-00 — Layout base e fundação visual

Implementar a primeira versão do shell do Electron e da interface React para
servir de base aos módulos do Mosaico Food.

Entregas:

- shell da aplicação com menu lateral, cabeçalho, área de conteúdo e rodapé de
  status da conexão;
- navegação inicial para dashboard, produtos, estoque, pedidos, atendimento,
  caixa/financeiro, fiscal e configurações;
- rotas ou telas de placeholder para áreas ainda não implementadas, sem dados
  comerciais fictícios;
- tokens visuais centralizados para tipografia, cores, espaçamento, bordas,
  elevação, foco e estados de sucesso, alerta, erro e indisponibilidade;
- componentes compartilhados de composição e feedback, incluindo PageHeader,
  LoadingState, EmptyState, ErrorState, PermissionDeniedState, ConnectionStatus
  e confirmação de ação destrutiva;
- comportamento responsivo para a janela do desktop, teclado, foco visível,
  contraste e navegação acessível;
- integração do shell com o estado real de conexão quando o contrato existir,
  sem indicar sucesso local enquanto o backend estiver indisponível.

Regras:

- regras de negócio ficam fora do layout e dos componentes visuais;
- o renderer não acessa banco, segredo ou integração externa;
- componentes repetidos devem ficar em `components/ui` ou `components/shared`;
- dados de demonstração só podem existir em testes ou fixtures identificadas;
- a identidade visual definitiva deve ser aplicada por tokens, não por estilos
  isolados em cada tela.

Critérios de aceite:

- a aplicação abre no shell e todas as áreas previstas podem ser acessadas;
- cada tela de placeholder informa claramente que ainda está em construção;
- loading, vazio, erro, sem permissão e indisponibilidade têm apresentação
  consistente;
- o layout funciona em janela estreita sem perder navegação ou ações;
- Pedro consegue iniciar as telas de catálogo, estoque, pedidos e financeiro
  reutilizando o shell sem criar uma segunda navegação.

### Backend inicial para desenvolvimento

Como parte da fundação, preparar `../mosaico-back/` com Next.js, Prisma e
SQLite para desenvolvimento local e para subir em um servidor de testes.

Entregas iniciais:

- `GET /api/health` com indicação de serviço ativo e banco configurado,
  conectado ou indisponível;
- cadastro e consulta básica de clientes;
- conta de crediário por cliente, lançamentos em centavos e saldo calculado no
  backend;
- `Idempotency-Key` obrigatório para lançamento de débito, pagamento ou estorno;
- `GET /api/v1/sync/bootstrap`, `GET /api/v1/sync/pull` e
  `POST /api/v1/sync/push` para leitura de clientes, contas e lançamentos, com
  envio inicial de lançamentos de crediário e operações versionadas;
- CORS para o desktop local durante o desenvolvimento;
- sem login nesta fase. A API fica aberta somente com `NODE_ENV=development`;
  produção deverá exigir autenticação antes de receber dados reais.

O SQLite é uma escolha provisória de desenvolvimento. Os contratos devem
continuar independentes do banco para permitir a migração posterior para
PostgreSQL.

## MARCO-FOOD-01 — Desktop e conta

Implementar janela desktop, navegação, login, logout, expiração, bloqueio,
permissões, atualização e tratamento de indisponibilidade do backend.

Regras:

- nenhum token da Meta ou certificado chega ao renderer;
- preload expõe somente métodos autorizados;
- chamadas passam pelo backend;
- estado de conexão é visível e não inventa sucesso local.

## MARCO-FOOD-02 — WhatsApp oficial

Implementar o adaptador da Cloud API e endpoints:

- verificação GET do webhook;
- recebimento POST e assinatura;
- assinatura da WABA quando configurada;
- envio de mensagens;
- recebimento de texto e eventos suportados;
- status sent/delivered/read/failed;
- idempotência por evento e mensagem;
- retentativas com backoff;
- dead-letter e alerta.

Não usar automação de WhatsApp Web ou sessão via QR code como dependência.

## MARCO-FOOD-03 — Atendimento

Implementar lista de conversas, busca, não lidas, histórico, compositor,
cliente, carrinho, pedido associado, modo automático/manual e ações de assumir,
pausar e devolver atendimento.

Quando a conversa estiver em modo humano, nenhum worker poderá enviar resposta
automática de negócio. Mensagens recebidas continuam registradas.

## MARCO-FOOD-04 — Automação e notificações

Implementar configurações persistidas, mensagens parametrizadas, horário de
funcionamento, expiração de carrinho, notificações do desktop, sons,
WebSocket/SSE e reconciliação por cursor.

O Marco pode publicar eventos de mensagem, conversa e notificação. O pedido,
estoque e fiscal são alterados pelo módulo dono, via API/evento.

## MARCO-FOOD-05 — Integração com fiscal

O Marco não define CFOP, NCM, CST/CSOSN, regime ou momento legal da emissão.
Ele deverá:

- mostrar o estado fiscal retornado pela API;
- notificar autorização, rejeição, contingência e erro;
- permitir abrir XML/DANFE apenas com permissão;
- impedir que uma falha de WhatsApp seja tratada como falha fiscal;
- enviar comprovante por WhatsApp somente quando o módulo fiscal autorizar e a
  política do canal permitir.

## Contratos entregues ao Pedro

- eventos de pedido confirmado e status alterado;
- eventos de mensagens e takeover;
- formato de notificação;
- contrato de autenticação e permissão;
- health status da Meta;
- nenhum dado fiscal ou comercial deve ser inferido pelo frontend.

## Testes

- webhook válido, inválido, duplicado e fora de ordem;
- assinatura incorreta;
- falha, timeout e retentativa do envio;
- atendimento humano sem resposta automática concorrente;
- reconexão do desktop;
- notificação sem duplicidade;
- acesso negado a XML, DANFE e configurações.
