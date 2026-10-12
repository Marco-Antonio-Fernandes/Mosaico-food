# Mosaico Food

Software desktop para gestão de lanchonetes, com Linux e Windows como alvos.
O produto reúne gestão interna, PDV, produção, estoque e pedidos recebidos pelo
WhatsApp.

## Status

O desktop Electron/React, o backend unificado `../mosaico-back/`, catálogo,
estoque, receitas, produção, venda de balcão, assistente universal, pedidos e
atendimento WA-AKG já estão implementados. O desktop empacotado pode iniciar o
backend NestJS e o SQLite localmente. A transcrição local usa whisper.cpp; o
binário e o modelo precisam ser incluídos no empacotamento. A integração oficial
com a Cloud API da Meta continua pendente.

O `faster-whisper` instalado na virtualenv do backend não é usado pelo
instalador atual: ele baixa outro formato de modelo. Para o desktop, compile o
`whisper-server` do whisper.cpp e deixe o script baixar `ggml-tiny.bin`.

## Desenvolvimento local

Na raiz do projeto:

```bash
npm install
npm --prefix ../mosaico-back install
cp ../mosaico-back/.env.example ../mosaico-back/.env
npm run db:push
npm run dev
```

Para subir somente o backend em outro terminal:

```bash
npm run dev:back
```

Validações disponíveis:

```bash
npm run typecheck
npm run build
npm run typecheck:back
```

O catálogo, PDV e a central de atendimento usam o backend. O atendimento
recebe mensagens pelo webhook WA-AKG, reconhece nomes, aliases e variações,
separa estoque pronto de preparo na hora e só cria um pedido depois de
confirmação explícita. A tela de Pedidos persiste as mudanças de etapa e tenta
notificar o cliente.
Para abrir no navegador, use `npm run dev:web` (porta padrão 5173).
O backend unificado está publicado em `https://mosaico.rotatix.com.br`,
com SQLite também no servidor nesta fase; PostgreSQL continua futuro.

Veja o [handoff da implementação atual](docs/HANDOFF-IMPLEMENTACAO.md) antes
dos planos históricos. As integrações oficiais e os testes de produção seguem
abertos.

## Escopo da primeira versão

- aplicação desktop Electron para Windows/Linux;
- backend centralizado em NestJS, TypeScript e Prisma, com SQLite no
  desenvolvimento e no modo local do desktop;
- autenticação, usuários, permissões e configurações da loja;
- produtos, categorias, sinônimos, ingredientes e fichas técnicas;
- estoque, movimentações, reserva e baixa;
- clientes, endereços, crediário e histórico;
- PDV, vendas, caixa, pagamentos e financeiro;
- emissão automática de documento fiscal, inicialmente NFC-e quando aplicável;
- pedidos e Kanban operacional;
- central de atendimento no desktop;
- recebimento, interpretação e envio de mensagens pelo WA-AKG; Cloud API da
  Meta prevista para uma etapa futura;
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
- [Handoff da implementação atual](docs/HANDOFF-IMPLEMENTACAO.md)
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
