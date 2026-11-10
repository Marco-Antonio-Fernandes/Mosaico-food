# Modelo de diálogo do atendimento automático

Base analisada: conversas e mensagens recebidas no banco local do aplicativo
(`FoodMessage` de entrada com texto). A análise é heurística e serve para
orientar o fluxo do bot, não como treinamento de modelo.

## Padrões observados

- Muitos clientes abrem com saudação curta ("oi", "bom dia", "opa", "fala meu
  patrão") e, na sequência, fazem o pedido.
- Outra parte já manda o pedido completo de uma vez, às vezes com quantidade,
  sabor, modalidade e pagamento na mesma mensagem.
- Pedidos costumam vir quebrados em 2 a 4 mensagens: itens, complemento
  ("e uma coca"), modalidade, endereço e pagamento.
- Perguntas de preço, cardápio, sabores e disponibilidade são frequentes.
- Clientes escrevem com erros, abreviações, emojis e sem acentuação.
- Imagens aparecem tanto como foto de produto ("quero um desse") quanto como
  comprovante de Pix.
- Pedidos de atendimento humano usam "atendente", "funcionário", "pessoa",
  "equipe" e também reclamações/alergias.

## Intenções

1. Saudação.
2. Pedido com itens e quantidades.
3. Pergunta de preço, cardápio, sabores ou disponibilidade.
4. Definição de entrega ou retirada.
5. Endereço ou localização.
6. Forma de pagamento (Pix, dinheiro, cartão, crediário, vale).
7. Troco.
8. Confirmação, recusa ou alteração do pedido.
9. Imagem de produto.
10. Comprovante de pagamento.
11. Pedido de atendimento humano.
12. Agradecimento ou encerramento.

## Máquina de estados

```text
inicio
  -> saudacao (aviso de robô + pergunta o que deseja)
  -> itens
       -> variante (se o produto tiver mais de um sabor/opção)
       -> disponibilidade (estoque/preparo)
  -> modalidade (retirada ou entrega)
       -> endereco (somente entrega)
  -> pagamento
       -> troco (somente dinheiro)
  -> resumo
  -> confirmacao
       -> pedido registrado
  -> comprovante (imagem) -> pedido marcado como pago
  -> atendimento humano (pausa o bot e notifica a equipe)
  -> encerramento
```

## Regras de resposta

- A primeira resposta inclui o aviso: o cliente está falando com um robô e
  pode pedir um atendente a qualquer momento.
- Pedir somente a informação que falta. Se o cliente já mandou itens,
  modalidade e pagamento, ir direto para o resumo e confirmação.
- Aceitar pedido completo em uma única mensagem.
- Não repetir perguntas já respondidas na conversa.
- Responder de forma curta e informal, mantendo clareza de valores e itens.
- Se não reconhecer o item, oferecer o cardápio ou transferir para a equipe.
  Nunca inventar produto, preço ou disponibilidade.
- Se o cliente pedir humano, reclamar, informar alergia/intolerância ou enviar
  imagem que o bot não entende, pausar a automação e notificar os funcionários.
- Imagem de comprovante: o operador confirma no popup e o último pedido em
  aberto do cliente é marcado como pago.
- O status de pagamento deve aparecer no pedido e na comanda impressa.

## Exemplos de mapeamento

| Mensagem do cliente | Intenção | Entidades |
| --- | --- | --- |
| "Boom dia" | Saudação | — |
| "Me vê 4x Burguer com cheddar" | Pedido | 4 × Burguer, cheddar |
| "tem bauru?" | Disponibilidade | Bauru |
| "Qual valor?" | Preço | — |
| "Para entregar no Humberto" | Modalidade + endereço | entrega, Humberto |
| "Pagamento por pix" | Pagamento | Pix |
| "quero 2 pastel, retirar na loja, pix" | Pedido completo | 2 × pastel, retirada, Pix |
| "quero falar com um atendente" | Humano | — |
| imagem com QR/valor | Comprovante | pagamento |

## Pré-requisito para o pedido em uma mensagem

O bot só consegue reconhecer itens cadastrados no catálogo (nome e sinônimos).
No banco analisado o catálogo local tinha poucos produtos ativos e a maior
parte eram ingredientes, então itens citados pelos clientes (doguinho, coca,
trufa, bauru) não eram encontrados e a conversa caía no atendimento humano.

Para o bot avançar sozinho, é necessário:

1. Cadastrar os produtos vendáveis com nome, preço, estoque e sinônimos
   (por exemplo "doguinho" → "Doguinho de salsicha").
2. Manter sabores/variações com nomes reconhecidos.
3. Revisar periodicamente as mensagens que caíram em atendimento humano para
   adicionar novos sinônimos ao catálogo.

## Próximos passos sugeridos

- Ampliar o catálogo e os sinônimos.
- Usar o interpretador local (Qwen) apenas para desambiguar mensagens que as
  regras não reconhecem, mantendo valores e estoque vindos do backend.
- Registrar as escolhas do operador no popup de imagem para melhorar as
  heurísticas de classificação (produto ou comprovante).
