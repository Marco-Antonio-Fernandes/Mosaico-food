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

## Atualizações sem pendrive

O aplicativo instalado tem o botão **Configurações → Atualizações → Verificar
atualizações**. Ele consulta um manifesto no servidor e instala a versão nova
sozinho, sem precisar levar um pendrive até a loja.

O endereço padrão do manifesto é:

```text
https://mosaico.rotatix.com.br/updates/mosaico-food/latest.json
```

Antes de gerar o AppImage, aumente `version` em `apps/desktop/package.json`
(por exemplo `0.2.0`). Depois rode:

```bash
./installer/publish-update.sh \
  "apps/desktop/release/Mosaico Food-0.2.0.AppImage" \
  0.2.0 \
  "Melhorias na tela de configurações e backup."
```

Os arquivos `Mosaico-Food-0.2.0.AppImage` e `latest.json` são gravados em
`apps/desktop/release/updates`. Envie os dois para o servidor, no diretório
`/var/www/mosaico-updates/mosaico-food/`.

No nginx do servidor, sirva esse diretório:

```nginx
location /updates/ {
    alias /var/www/mosaico-updates/;
    autoindex off;
    add_header Cache-Control "no-store";
}
```

A versão do manifesto precisa ser maior que a versão instalada. Para trocar o
endereço do manifesto sem recompilar, defina `MOSAICO_UPDATE_MANIFEST_URL` antes
de abrir o aplicativo.
