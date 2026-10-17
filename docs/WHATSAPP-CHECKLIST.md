# Mosaico Food — checklist da WhatsApp Cloud API

> **Estado atual:** este arquivo descreve a integração futura com a WhatsApp
> Cloud API da Meta. O canal já implementado é o WA-AKG, com webhook em
> `POST /api/v1/whatsapp/webhook`. Leia primeiro
> [IMPLEMENTACAO-E-TESTE.md](IMPLEMENTACAO-E-TESTE.md) para o fluxo atual.

## Objetivo

Usar a API oficial da Meta como canal de atendimento e pedidos, sem depender
de sessão do WhatsApp Web. O checklist separa o que pode ser implementado sem
credencial do que exige configuração e teste real.

## Pode ser desenvolvido sem credenciais

- modelo `conversation`, `conversation_message`, `cart` e `outbox_job`;
- normalização de telefone e mensagens;
- interpretador determinístico;
- aliases, quantidades, intenções e ambiguidades;
- carrinho persistente e expiração;
- confirmação explícita;
- criação idempotente de pedido;
- central de atendimento com fixtures identificadas como teste;
- contratos Zod e validação de payload;
- fila, retentativa e dead-letter;
- regras de takeover humano;
- testes unitários, API e integração simulada;
- mensagens de status renderizadas a partir de configurações.

## Exige configuração da Meta

- conta Meta for Developers;
- Meta App com produto WhatsApp;
- Business Manager e WhatsApp Business Account;
- número de telefone e Phone Number ID;
- token de acesso de servidor conforme o fluxo aprovado;
- permissões vigentes de mensagens e gestão do WABA;
- webhook HTTPS público;
- verify token;
- app secret para verificação de assinatura;
- inscrição da aplicação na WABA;
- templates aprovados quando necessários;
- número e ambiente de teste/homologação;
- revisão, verificação e limites de produção conforme a conta.

## Fluxo de autenticação planejado

1. criar/configurar o App e o produto WhatsApp na Meta;
2. identificar WABA e Phone Number ID;
3. criar token com escopo e duração adequados ao ambiente;
4. guardar o token somente no secret manager do backend;
5. configurar URL HTTPS e verify token;
6. responder o GET de verificação;
7. inscrever o App na WABA;
8. validar recebimento de eventos;
9. enviar mensagem de teste pelo backend;
10. confirmar status enviado, entregue, lido ou falho;
11. testar duplicidade, retentativa e takeover;
12. registrar versão da Graph API e data da revisão.

O Desktop só consulta o estado da conexão. Não recebe token nem chama a Graph
API diretamente.

## Webhooks

Endpoint previsto:

```text
GET  /api/v1/webhooks/whatsapp/meta
POST /api/v1/webhooks/whatsapp/meta
```

O GET valida `hub.verify_token` e retorna `hub.challenge`. O POST valida
assinatura, WABA, Phone Number ID e schema antes de enfileirar. A resposta deve
ser rápida; processamento, interpretação e resposta acontecem no worker.

O evento deve ser deduplicado por identificador do provedor/mensagem. Eventos
fora de ordem não podem substituir uma versão mais nova do carrinho, conversa,
pedido ou status da mensagem.

## Janela e mensagens

As regras de mensagens iniciadas pelo cliente, respostas de atendimento,
templates, categorias, janela de atendimento e cobrança seguem as políticas e
a versão vigente da Meta. O backend deve armazenar o estado de elegibilidade
antes de tentar envio.

Fora da janela permitida, o sistema deve usar template aprovado quando a Meta
exigir, ou colocar a mensagem em `needs_review`. Não prometer que qualquer texto
pode ser enviado em qualquer momento.

## Custos e limites

O planejamento financeiro não fixa valores em código ou documento estático.
Antes de produção, revisar a tabela de preços da Meta para o país/categoria e
data vigentes, além de:

- cobrança por mensagens/categoria conforme a regra vigente;
- possíveis custos de provedor fiscal, hospedagem, banco, fila e observabilidade;
- limites de envio e qualidade do número;
- requisitos de templates;
- limites de taxa, tamanho e tipo de mensagem;
- custos de armazenamento e retenção de conversas;
- eventuais custos de onboarding ou suporte de terceiros.

O orçamento deve guardar data da consulta, moeda, país, categoria e fonte. A
interface não deve informar “WhatsApp grátis” sem qualificar a política atual.

## Limitações assumidas no projeto

- a API não é um WhatsApp Web embutido;
- apenas recursos e payloads disponibilizados pela Cloud API serão suportados;
- mensagens podem atrasar, falhar, chegar duplicadas ou fora de ordem;
- o cliente pode enviar texto ambíguo ou unsupported media;
- atendimento humano e automático precisam de estado explícito;
- o número pode ter qualidade, limites ou revisão de conta;
- aprovação de templates pode impedir a liberação de uma mensagem;
- a Meta pode alterar versão, política, preços ou permissões.

## Teste real obrigatório

O teste de aceite precisa comprovar:

- cliente envia mensagem natural;
- mensagem entra no webhook e na central;
- sistema encontra produto cadastrado;
- carrinho permanece após reinício do backend;
- pedido só nasce após confirmação;
- pedido aparece no Kanban;
- mensagem de status respeita elegibilidade;
- webhook repetido não duplica pedido;
- funcionário assume atendimento e interrompe automação;
- falha de envio aparece como falha, não como sucesso.

Somente depois desse teste a integração pode ser marcada como funcional.

## Fontes oficiais para revisão

- [Coleções oficiais da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wl)
- [Referência oficial de payloads de webhook](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Assinatura da WABA e webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/ozgs3jn/webhook-subscriptions)
- [Onboarding/Embedded Signup oficial](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)
- [Termos da Meta para WhatsApp Business](https://www.whatsapp.com/legal/meta-terms-whatsapp-business)
- [Documentação de preços da WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)

As fontes devem ser revisadas novamente imediatamente antes da integração e da
publicação em produção.
