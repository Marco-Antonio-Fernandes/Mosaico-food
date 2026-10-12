# Motor de voz local

O instalador deve colocar os arquivos nativos do `whisper.cpp` nestas pastas:

```text
speech/
├── models/ggml-base.bin
├── linux-x64/whisper-server
├── linux-arm64/whisper-server
├── win32-x64/whisper-server.exe
└── win32-arm64/whisper-server.exe
```

O binário deve ser compilado para a plataforma que será empacotada e informado
em `MOSAICO_WHISPER_SERVER` ao rodar `npm run prepare:speech`. O script baixa o
modelo base automaticamente para a pasta do instalador. Nem o executável nem o
modelo entram no Git.

`faster-whisper` não substitui esses arquivos neste pacote. A instalação Python
de `faster-whisper` baixa um modelo CTranslate2 para o cache da virtualenv; ela
não cria `whisper-server` nem `ggml-base.bin`. Para manter o instalador sem
Python, compile o servidor do projeto `whisper.cpp` e informe o caminho real do
executável, em vez de usar o texto de exemplo `/caminho/whisper-server`.

O Electron escolhe a pasta correspondente ao sistema em execução e inicia o
servidor somente em `127.0.0.1`. O pacote final já leva esses arquivos; o cliente
não precisa instalar Python, Node, CMake ou Whisper.

## Linux: preparação completa

O repositório do backend e o desktop são irmãos. O build do backend usa
`../../../mosaico-back` quando executado a partir de `apps/desktop`.

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

O comando compila o backend, baixa `ggml-base.bin`, copia o executável para
`speech/linux-x64/` e gera o instalador em `release/`. Para Windows, compile
`whisper-server.exe` para Windows e use `npm run package:win`.
