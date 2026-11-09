# Mosaico Food — emissão fiscal automática

## Decisão de planejamento

O Mosaico Food terá integração fiscal automática. Para uma lanchonete, o
primeiro documento a ser avaliado é a **NFC-e, modelo 65**, normalmente usada
para venda de mercadorias ao consumidor final. Ela não deve ser assumida como
válida para toda operação: a UF, o regime tributário, o tipo de destinatário,
delivery, venda para empresa e a atividade do estabelecimento podem exigir
outro documento ou tratamento.

O contador da loja deve confirmar a configuração antes de ativar produção. O
sistema oferece suporte técnico à emissão, mas não substitui orientação
contábil ou autorização da SEFAZ.

O Portal Nacional da NF-e mantém os leiautes e notas técnicas vigentes da
NF-e/NFC-e. Como há atualizações recentes de leiaute e regras, a versão do
schema não será congelada neste documento; ela será validada na implementação e
registrada na configuração do provedor. Veja as referências oficiais ao final.

## O que será automático

Quando uma venda ou pedido entrar no ponto fiscal definido para a loja, o
backend poderá:

1. carregar os dados comerciais imutáveis da venda;
2. resolver o perfil fiscal da loja e de cada item;
3. montar o documento conforme o contrato do provedor;
4. assinar ou delegar a assinatura ao provedor autorizado;
5. transmitir em homologação ou produção;
6. armazenar retorno, protocolo, chave, XML e URL/QR Code;
7. disponibilizar DANFE/representação auxiliar para imprimir ou salvar;
8. enviar ao cliente somente por ação/configuração autorizada;
9. atualizar o pedido sem misturar status fiscal, preparo e pagamento.

O carrinho conversacional, orçamento e venda não confirmada nunca geram nota.
Se o pedido já tiver documento autorizado e depois for cancelado, o sistema
deve solicitar o evento fiscal permitido, registrar o motivo e manter o XML e o
histórico.

## Momento da emissão

O ponto de emissão deve ser uma configuração de política fiscal, não uma
decisão informal do operador. Opções planejadas:

- venda presencial finalizada no PDV;
- pedido remoto confirmado e aceito pela loja;
- pedido separado/entregue, se o contador determinar esse momento.

O padrão técnico será emitir quando a venda oficial for criada e revalidada,
antes de marcá-la como `fiscally_completed`. O contador deve aprovar esse
momento para o regime e a UF da loja.

## Dados e credenciais necessários

### Empresa/estabelecimento

- razão social, nome fantasia e CNPJ;
- endereço, UF e município;
- inscrição estadual e demais inscrições aplicáveis;
- regime tributário e enquadramento;
- série e próximo número;
- ambiente de homologação e produção;
- política de contingência;
- responsável contábil e data da última revisão.

### Produto

O cadastro do produto precisa suportar, quando aplicável:

- descrição fiscal;
- unidade comercial e tributável;
- NCM;
- CEST;
- origem da mercadoria;
- GTIN/EAN;
- CFOP;
- CST ou CSOSN;
- alíquotas, reduções, benefícios e observações fiscais;
- regra específica de adicionais e composição.

Produto sem perfil fiscal obrigatório não deve gerar documento em produção. O
PDV deve bloquear a finalização fiscal e explicar o cadastro pendente, sem
inventar valores tributários.

### Segurança

As opções são:

- certificado digital A1 armazenado no secret manager do backend;
- credenciais/tokens de um provedor fiscal autorizado;
- integração direta com webservices da SEFAZ, se aprovada e suportada.

O certificado não será armazenado no renderer, no banco em texto aberto ou no
instalador do Electron. A interface permitirá apenas cadastrar/rotacionar a
referência secreta e testar o ambiente com permissão administrativa.

No aplicativo instalado, a chave da Notaas fica no `.env` do backend
`mosaico-back`. O desktop repassa essa configuração ao backend local sem
expor o valor ao renderer; a interface recebe apenas o estado “configurada”
ou “aguardando chave”.

## Arquitetura do adaptador

```text
Sale/Order
   │ evento fiscal idempotente
   ▼
Fiscal service ── fiscal mapper ── FiscalProvider
   │                               ├── API de provedor autorizado
   │                               └── SEFAZ, se implementado
   ▼
FiscalDocument + FiscalEvent + outbox
   │
   ├── XML/chave/protocolo/QR Code
   ├── DANFE e impressão
   └── atendimento, dashboard e auditoria
```

O contrato `FiscalProvider` deve possuir, no mínimo:

- `issue(documentDraft)`;
- `getStatus(providerDocumentId)`;
- `cancel(documentId, reason)`;
- `sendCorrectionEvent(...)`, quando aplicável;
- `getXml(documentId)`;
- `getAuxiliaryDocument(documentId)`;
- `checkHealth()`.

Cada operação recebe `operation_id`, `correlation_id` e uma chave idempotente.
Uma retentativa não pode consumir outro número fiscal nem criar um segundo
documento para a mesma venda.

## Estados

### Documento fiscal

- `draft`;
- `pending`;
- `authorized`;
- `rejected`;
- `contingency_pending`;
- `cancel_requested`;
- `cancelled`;
- `voided`;
- `error`.

### Eventos fiscais

- emissão;
- consulta;
- cancelamento;
- inutilização de faixa, quando aplicável;
- carta de correção ou evento permitido, quando aplicável;
- envio/consulta de XML;
- mudança para ou retorno de contingência.

Documento `authorized` não pode ser editado. Alterações comerciais posteriores
criam cancelamento, devolução ou novo documento conforme a orientação fiscal.

## Falhas e contingência

- falha de validação comercial: bloquear emissão e orientar correção;
- rejeição fiscal: guardar código e mensagem técnica, sem expor segredo;
- indisponibilidade do provedor: fila com retentativas e alerta;
- indisponibilidade da SEFAZ: usar contingência somente se autorizada para a
  operação, UF e configuração da loja;
- queda do desktop: processamento continua no backend;
- repetição de webhook/provedor: devolver o mesmo resultado idempotente;
- número já utilizado: parar a sequência e exigir revisão administrativa;
- falha após transmissão: consultar antes de reenviar.

Contingência não é simplesmente “emitir sem nota”. O fluxo, prazo de
transmissão posterior, impressão/guarda do DANFE e autorização dependem da
modalidade vigente e da UF. Isso será testado em homologação e documentado por
loja.

## Integração com os módulos

### PDV e pedidos

- a venda guarda `fiscal_status` e `fiscal_document_id`;
- o pedido remoto guarda a origem WhatsApp e o documento associado;
- falha fiscal não apaga nem duplica o pedido;
- ações de cancelamento exibem impacto fiscal antes de confirmar.

### Estoque e financeiro

Emissão fiscal não confirma pagamento. Baixa de estoque, recebimento, estorno e
cancelamento fiscal possuem eventos próprios e auditáveis. O sistema deve
permitir localizar a venda e o documento sem transformar o XML em fonte de
saldo financeiro.

### WhatsApp

Depois da autorização, o sistema pode enviar ao cliente uma mensagem com
resumo, chave ou link seguro, se a política da loja, o consentimento e as regras
vigentes do canal permitirem. A mensagem deve ser criada pelo backend e passar
pelas regras de janela/template da Meta. Falha no WhatsApp não desfaz a
autorização fiscal.

## Entrega atual do Mosaico Food

A primeira entrega usa emissão manual a partir de uma venda paga. O módulo
Fiscal lista as vendas do balcão e itens de pedidos pagos, valida o perfil
fiscal do produto, envia a emissão para a Notaas, consulta o processamento e
guarda número, chave, protocolo, QR Code, DANFE/XML e mensagens de erro no
histórico. A emissão não acontece no fechamento do caixa e não altera estoque,
pagamento ou pedido.

O cadastro do produto já possui os campos fiscais obrigatórios e opcionais.
Eles devem ser preenchidos com a orientação do contador; o sistema bloqueia a
emissão quando o perfil está incompleto.

## Contrato de API fiscal

Rotas previstas:

- `GET /api/v1/fiscal/configuration`;
- `PUT /api/v1/fiscal/configuration`;
- `POST /api/v1/fiscal/connection/test`;
- `POST /api/v1/sales/{saleId}/fiscal-issue`;
- `GET /api/v1/fiscal/documents/{documentId}`;
- `POST /api/v1/fiscal/documents/{documentId}/refresh`;
- `POST /api/v1/fiscal/documents/{documentId}/cancel`;
- `GET /api/v1/fiscal/documents/{documentId}/xml`;
- `GET /api/v1/fiscal/documents/{documentId}/auxiliary`;
- `GET /api/v1/fiscal/documents?status=&from=&to=`.

Todas exigem autenticação e permissão. A emissão manual é uma ação de
reprocessamento/contingência, não uma segunda forma de ignorar o fluxo
automático.

## Testes obrigatórios

### Sem credenciais externas

- mapeamento da venda para o draft fiscal;
- validação de campos obrigatórios;
- cálculo de totais e arredondamento;
- idempotência;
- rejeição por produto sem perfil fiscal;
- cancelamento e histórico;
- persistência de XML/protocolo mascarando segredos;
- falha e reprocessamento da fila;
- consulta depois de timeout.

### Com homologação

- emissão autorizada;
- rejeição conhecida;
- consulta por chave/protocolo;
- cancelamento autorizado;
- contingência e transmissão posterior, se suportada;
- geração e visualização do DANFE/QR Code;
- integração com pedido PDV e WhatsApp sem dados falsos.

Não marcar emissão fiscal como funcional com um mock. A produção só será
liberada após revisão do contador e validação do ambiente da SEFAZ/provedor.

## Referências oficiais consultadas

- [Portal Nacional da NF-e](https://www.nfe.fazenda.gov.br/portal/)
- [Documentos e schemas oficiais NF-e/NFC-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D)
- [Manual de Orientação do Contribuinte — visão geral](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf)
- [Exemplo de orientação estadual sobre NFC-e — SEFAZ Pernambuco](https://www.sefaz.pe.gov.br/Servicos/Nota-Fiscal-de-Consumidor-Eletronica/Paginas/default.aspx)
- [Exemplo de contingência — SEFAZ São Paulo](https://legislacao.fazenda.sp.gov.br/Paginas/RC31961_2025.aspx)

Essas referências não substituem a legislação da UF do estabelecimento. As
notas técnicas e requisitos devem ser revisados no início da implementação e
antes da entrada em produção.
