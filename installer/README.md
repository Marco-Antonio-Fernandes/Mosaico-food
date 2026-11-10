# Instalador Arch Linux

O arquivo `Mosaico-Food-Arch-Installer.run` é um instalador autocontido. Ele leva o AppImage completo do Mosaico Food, incluindo backend, banco local, interpretador local e o módulo/modelo de escuta de áudio.

No Arch Linux, execute:

```bash
chmod +x Mosaico-Food-Arch-Installer.run
./Mosaico-Food-Arch-Installer.run
```

O instalador usa `sudo pacman` apenas para instalar as dependências de sistema. O aplicativo é instalado no perfil do usuário, em `~/.local/opt/mosaico-food`, e cria o atalho `~/.local/bin/mosaico-food` e o ícone no menu do sistema.

Para gerar o arquivo depois de alterar o sistema:

```bash
./installer/build-arch-installer.sh
```

Esse arquivo pode ficar grande porque inclui os modelos locais de inteligência artificial. Copie o `.run` inteiro para o pendrive.

## Atualizações pelo Git

O aplicativo instalado tem o botão **Configurações → Atualizações**. O fluxo é:

1. escolher a pasta do repositório do Mosaico Food (uma única vez);
2. **Verificar atualizações** faz `git fetch` e compara com `origin`;
3. **Atualizar agora** faz `git pull`, instala dependências, compila o aplicativo
   e o backend, empacota e reinicia sozinho.

O computador precisa ter `git`, Node.js e acesso ao repositório. As alterações
locais do repositório precisam estar commitadas ou descartadas antes de
atualizar.

O caminho do repositório pode ser definido pela variável `MOSAICO_SOURCE_DIR`
ou escolhido no próprio painel de atualizações.
