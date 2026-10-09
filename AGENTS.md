# Mosaico Food — instruções para agentes de código

## Arquitetura

- `apps/desktop`: Electron, React, TypeScript, Tailwind CSS e shadcn/ui;
- `apps/backend`: Next.js com App Router, TypeScript, Prisma e PostgreSQL;
- `packages/contracts`: schemas Zod, tipos e contratos compartilhados;
- `packages/domain`: regras puras compartilhadas quando não dependerem de
  banco, Electron ou Next.js.

O Electron não acessa PostgreSQL, Prisma ou segredos. O renderer conversa com o
backend por HTTP/WebSocket através do preload autorizado. A integração com a
Meta existe apenas no backend.

## Regras obrigatórias

- código em inglês e textos da interface em português;
- arquivos e pastas em kebab-case;
- componentes e tipos em PascalCase;
- funções e variáveis em camelCase;
- TypeScript strict, sem `any` na aplicação;
- respostas externas validadas em runtime com Zod;
- regras comerciais no backend ou em `packages/domain`, nunca em componentes;
- IDs em UUID e datas persistidas em UTC;
- exclusão lógica e auditoria onde o histórico comercial precisar ser preservado;
- nenhum token da Meta, senha ou segredo no Electron, no renderer ou no Git;
- nenhum acesso direto do frontend ao banco;
- nenhuma dependência de WhatsApp Web não oficial;
- não inventar produto, preço, estoque, desconto ou pagamento;
- pedidos do WhatsApp usam o mesmo domínio de pedidos do PDV;
- `order.status` e `payment.status` são estados independentes;
- mensagens duplicadas e webhooks repetidos devem ser idempotentes;
- não registrar conteúdo sensível desnecessário em logs.

## Organização esperada

```text
apps/
├── desktop/
│   ├── electron/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   └── components/
│   └── preload/
└── backend/
    └── src/
        ├── app/api/
        ├── features/
        └── lib/
packages/
├── contracts/
└── domain/
```

Use `features` para módulos de domínio, `app` para composição e rotas, e
`components/ui` para componentes visuais compartilhados. Não duplique Button,
Dialog, Table, estados de carregamento ou mensagens de erro.

## Segurança e privacidade

- autenticar e autorizar sempre no backend;
- criptografar segredos em um cofre ou secret manager;
- validar a assinatura dos webhooks da Meta;
- confirmar idempotência antes de criar pedido, venda, pagamento ou baixa;
- aplicar LGPD: finalidade, minimização, retenção, exportação e exclusão
  controlada;
- mascarar telefone e identificadores nos logs;
- tratar endereço e histórico de conversa como dados pessoais;
- o cliente confirma o pedido, mas o funcionário ou integração autorizada
  confirma o pagamento conforme a regra financeira;
- falhas do WhatsApp não podem apagar pedidos, vendas ou movimentações locais.

## Testes e revisão

Antes de concluir uma mudança, executar lint, typecheck, testes unitários,
testes de API e o fluxo afetado. Testar carregando, vazio, erro, sucesso,
sem permissão, mensagens duplicadas e indisponibilidade externa quando for
aplicável.

Uma integração do WhatsApp só pode ser marcada como funcional com um teste real
em número de teste ou número autorizado da Cloud API. Fixtures e mocks devem
ser identificados como testes; não são demonstração funcional.
