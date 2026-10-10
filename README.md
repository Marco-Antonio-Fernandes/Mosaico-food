# Mosaico Food

Software desktop para gestão de lanchonetes, com Windows como plataforma
prioritária e Linux como plataforma compatível. O produto reúne gestão interna,
PDV e pedidos recebidos pelo WhatsApp oficial.

## Status

Fundação do desktop iniciada pela task `MARCO-FOOD-00`: shell Electron,
navegação, tokens visuais, estados compartilhados e placeholders estão
preparados. O backend unificado está em `../mosaico-back/`, usando SQLite para
desenvolvimento, com os módulos Food e Life, clientes, crediário e
sincronização básica. O atendimento Food usa uma sessão exclusiva do WA-AKG:
o webhook recebe as mensagens, o catálogo e o estoque são mantidos no Mosaico
e as respostas são enviadas pelo backend. A integração oficial com a Cloud API
da Meta continua pendente e só será considerada concluída depois do teste real
no número autorizado.

## Desenvolvimento local

Na raiz do projeto:

```bash
npm install
npm run dev
```

Para subir o backend em outro terminal:

```bash
cp ../mosaico-back/.env.example ../mosaico-back/.env
npm run db:push
npm run dev:back
```

Validações disponíveis:

```bash
npm run typecheck
npm run build
npm run typecheck:back
```

O catálogo de produtos e a central de atendimento já usam o backend. O
atendimento recebe mensagens pelo webhook da sessão WA-AKG, reconhece nomes e
aliases cadastrados, responde pelo WhatsApp e só cria um pedido depois de
confirmação explícita; endereço de entrega, modalidade, variação do produto e
pedido para fritar/preparar na hora ficam salvos no pedido. A tela de Pedidos
também lê o backend e persiste as mudanças de etapa.
Para abrir no navegador, use `npm run dev:web` (porta padrão 5173).
O backend unificado está publicado em `https://mosaico.rotatix.com.br`,
com SQLite também no servidor nesta fase; PostgreSQL continua futuro.

Veja o [plano de frontend](docs/PLANO-FRONTEND-MOCK.md) e o
[status de frontend/backend/servidor](<../Servidor Rotatix/STATUS-MOSAICO.md>).
Tasks concluídas no escopo visual estão riscadas; integrações oficiais seguem abertas.

## Escopo da primeira versão

- aplicação desktop Electron para Windows/Linux;
- backend centralizado em Next.js, TypeScript e Prisma, com SQLite no
  desenvolvimento e PostgreSQL previsto para o servidor;
- autenticação, usuários, permissões e configurações da loja;
- produtos, categorias, sinônimos, ingredientes e fichas técnicas;
- estoque, movimentações, reserva e baixa;
- clientes, endereços, crediário e histórico;
- PDV, vendas, caixa, pagamentos e financeiro;
- emissão automática de documento fiscal, inicialmente NFC-e quando aplicável;
- pedidos e Kanban operacional;
- central de atendimento no desktop;
- recebimento, interpretação e envio de mensagens pelo WhatsApp Cloud API;
- carrinho conversacional com confirmação explícita;
- notificações, auditoria, filas, retentativas e idempotência;
- dashboards administrativos.

## Fora do MVP

Não haverá portal web público de pedidos nem aplicativo do cliente na primeira
versão. O backend manterá contratos que permitam adicionar esse canal no futuro.
Também não haverá dependência de fotos, catálogo externo, IA paga ou automação
baseada em sessão do WhatsApp Web.

## Documentação

- [Proposta para apresentar ao cliente](PROPOSTA-CLIENTE.md)
- [Plano técnico](docs/PLANO-TECNICO.md)
- [Modelo de dados](docs/DATA-MODEL.md)
- [Contratos da API](docs/API-CONTRACTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Checklist da integração oficial](docs/WHATSAPP-CHECKLIST.md)
- [Plano fiscal e checklist NFC-e](docs/FISCAL-NFC-E.md)
- [Responsabilidades do Marco](TASK-MARCO.md)
- [Responsabilidades do Pedro](TASK-PEDRO.md)
- [Regras de contribuição](AGENTS.md)

## Regra central do atendimento

Mensagens recebidas podem construir um carrinho temporário, mas nunca criam um
pedido definitivo antes de uma confirmação inequívoca do cliente. O backend é a
fonte de verdade para catálogo, preço, disponibilidade, total, pagamento e
permissões.
