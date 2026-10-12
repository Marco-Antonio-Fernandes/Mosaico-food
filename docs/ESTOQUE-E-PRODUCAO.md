# Estoque e produção

O cadastro tem três tipos: comprado para revenda, produzido com receita e
ingrediente. Ingredientes são controlados em gramas, mililitros ou unidades;
não aparecem como itens vendáveis no atendimento.

Depois de cadastrar presunto em gramas, registre uma entrada de 1.000 g.
Cadastre a esfirra como produção da loja e informe 100 g de presunto na receita
de uma unidade, além dos demais ingredientes usados. Registrar 10 esfirras
desconta 1.000 g e acrescenta 10 unidades prontas. Uma produção sem ingredientes
suficientes é recusada integralmente. A venda das unidades prontas não desconta
novamente os ingredientes.

Uma coxinha comprada congelada entra como unidade para finalizar. Preparar
5 coxinhas desconta 5 desse saldo e acrescenta 5 ao saldo pronto. Pedidos
confirmados para fritar na hora consomem esse saldo diretamente, sem acrescentar
unidades prontas. A permissão de fritura não equivale a estoque infinito.

Variações compartilham estoque e receita. Sabores com receitas diferentes devem
ser cadastrados como produtos separados nesta versão.

## Banco e ativação

O schema oficial está em `../mosaico-back/prisma/schema.prisma`. Em
desenvolvimento, use `npm run db:push` na raiz do projeto depois de instalar as
dependências do backend. No instalador desktop, o Electron leva o schema e
executa `prisma db push` automaticamente na primeira inicialização do SQLite
local.

Para um SQLite antigo, faça backup antes de atualizar. O arquivo
`../mosaico-back/prisma/stock-upgrade.sql`, quando presente, é uma alternativa
de aplicação manual; não combine SQL manual com outra migração sem confirmar o
estado do banco. Os saldos antigos permanecem prontos e os novos saldos para
finalizar começam zerados.

As regras de estoque estão implementadas no backend em
`src/lib/food-stock.ts` e são usadas pelo cadastro, assistente, vendas e
pedidos.
