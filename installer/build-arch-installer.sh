#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEMPLATE="$ROOT_DIR/installer/install-mosaico-food-arch.sh"
RELEASE_DIR="$ROOT_DIR/apps/desktop/release"
OUTPUT="$RELEASE_DIR/Mosaico-Food-Arch-Installer.run"
UNPACKED_DIR="$RELEASE_DIR/linux-unpacked"
APPIMAGE_RUNTIME="${MOSAICO_APPIMAGE_RUNTIME:-${XDG_CACHE_HOME:-${HOME}/.cache}/electron-builder/appimage/appimage-12.0.1/runtime-x64}"
MKSQUASHFS="${MOSAICO_MKSQUASHFS:-${XDG_CACHE_HOME:-${HOME}/.cache}/electron-builder/appimage/appimage-12.0.1/linux-x64/mksquashfs}"

[[ -f "$TEMPLATE" ]] || { printf 'Template não encontrado: %s\n' "$TEMPLATE" >&2; exit 1; }

printf '[Mosaico Food] Gerando o AppImage com backend e áudio...\n'
NEEDS_LOCAL_APPIMAGE=0
if [[ "${MOSAICO_SKIP_ELECTRON_PACKAGE:-0}" == "1" ]]; then
  printf '[Mosaico Food] Usando o linux-unpacked já preparado.\n'
  NEEDS_LOCAL_APPIMAGE=1
elif ! npm --prefix "$ROOT_DIR/apps/desktop" run package:linux; then
  NEEDS_LOCAL_APPIMAGE=1
fi

if [[ "$NEEDS_LOCAL_APPIMAGE" == "1" ]]; then
  if [[ ! -x "$UNPACKED_DIR/mosaico-food" || ! -f "$APPIMAGE_RUNTIME" || ! -x "$MKSQUASHFS" ]]; then
    printf 'O empacotamento Electron falhou e as ferramentas locais do AppImage não estão disponíveis.\n' >&2
    exit 1
  fi
  printf '[Mosaico Food] Rede indisponível; montando o AppImage com o cache local...\n'
  chmod 0755 "$APPIMAGE_RUNTIME"
  STAGING_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$STAGING_DIR"' EXIT
  cp -a "$UNPACKED_DIR/." "$STAGING_DIR/"
  printf '%s\n' '#!/bin/sh' 'HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"' 'exec "$HERE/mosaico-food" "$@"' > "$STAGING_DIR/AppRun"
  chmod 0755 "$STAGING_DIR/AppRun"
  printf '%s\n' '[Desktop Entry]' 'Name=Mosaico Food' 'Exec=mosaico-food' 'Icon=mosaico-food' 'Type=Application' 'Categories=Utility;' > "$STAGING_DIR/mosaico-food.desktop"
  if [[ -f "$ROOT_DIR/apps/desktop/electron/assets/mosaico-food.png" ]]; then
    cp "$ROOT_DIR/apps/desktop/electron/assets/mosaico-food.png" "$STAGING_DIR/mosaico-food.png"
  fi
  SQUASHFS_PATH="$RELEASE_DIR/mosaico-food-current.squashfs"
  "$MKSQUASHFS" "$STAGING_DIR" "$SQUASHFS_PATH" -noappend -all-root -no-xattrs -comp xz
  cat "$APPIMAGE_RUNTIME" "$SQUASHFS_PATH" > "$RELEASE_DIR/Mosaico Food-0.1.0.AppImage"
  chmod 0755 "$RELEASE_DIR/Mosaico Food-0.1.0.AppImage"
  rm -f "$SQUASHFS_PATH"
fi

APPIMAGE="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*.AppImage' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
[[ -n "$APPIMAGE" && -f "$APPIMAGE" ]] || { printf 'Nenhum AppImage foi gerado em %s\n' "$RELEASE_DIR" >&2; exit 1; }

mkdir -p "$RELEASE_DIR"
cat "$TEMPLATE" "$APPIMAGE" > "$OUTPUT"
chmod 0755 "$OUTPUT"

printf '[Mosaico Food] Instalador pronto: %s\n' "$OUTPUT"
printf '[Mosaico Food] AppImage incorporado: %s\n' "$APPIMAGE"
