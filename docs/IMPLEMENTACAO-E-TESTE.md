# Mosaico Food — implementação atual e reprodução

Atualizado em 17/10/2026.

Este é o documento único do estado funcional atual. Ele registra somente o que
foi implementado, as ferramentas usadas, a preparação dos recursos locais e a
ordem para instalar e testar em outra máquina.

## 1. Estrutura do projeto

Os repositórios precisam ficar lado a lado:

```text
Documentos/
├── Mosaico Food/   # Electron, React, empacotamento e interface
└── mosaico-back/   # NestJS, Prisma, SQLite, API e regras de negócio
```

O desktop empacotado inicia uma cópia local do backend, do banco SQLite, do
Whisper e do interpretador local. A ponte do WhatsApp continua usando o
backend remoto configurado para o WA-AKG; o processamento do atendimento e o
estoque ficam no backend local do desktop.

## 2. O que está implementado

### Desktop

- Electron + React + TypeScript + Vite.
- Navegação de pedidos, atendimento, crediário, produtos, estoque, clientes,
  financeiro, fiscal e configurações.
- Interface de cadastro de produtos, receitas, ingredientes e variações.
- PDV, vendas de balcão, caixa, financeiro e pedidos com etapas operacionais.
- Atendimento com histórico, resposta manual, pausa e devolução da automação.
- Backup e criação de um banco local novo com arquivamento do banco anterior.
- Notificações visuais, som e notificações do sistema.
- Ponte segura entre renderer e Electron por preload/IPC.
- Permissão de microfone para o assistente de voz.

### Backend

- NestJS, TypeScript, Prisma e SQLite.
- Health check, CORS e API com opção de `X-API-Key`.
- Produtos, aliases, variações, preço, disponibilidade, ingredientes e
  receitas.
- Estoque pronto, estoque não preparado, produção, perdas e capacidade real de
  preparo.
- Clientes, telefones normalizados, endereços e crediário.
- Vendas, pedidos, caixa, movimentos financeiros e agendamentos.
- Backup e sincronização inicial dos dados previstos pela API.
- Banco local preparado automaticamente pelo Electron com `prisma db push`.
- Bancos antigos com a coluna `FoodCashSession.activeKey` ausente são
  atualizados com backup automático antes da compatibilidade ser aplicada.

### Atendimento pelo WhatsApp

O canal implementado é o WA-AKG, não a WhatsApp Cloud API oficial da Meta.

- Webhook `POST /api/v1/whatsapp/webhook` com assinatura HMAC-SHA256.
- Deduplicação por sessão e ID da mensagem.
- Registro de texto, áudio e mídia recebida.
- Fila remota de mensagens para o desktop local.
- Download de áudio pelo backend remoto e transcrição no desktop.
- Envio de respostas pelo mesmo WA-AKG.
- Pausa para atendimento humano e retomada da automação.
- Pedido só é criado depois de confirmação explícita.

### Automação de pedidos

- Entende nomes cadastrados, aliases, sabores e quantidade.
- Tolera erros comuns de ortografia e frases naturais, por exemplo:
  `separa 10 paes de eiqjo ai`.
- Reconhece pedidos de cardápio como `o que tem`, `q q tem`, `o que tem
  pronto` e `o que tem frito`.
- Diferencia itens prontos de itens preparados na hora.
- Não exibe mais a capacidade técnica `1000000000`; ela aparece como
  “preparo na hora”.
- Pergunta sabor, preparo, entrega/retirada, endereço e confirmação quando
  necessário.
- Respostas de cardápio e confirmação foram ajustadas para um tom mais
  amigável.
- Produto, preço e estoque são revalidados antes da confirmação do pedido.
- `automationEnabled` começa desativado para novos contatos.
- O teste global da automação também começa desativado; deve ser ativado
  manualmente no painel.
- Na atualização desta versão, os contatos que já existiam também foram
  desativados; o operador ativa somente os contatos escolhidos.

### Notificações de WhatsApp

A central do desktop recebe somente mensagens que precisam de atendimento:

- mensagem inbound ainda pendente;
- encaminhamento para a equipe;
- áudio ou mídia que não pôde ser interpretado;
- contato com a automação desativada.

Mensagens respondidas normalmente pelo automático não geram notificação. Ao
responder manualmente, as mensagens pendentes daquela conversa são marcadas
como tratadas.

## 3. Recursos locais usados

| Recurso | Uso | Arquivos/porta |
|---|---|---|
| Backend local | Regras, API e banco do desktop | NestJS, `127.0.0.1:31415` |
| SQLite | Dados locais da loja | `userData/data/mosaico.sqlite` |
| whisper.cpp | Transcrição de áudio em português | `whisper-server`, `127.0.0.1:8787` |
| Whisper base | Modelo usado pela transcrição | `speech/models/ggml-base.bin` |
| llama.cpp | Servidor do interpretador local | `llama-server`, `127.0.0.1:8788` |
| Qwen3 | Interpretação do assistente de operações | `Qwen3-1.7B-Q8_0.gguf` |

O Whisper é o modelo que transcreve áudio. O Qwen3 não substitui o Whisper;
ele interpreta comandos de texto do assistente de estoque/vendas.

Os dois servidores locais escutam somente em `127.0.0.1`. O instalador final
leva os binários e modelos; a máquina que apenas instala o pacote não precisa
de Python, CMake ou Whisper instalados.

## 4. Requisitos para preparar uma máquina nova

Para usar um instalador já gerado, basta o sistema operacional compatível e
permissão para executar o aplicativo.

Para compilar o projeto, instalar:

- Git;
- Node.js compatível com o npm lockfile, preferencialmente Node 20 ou mais
  recente;
- npm;
- CMake e compilador C/C++;
- `curl` para o download do modelo Qwen;
- conexão à internet durante a instalação das dependências e dos modelos.

Python e `faster-whisper` não são necessários para o instalador atual. O
`faster-whisper` usa outro formato de modelo e não cria o `whisper-server`.

No Windows, o `whisper-server.exe` e o `llama-server.exe` precisam ser
compilados para Windows, normalmente com CMake e Visual Studio Build Tools.

## 5. Instalação a partir do código

### 5.1 Baixar os dois repositórios

```bash
cd ~/Documentos
git clone <URL-DO-REPOSITORIO-MOSAICO-FOOD> "Mosaico Food"
git clone <URL-DO-REPOSITORIO-MOSAICO-BACK> mosaico-back
```

Se os repositórios já existirem, apenas confirme que são irmãos e que não há
uma cópia de `mosaico-back` dentro de `Mosaico Food`.

### 5.2 Instalar dependências

```bash
cd ~/Documentos/mosaico-back
npm install

cd "$HOME/Documentos/Mosaico Food"
npm install
```

Criar o ambiente do backend:

```bash
cd ~/Documentos/mosaico-back
cp .env.example .env
```

Para teste local sem WhatsApp, os valores padrão do `.env.example` são
suficientes. Para WhatsApp real, preencher:

```dotenv
WA_AKG_BASE_URL="https://wa-akg.app"
WA_AKG_API_KEY="..."
WA_AKG_SESSION_ID="..."
WA_AKG_WEBHOOK_SECRET="..."
FOOD_AUTOMATION_BUSINESS_NAME="Nome da loja"
```

No backend remoto da ponte, usar `MOSAICO_RELAY_ONLY=1` para que ele receba e
guarde as mensagens sem executar o pedido localmente. No backend local do
desktop, usar `MOSAICO_RELAY_ONLY=0`.

Se a API remota exigir autenticação, configurar no backend:

```dotenv
MOSAICO_REQUIRE_API_KEY="1"
MOSAICO_API_KEY="uma-chave-com-pelo-menos-16-caracteres"
```

E informar a mesma chave em `apps/desktop/.env` antes do build:

```dotenv
VITE_MOSAICO_REMOTE_BACKEND_URL="https://endereco-do-backend"
VITE_MOSAICO_API_KEY="uma-chave-com-pelo-menos-16-caracteres"
```

### 5.3 Criar o banco e validar o backend

Para um banco novo:

```bash
cd "$HOME/Documentos/Mosaico Food"
npm run db:generate
npm run db:push
npm run typecheck:back
npm run build:back
```

Em banco antigo, fazer backup antes de qualquer alteração. O aplicativo
empacotado já trata automaticamente a compatibilidade de `activeKey` e cria
um backup antes de aplicar essa adaptação.

### 5.4 Preparar a transcrição de áudio

O script baixa automaticamente o modelo `ggml-base.bin`, mas precisa receber
um `whisper-server` compilado para o alvo.

Linux:

```bash
cd /tmp
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release -j2 --target whisper-server

cd "$HOME/Documentos/Mosaico Food/apps/desktop"
MOSAICO_WHISPER_SERVER="/tmp/whisper.cpp/build/bin/whisper-server" \
  npm run prepare:speech
```

Depois desse comando, confirmar:

```bash
test -s electron/speech-runtime/linux-x64/whisper-server
test -s electron/speech-runtime/models/ggml-base.bin
```

No Windows, colocar o executável compilado em `MOSAICO_WHISPER_SERVER` e usar
`npm run prepare:speech` com `MOSAICO_TARGET_PLATFORM=win32` quando necessário.

### 5.5 Preparar o interpretador local

Linux x64/arm64:

```bash
cd "$HOME/Documentos/Mosaico Food/apps/desktop"
npm run prepare:interpreter
```

Esse script, quando necessário:

1. baixa `llama.cpp` para `/tmp/llama.cpp`;
2. compila `llama-server` com CMake;
3. baixa aproximadamente 1,83 GB do modelo
   `Qwen3-1.7B-Q8_0.gguf`;
4. salva o servidor e o modelo em `electron/interpreter-runtime/`.

No Windows, compilar `llama-server.exe` e informar:

```powershell
$env:MOSAICO_LLAMA_SERVER="C:\caminho\llama-server.exe"
npm run prepare:interpreter
```

### 5.6 Gerar o instalador

Linux:

```bash
cd "$HOME/Documentos/Mosaico Food/apps/desktop"
MOSAICO_WHISPER_SERVER="/tmp/whisper.cpp/build/bin/whisper-server" \
  npm run package:linux
```

Saídas esperadas em `apps/desktop/release/`:

- `Mosaico Food-0.1.0.AppImage`;
- pacote `.deb`, quando gerado pelo electron-builder;
- `linux-unpacked/` para diagnóstico.

Windows:

```powershell
cd "C:\caminho\Mosaico Food\apps\desktop"
$env:MOSAICO_WHISPER_SERVER="C:\caminho\whisper-server.exe"
$env:MOSAICO_LLAMA_SERVER="C:\caminho\llama-server.exe"
npm run package:win
```

O pacote inclui `dist`, Electron, backend compilado, dependências Prisma,
schema, migrações, runtime de voz e runtime do interpretador.

## 6. Primeira execução em outra máquina

### Instalador pronto

Linux:

```bash
chmod +x "Mosaico Food-0.1.0.AppImage"
./"Mosaico Food-0.1.0.AppImage"
```

Se o ambiente bloquear o sandbox do Electron:

```bash
./"Mosaico Food-0.1.0.AppImage" --no-sandbox
```

Windows: executar o instalador NSIS e abrir o atalho criado.

Na primeira inicialização, o aplicativo:

1. inicia Whisper e Qwen em loopback;
2. cria ou atualiza o SQLite local;
3. inicia o backend local na porta 31415;
4. abre a interface mesmo que um recurso auxiliar esteja indisponível;
5. usa o backend remoto configurado para a fila do WA-AKG.

No Linux, o banco fica normalmente em:

```text
~/.config/Mosaico Food/data/mosaico.sqlite
```

No Windows, fica em `%APPDATA%\Mosaico Food\data\mosaico.sqlite`.

## 7. Ordem de teste em máquina limpa

### 7.1 Teste básico sem WhatsApp

1. Abrir o aplicativo e confirmar que o status do backend local está online.
2. Cadastrar um ingrediente e um produto de teste.
3. Informar preço, estoque pronto e, se necessário, receita/rendimento.
4. Testar produção, perda e venda pelo PDV.
5. Fechar e abrir o aplicativo; confirmar que os dados continuam no SQLite.
6. Abrir o atendimento e confirmar que o teste automático aparece inativo.

### 7.2 Teste do assistente de texto

Usar frases como:

```text
vendi 5 pães no pix por 30 reais
fritei 5 pastéis
adicionei 10 esfihas prontas
dei baixa em 2 pães como perda
```

O sistema deve mostrar uma prévia. Conferir quantidade, produto, preço e
pagamento; somente depois clicar para registrar. Verificar que uma operação
repetida com o mesmo identificador não duplica baixa ou venda.

### 7.3 Teste do áudio

1. Confirmar que os arquivos `whisper-server` e `ggml-base.bin` existem no
   pacote.
2. Autorizar o microfone quando o sistema solicitar.
3. Gravar uma frase curta em português.
4. Confirmar que o status mostra transcrição concluída.
5. Testar um áudio sem fala e confirmar que ele não vira uma operação falsa.

Nos logs, o servidor local aparece como `[Mosaico voz]`. Se aparecer que o
motor não foi incluído, o pacote foi gerado sem `MOSAICO_WHISPER_SERVER` ou sem
o modelo base.

### 7.4 Teste do atendimento WhatsApp

Para teste real, configurar primeiro o WA-AKG, a sessão, o webhook HTTPS e a
chave remota. O webhook deve apontar para:

```text
POST https://SEU-BACKEND/api/v1/whatsapp/webhook
```

Depois seguir esta ordem:

1. confirmar que o painel mostra o WA-AKG conectado;
2. cadastrar produto, preço, sabores e estoque;
3. ativar o atendimento global no painel de automação;
4. abrir a conversa de teste e ativar manualmente “teste automático” para o
   contato;
5. enviar `tô com fome, q q tem aí?`;
6. enviar `o que tem pronto?` e `o que tem frito?`;
7. enviar uma quantidade com erro, como `separa 10 paes de eiqjo ai`;
8. conferir que o bot monta o carrinho, pergunta o que falta e só registra
   depois de `confirmo`;
9. testar entrega, retirada, sabor e endereço;
10. repetir o webhook e confirmar que não duplica mensagem nem pedido.

### 7.5 Teste das notificações

- Enviar uma mensagem que o bot responde normalmente: ela não deve aparecer na
  central de notificações.
- Enviar `quero falar com atendente`, uma dúvida de horário/pagamento ou uma
  mensagem que force encaminhamento: deve aparecer uma notificação.
- Enviar áudio sem transcrição disponível: deve ficar pendente e notificar a
  equipe.
- Responder manualmente pelo atendimento: o alerta pendente deve ser encerrado.
- Fechar e abrir o aplicativo para confirmar que a mesma mensagem não gera
  alertas repetidos sem uma nova entrada.

## 8. Comandos de validação do código

Na raiz de `Mosaico Food`:

```bash
npm run typecheck
npm run build
npm run typecheck:back
npm run build:back
```

No backend, com o serviço disponível e o `.env` configurado, também existem:

```bash
cd ../mosaico-back
npm run test:customers
npm run test:finance
npm run test:finance:operations
```

O health check local pode ser consultado com:

```bash
curl http://127.0.0.1:31415/api/health
```

Se a porta estiver ocupada, o Electron tenta usar uma porta entre 31415 e
31434; nesse caso, usar o status mostrado pelo próprio aplicativo.

## 9. Limites conhecidos

Não considerar como implementados neste pacote:

- WhatsApp Cloud API oficial da Meta;
- login, usuários e permissões completos;
- sincronização/merge entre SQLite local e banco remoto;
- emissão fiscal real e homologação NFC-e;
- publicação das atualizações exige gerar o AppImage, rodar
  `installer/publish-update.sh` e enviar os arquivos para o servidor;
- operação de produção sem os testes de aceite acima.

O fluxo funcional atual é WA-AKG + backend remoto de relay + processamento
local no desktop. Não trocar esse fluxo por Cloud API sem atualizar webhook,
assinatura, envio, templates e testes de duplicidade.
