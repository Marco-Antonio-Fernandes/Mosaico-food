# Mosaico Food — handoff da implementação

Documento de passagem para outro desenvolvedor. Ele descreve o código existente,
o fluxo de execução e as limitações conhecidas, incluindo a última correção de
empacotamento e áudio. Os documentos com “plano” descrevem etapas futuras; este
arquivo é a referência do estado atual.

## Atualização do empacotamento e do áudio

O teste de empacotamento encontrou e corrigiu os caminhos do backend. Os
repositórios são irmãos: `Documentos/mosaico-back` fica ao lado de
`Documentos/Mosaico Food`, não dentro dele. Por isso, comandos executados em
`apps/desktop` e os recursos do `electron-builder` usam
`../../../mosaico-back`.

O erro original era `ENOENT` para
`Documentos/Mosaico Food/mosaico-back/package.json`; esse caminho não existe.
Os scripts agora apontam para o irmão correto.

O `faster-whisper` foi instalado na virtualenv `.venv-speech` do backend para
experimentação. Ele baixa um modelo CTranslate2 para o cache do Python, mas não
cria `whisper-server` nem `ggml-tiny.bin`. O desktop continua usando
`whisper.cpp` em C++ para o instalador não depender de Python. São formatos
diferentes e o modelo do `faster-whisper` não pode ser renomeado para
`ggml-tiny.bin`.

Se for necessário reproduzir o experimento Python, ele é separado do
instalador:

```bash
cd "/home/art-vandelay/Documentos/mosaico-back"
python -m venv .venv-speech
.venv-speech/bin/pip install faster-whisper
.venv-speech/bin/python -c 'from faster_whisper import WhisperModel; WhisperModel("tiny", device="cpu", compute_type="int8")'
```

Esse comando apenas baixa/prepara o modelo do `faster-whisper` no cache da
virtualenv. Não substitui a compilação do `whisper-server` descrita abaixo.

## Repositórios

Os dois diretórios precisam permanecer lado a lado:

```text
Documentos/
├── Mosaico Food/    frontend, Electron, empacotamento e documentação
└── mosaico-back/    NestJS, Prisma, SQLite/API e regras Food
```

O frontend chama a API Food. No instalador, o Electron tenta iniciar uma cópia
local do backend; se ela não estiver empacotada ou não iniciar, usa a URL
configurada em `MOSAICO_BACKEND_URL`, por padrão
`https://mosaico.rotatix.com.br`.

### Arquivos principais do frontend

- `apps/desktop/src/app.tsx`: shell, navegação, estado de conexão e polling de
  notificações.
- `apps/desktop/src/lib/food-api.ts`: tipos e chamadas HTTP do Food; em pacote
  instalado usa a API local quando ela está disponível.
- `apps/desktop/src/features/prototype/food-prototype.tsx`: catálogo, cadastro,
  PDV, estoque, produção e Kanban.
- `apps/desktop/src/features/prototype/product-stock.tsx`: entradas e produção.
- `apps/desktop/src/features/assistant/food-assistant.tsx`: assistente
  universal de texto/voz, prévia e confirmação.
- `apps/desktop/src/features/assistant/order-alerts.tsx`: alerta visual, ping e
  som dos pedidos demorados.
- `apps/desktop/src/features/automation/food-automation-panel.tsx`: painel da
  automação do WhatsApp.
- `apps/desktop/src/styles.css`: botão flutuante e alertas.

### Arquivos principais do Electron

- `apps/desktop/electron/main.cjs`: janela, IPC, processos locais e carregamento
  de `dist/index.html`.
- `apps/desktop/electron/preload.cjs`: ponte segura do renderer.
- `apps/desktop/electron/local-backend.cjs`: backend local na porta 31415 e
  SQLite dentro de `userData/data/mosaico.sqlite`.
- `apps/desktop/electron/local-speech.cjs`: servidor C++ do whisper.cpp na
  porta 8787, chamado somente em `127.0.0.1`.
- `apps/desktop/electron-builder.yml`: recursos incluídos no instalador.
- `apps/desktop/scripts/prepare-speech-runtime.mjs`: prepara binário e modelo
  do Whisper para a plataforma do pacote.

### Arquivos principais do backend

- `src/controllers/food-products.controller.ts`: produtos, aliases,
  variações, receitas e estoque.
- `src/controllers/food-sales.controller.ts`: venda física de balcão.
- `src/controllers/food-assistant.controller.ts`: interpretação de comandos de
  venda/produção e confirmação transacional.
- `src/controllers/food-speech.controller.ts`: transcrição para modo web/API.
- `src/controllers/food-orders.controller.ts`: pedidos, Kanban e notificações
  de status ao cliente.
- `src/controllers/food-conversations.controller.ts`: conversas, mensagens e
  pausa/retomada da automação.
- `src/controllers/whatsapp.controller.ts`: status, notificações e webhook.
- `src/features/food-automation/food-automation.ts`: carrinho e atendimento
  automático.
- `src/lib/food-stock.ts`: capacidade de preparo e consumo da receita.
- `prisma/schema.prisma`: fonte do modelo persistido.

## Inicialização do desktop instalado

O Electron executa esta sequência antes de mostrar a janela:

1. Registra os canais IPC de URL do backend e transcrição.
2. Procura `resources/backend/dist/main.js`.
3. Cria `userData/data/mosaico.sqlite` e executa `prisma db push` na primeira
   inicialização, usando o schema empacotado.
4. Inicia o backend com `DATABASE_URL=file:<caminho local>` na porta 31415.
5. Procura e inicia o runtime Whisper na porta 8787, com idioma português.
6. Abre a interface mesmo quando algum recurso local está indisponível.
7. Ao fechar, encerra os processos filhos.

Em desenvolvimento, o backend local só é iniciado com
`MOSAICO_USE_LOCAL_BACKEND=1`; sem essa variável o Electron usa a URL remota.

O SQLite local não é sincronizado com o banco remoto. Há fallback de URL, mas
ainda não há merge, bootstrap, resolução de conflitos nem upload automático de
dados Food.

## Catálogo, estoque e produção

O `productionMode` tem três valores:

| Modo | Uso | Saldo |
| --- | --- | --- |
| `resale` | produto comprado para revender ou finalizar | pronto e, quando aplicável, não preparado |
| `recipe` | produto feito na loja | unidades prontas; a produção consome insumos |
| `ingredient` | insumo, como presunto | g, ml ou unidades; não aparece no atendimento |

Também existem aliases, variações, preço, `allowOnDemand` e `fryToOrder`.

Regras implementadas:

- Variações compartilham estoque/receita e podem ter diferença de preço.
- Sabores com receitas diferentes devem ser produtos separados nesta versão.
- `stockQuantity` é o saldo pronto para vender.
- `unpreparedQuantity` é o saldo que ainda precisa ser finalizado.
- `preparationCapacity` informa quanto pode ser preparado com os insumos reais.
- `receive_ready` adiciona produto pronto.
- `receive_unprepared` adiciona produto que será finalizado.
- `prepare` consome receita ou saldo não preparado e adiciona unidades prontas.
- Vender produto pronto não desconta a receita novamente.
- Produção sem todos os ingredientes é recusada integralmente.
- Fritar/preparar na hora só é oferecido quando existe capacidade real; essa
  opção não cria estoque infinito.
- Ajuste direto de saldo, mudança do tipo de controle e mudança da unidade de
  um ingrediente são bloqueados; usam-se as ações específicas de estoque.
- Operações têm IDs idempotentes para evitar baixa duplicada por reenvio.

Exemplo: `presunto` é ingrediente em gramas e `esfirra` é receita com 100 g de
presunto por unidade. Produzir 10 esfirras baixa 1.000 g e acrescenta 10
unidades prontas. Quando o presunto acaba, a capacidade de produção também
acaba. Detalhes: [ESTOQUE-E-PRODUCAO.md](ESTOQUE-E-PRODUCAO.md).

## Assistente universal

O botão flutuante registra operações internas por texto ou voz:

```text
vendi 5 pães no pix por 6 reais
vendi 5 pães
fritei 5 pastéis
assei 10 esfihas
```

Fluxo da operação:

1. O frontend envia o texto para `POST /api/v1/food/assistant/preview`.
2. O backend normaliza acentos, plural comum, aliases e pequenos erros.
3. Produto ambíguo gera escolhas; comando incompleto gera orientação.
4. Estoque pronto ou capacidade de produção são validados antes da prévia.
5. O frontend exibe quantidade, produto, total e pagamento.
6. O usuário pode corrigir total e pagamento.
7. Somente o botão de confirmação chama
   `POST /api/v1/food/assistant/confirm`.
8. Venda ou produção e baixa de estoque acontecem na mesma transação.

O endpoint atual processa uma operação por vez. Comandos com vários itens
devem ser registrados em sequência, até que um carrinho interno seja adicionado
ao assistente.

## Microfone e transcrição

O renderer usa `navigator.mediaDevices.getUserMedia({ audio: true })` e
`MediaRecorder`. O áudio é convertido para WAV mono PCM em memória e enviado
por IPC ao processo principal. Depois, o processo principal faz POST para
`http://127.0.0.1:8787/inference`. O aplicativo não grava um arquivo de áudio
temporário.

O Electron precisa autorizar a permissão `media`; isso já está configurado em
`main.cjs` com `setPermissionCheckHandler` e `setPermissionRequestHandler`.
Se o sistema operacional bloquear o dispositivo, o frontend informa para
autorizar o microfone. Se o runtime não estiver no pacote, informa que o motor
local não foi instalado. Se não houver texto reconhecido, mostra:
“Desculpa, não consegui entender o que você disse.”

Arquivos esperados pelo instalador:

```text
speech/
├── models/ggml-tiny.bin
├── linux-x64/whisper-server
├── linux-arm64/whisper-server
├── win32-x64/whisper-server.exe
└── win32-arm64/whisper-server.exe
```

O modelo e os executáveis não entram no Git. O script de preparação baixa o
`ggml-tiny.bin` e copia o executável apontado por `MOSAICO_WHISPER_SERVER`.
Sem um pacote preparado com esses arquivos, o microfone pode abrir e gravar,
mas a transcrição não será concluída.

O Electron agora autoriza a permissão `media` com
`setPermissionCheckHandler` e `setPermissionRequestHandler`. Se o sistema
bloquear o dispositivo, a interface informa para autorizar o microfone. A
versão instalada antes dessa correção não continha o runtime Whisper e precisa
ser substituída por um novo pacote.

## WhatsApp e pedidos

O canal implementado é o WA-AKG. O webhook
`POST /api/v1/whatsapp/webhook` valida `X-Webhook-Signature` com HMAC-SHA256,
salva mensagens de forma idempotente e executa a automação somente para
contatos habilitados.

O atendimento entende quantidade, aliases, variação, itens prontos e itens que
podem ser preparados. Monta carrinho, pergunta entrega/retirada, coleta rua,
número e bairro e só cria o pedido após confirmação inequívoca. Depois do
pedido, pode continuar perguntando se o cliente deseja algo mais. O atendente
pode pausar a automação e responder manualmente.

Status usados: `confirmed`, `preparing`, `ready`, `out_for_delivery`,
`delivered` e `cancelled`. Ao alterar a etapa, o backend tenta notificar o
cliente pelo WA-AKG. O desktop consulta `/api/v1/whatsapp/notifications` e
mostra avisos visuais/sonoros.

A Cloud API oficial da Meta ainda é planejamento; não misture seus endpoints
com a configuração atual do WA-AKG.

## Empacotamento

Em `apps/desktop/electron-builder.yml`, o instalador inclui o renderer, o
Electron, `mosaico-back/dist`, `mosaico-back/node_modules`, `mosaico-back/prisma`
e `electron/speech-runtime`. Os alvos são AppImage/deb no Linux e NSIS no
Windows.

```bash
cd "/home/art-vandelay/Documentos/Mosaico Food"
npm install
npm --prefix ../mosaico-back install
npm run typecheck
npm run build

cd apps/desktop
MOSAICO_WHISPER_SERVER=/caminho/whisper-server npm run package:linux
```

O valor `/caminho/whisper-server` é apenas exemplo. No Linux, uma sequência
completa é:

```bash
cd "/home/art-vandelay/Documentos/mosaico-back"
npm install

cd /tmp
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release -j2 --target whisper-server

cd "/home/art-vandelay/Documentos/Mosaico Food/apps/desktop"
MOSAICO_WHISPER_SERVER="/tmp/whisper.cpp/build/bin/whisper-server" \
npm run package:linux
```

`npm run package:linux` executa o build do backend pelo caminho
`../../../mosaico-back`, prepara o runtime de voz, compila o renderer e chama o
`electron-builder`. O script baixa `ggml-tiny.bin` automaticamente. O resultado
fica em `apps/desktop/release/`. Para Windows, compile `whisper-server.exe`
para Windows e use `npm run package:win`.

O `base: "./"` em `apps/desktop/vite.config.ts` é obrigatório: o Electron
carrega o HTML empacotado com `loadFile`, então os assets precisam ser
relativos. Remover isso causa tela branca no instalador.

## Segurança e limitações

- Renderer usa `nodeIntegration: false` e `contextIsolation: true`.
- O preload expõe apenas status, URL efetiva, plataforma e transcrição.
- Backend e Whisper locais escutam em `127.0.0.1`.
- Não versionar SQLite local, modelo Whisper, executáveis ou segredos.
- Login completo e permissões ainda não estão prontos; a API usa proteção
  provisória por chave em produção.
- Não existe sincronização local/remota Food.
- Não considerar concluídos fiscal/NFC-e, Cloud API oficial, atualização
  automática ou testes de aceitação em máquina limpa.

## Próximos passos para quem assumir

1. Instalar dependências do backend e gerar um pacote completo com Whisper.
2. Validar primeira execução, criação do SQLite, estoque, produção, venda,
   pedido, microfone e reinício em Linux limpo.
3. Empacotar/testar Windows e conferir permissões e encerramento de processos.
4. Decidir e implementar sincronização se o sistema precisar usar os mesmos
   dados em mais de um computador.
5. Implementar autenticação antes de uso em produção.
6. Criar testes para estoque, confirmação, duplicidade, áudio indisponível e
   notificações.
