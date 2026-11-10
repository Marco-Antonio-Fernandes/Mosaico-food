#!/usr/bin/env bash
set -Eeuo pipefail

# Publica uma nova versão para o botão "Atualizar" do aplicativo.
#
# Uso:
#   ./installer/publish-update.sh <AppImage> <versao> [notas]
#
# Variáveis:
#   MOSAICO_UPDATE_BASE_URL   URL pública onde os arquivos ficarão
#                             (padrão: https://mosaico.rotatix.com.br/updates/mosaico-food)
#   MOSAICO_UPDATE_PUBLISH_DIR pasta local de saída
#                             (padrão: apps/desktop/release/updates)

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
APPIMAGE_ARG="${1:-}"
VERSION="${2:-}"
NOTES="${3:-}"
BASE_URL="${MOSAICO_UPDATE_BASE_URL:-https://mosaico.rotatix.com.br/updates/mosaico-food}"
OUTPUT_DIR="${MOSAICO_UPDATE_PUBLISH_DIR:-$ROOT_DIR/apps/desktop/release/updates}"

die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

[[ -n "$APPIMAGE_ARG" ]] || die "informe o AppImage: $0 <AppImage> <versao> [notas]"
[[ -n "$VERSION" ]] || die "informe a versão, por exemplo 0.2.0"
[[ -f "$APPIMAGE_ARG" ]] || die "AppImage não encontrado: $APPIMAGE_ARG"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "versão inválida: use o formato 0.2.0"

command -v sha256sum >/dev/null 2>&1 || die "sha256sum não encontrado."
command -v node >/dev/null 2>&1 || die "node não encontrado."

mkdir -p -- "$OUTPUT_DIR"
TARGET_NAME="Mosaico-Food-$VERSION.AppImage"
TARGET_PATH="$OUTPUT_DIR/$TARGET_NAME"

printf '[Mosaico Food] Copiando %s...\n' "$(basename "$APPIMAGE_ARG")"
cp -- "$APPIMAGE_ARG" "$TARGET_PATH"
chmod 0755 "$TARGET_PATH"

printf '[Mosaico Food] Calculando SHA-256...\n'
SHA256="$(sha256sum "$TARGET_PATH" | cut -d' ' -f1)"
PUBLISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
URL="${BASE_URL%/}/${TARGET_NAME}"

VERSION="$VERSION" URL="$URL" SHA256="$SHA256" NOTES="$NOTES" PUBLISHED_AT="$PUBLISHED_AT" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const manifest = {
    version: process.env.VERSION,
    url: process.env.URL,
    sha256: process.env.SHA256,
    publishedAt: process.env.PUBLISHED_AT,
  };
  if (process.env.NOTES) manifest.notes = process.env.NOTES;
  fs.writeFileSync(path.join(process.argv[1], "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
' "$OUTPUT_DIR"

printf '[Mosaico Food] Publicação pronta em %s\n' "$OUTPUT_DIR"
printf '  - %s\n' "$TARGET_NAME"
printf '  - latest.json\n'
printf '\nEnvie os dois arquivos para o servidor em:\n  %s\n' "$BASE_URL"
printf 'O arquivo latest.json deve continuar sendo servido como latest.json.\n'
