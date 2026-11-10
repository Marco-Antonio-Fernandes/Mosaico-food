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

O aplicativo já conhece a URL do repositório e faz tudo sozinho:

1. em **Configurações → Atualizações**, clicar em **Verificar atualizações**;
2. se ainda não existir, o sistema clona o repositório do app e o do backend
   em `~/.local/share/mosaico-food/source`;
3. **Atualizar agora** faz `git reset` para `origin/main`, instala dependências,
   copia os modelos locais, compila app e backend, empacota e reinicia.

O computador precisa ter `git`, Node.js e acesso aos repositórios. Para
repositórios privados, configure o credential helper do Git ou defina
`MOSAICO_GIT_TOKEN` com um token de leitura antes de abrir o aplicativo.

Os endereços padrão são:

```text
https://github.com/Marco-Antonio-Fernandes/Mosaico-food.git
https://github.com/Marco-Antonio-Fernandes/mosaico-back.git
```

Podem ser trocados com `MOSAICO_REPO_URL`, `MOSAICO_BACK_REPO_URL` e
`MOSAICO_REPO_BRANCH`.
