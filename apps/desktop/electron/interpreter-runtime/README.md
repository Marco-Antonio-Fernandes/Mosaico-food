# Interpretador local

O interpretador local usa `llama.cpp` e o modelo `Qwen3-1.7B-Q8_0.gguf`. Ele
fica no computador do desktop, em `127.0.0.1`, e não envia a transcrição para
um serviço externo.

Na raiz de `apps/desktop`, rode:

```bash
sudo pacman -S --needed git cmake base-devel
npm run prepare:interpreter
```

O script baixa o `llama.cpp`, compila somente o `llama-server` e baixa o modelo
oficial de aproximadamente 1,83 GB. Se os arquivos já existirem, eles são
reutilizados.

Para gerar o instalador Linux junto com o Whisper já compilado:

```bash
MOSAICO_WHISPER_SERVER="/tmp/whisper.cpp/build-static/bin/whisper-server" npm run package:linux
```

O aplicativo inicia os dois motores localmente: Whisper na porta `8787` e o
interpretador na porta `8788`. Nenhum dos dois fica exposto fora de
`127.0.0.1`.
