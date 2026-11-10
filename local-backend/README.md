# Backend local do Mosaico Food

Este backend roda no computador da loja e trata apenas os dados locais
(produtos, estoque, vendas, pedidos, clientes, caixa, crediário, automação e
backup). Ele é compilado e empacotado dentro do aplicativo.

O envio e o recebimento do WhatsApp, o webhook e o cliente WA-AKG ficam no
backend do servidor, no repositório privado `mosaico-back`. Aqui existe apenas
um stub sem acesso à API do WhatsApp; as mensagens chegam pelo relay e as
respostas são enviadas pela ponte do servidor.
