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
