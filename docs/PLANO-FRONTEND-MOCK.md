# Plano de frontend — Mosaico Food
Atualizado em 09/10/2026. Protótipo visual navegável com dados fictícios autorizado pelo usuário.

## Direção de composição

Menu lateral único com vitral de hambúrguer, batatas e refrigerante; nome em texto, sem logo.
Tema escuro com âmbar/laranja, detalhes verdes e azuis. Sem faixa de mosaico no topo.
Menu em grade nas telas estreitas; sidebar com rolagem independente no desktop.
Indicadores em cards; tabelas com rolagem própria; filtros empilhados no celular.
Mocks identificados; não chamar backend nem provedores para experimentar a prévia.

## Mapa de telas já desenhado

| Atalho | Composição | Interação local entregue | Task responsável |
|---|---|---|---|
| Visão geral | Hero, indicadores, gráfico, período, avisos | Seleção de período/data; acesso à central | Pedro: dashboard |
| PDV | Catálogo + carrinho + quitação | Escolher somente pagamento, somente compra ou ambos; separar dívida, compra, troco e novo saldo | PEDRO-FOOD-02 |
| Pedidos | Kanban com cinco etapas | Avançar cartões; pagamento independente | PEDRO-FOOD-03 |
| Atendimento | Conversas + chat + carrinho | Trocar conversa, mensagem local e takeover visual | MARCO-FOOD-03 |
| Produtos | Grade por categoria + formulário | Busca, filtro e abrir cadastro | PEDRO-FOOD-01 |
| Estoque | Posição, movimentos, receita | Abas, filtros e rascunho de ficha | PEDRO-FOOD-01 |
| Clientes/crediário | Lista + detalhes + lançamentos | Buscar, filtrar, adicionar exemplo | PEDRO-FOOD-02 |
| Caixa/financeiro | KPIs + movimentos + caixa | Abas, rascunho e detalhe | PEDRO-FOOD-02 |
| Fiscal | Documentos + revisão + configuração | Filtros/detalhe; sem emissão real | PEDRO-FOOD-04 |
| Notificações | Lista de eventos | Marcar lida individual/todas | MARCO-FOOD-04 |
| Automação | Preferências + editor de mensagens | Alternar opções e rascunhos | MARCO-FOOD-04 |
| Offline | Fila + versões conflitantes | Simular envio e resolução | Marco + contrato Pedro |
| Configurações | Loja, equipe, som e integrações | Campos e preferências locais | MARCO-FOOD-01 |

## Entregue

- [x] ~~Composição inicial de todas as telas acima.~~
- [x] ~~Navegação no menu, componentes reutilizáveis e formulários mock.~~
- [x] ~~Separar estados de pedido/pagamento e indicar ausência de emissão fiscal.~~
- [x] ~~Sinalizar demonstração e interromper chamadas de health no modo mock atual.~~
- [x] ~~Ajustes responsivos no código.~~

## Próximas etapas

- [ ] Aprovação visual e testes da versão atual (não executados a pedido do usuário).
- [ ] Formulários completos de domínio; as prévias possuem campos representativos.
- [ ] Agregação por data/comparação histórica real; os gráficos ainda usam fixtures.
- [ ] Conectar clientes/crediário ao backend já existente.
- [ ] No PDV, iniciar o atendimento pela intenção `somente pagamento`,
  `somente compra` ou `pagamento + compra`; pagamento de dívida não pode criar
  venda de valor zero.
- [ ] Demais integrações, acessibilidade completa, validação e estados de erro reais.

Fixtures e cálculos de carrinho são apenas representação visual; não são a regra comercial.
Ao trocar de módulo/recarregar, alterações mock podem ser descartadas.
Login continua adiado; não adicionar barreira de autenticação ao protótipo.

## Arquivos de referência

- apps/desktop/src/app.tsx: navegação e seleção da tela.
- apps/desktop/src/features/prototype/food-prototype.tsx: composição por módulo.
- apps/desktop/src/components/shared/prototype-kit.tsx: lista, detalhes, editor, chat, preferências, notificações e offline.
- apps/desktop/src/components/shared/food-overview-page.tsx: dashboard.
- apps/desktop/public/mosaico-vitral.svg: arte lateral.

Backend/servidor: [status consolidado](<../../Servidor Rotatix/STATUS-MOSAICO.md>).
