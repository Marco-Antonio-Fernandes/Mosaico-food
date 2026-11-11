#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="Mosaico Food"
INSTALL_DIR="${MOSAICO_INSTALL_DIR:-${HOME}/.local/opt/mosaico-food}"
BIN_DIR="${HOME}/.local/bin"
APPLICATIONS_DIR="${HOME}/.local/share/applications"
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd -P)"
PAYLOAD_MARKER="__MOSAICO_FOOD_APPIMAGE_PAYLOAD__"
TEMP_DIR=""
EXTRACT_DIR=""

# Usa o disco do usuário, e não /tmp (que em muitos sistemas é tmpfs pequeno),
# para copiar o payload e extrair o AppImage (~4,5 GB).
MOSAICO_TMP_DIR="${MOSAICO_TMP_DIR:-${HOME}/.cache/mosaico-food-installer-tmp}"
mkdir -p -- "$MOSAICO_TMP_DIR"
export TMPDIR="$MOSAICO_TMP_DIR"

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
  if [[ -n "$EXTRACT_DIR" && -d "$EXTRACT_DIR" ]]; then
    rm -rf -- "$EXTRACT_DIR"
  fi
}
trap cleanup EXIT

say() { printf '[Mosaico Food] %s\n' "$*"; }
fail() { printf '[Mosaico Food] Erro: %s\n' "$*" >&2; exit 1; }

human_bytes() {
  awk -v bytes="${1:-0}" 'BEGIN {
    if (bytes >= 1073741824) printf "%.1f GB", bytes / 1073741824;
    else if (bytes >= 1048576) printf "%.1f MB", bytes / 1048576;
    else if (bytes >= 1024) printf "%.1f KB", bytes / 1024;
    else printf "%d B", bytes;
  }'
}

copy_embedded_payload() {
  local marker_line="$1"
  local embedded="$2"
  local payload_start payload_total copied percent

  payload_start="$(head -n "$marker_line" "$SCRIPT_PATH" | wc -c)"
  payload_total=$(( $(stat -c '%s' "$SCRIPT_PATH") - payload_start ))
  (( payload_total > 0 )) || fail "o payload embutido está vazio."

  printf '[Mosaico Food] Copiando o pacote do instalador (%s)...\n' "$(human_bytes "$payload_total")" >&2
  tail -n +$((marker_line + 1)) "$SCRIPT_PATH" | dd of="$embedded" bs=8M status=none conv=fsync &
  local copy_pid=$!

  while kill -0 "$copy_pid" 2>/dev/null; do
    copied="$(stat -c '%s' "$embedded" 2>/dev/null || printf '0')"
    percent=$(( copied * 100 / payload_total ))
    (( percent > 100 )) && percent=100
    printf '\r[Mosaico Food] Pacote: %3d%% (%s/%s)' "$percent" "$(human_bytes "$copied")" "$(human_bytes "$payload_total")" >&2
    sleep 1
  done
  wait "$copy_pid"
  printf '\r[Mosaico Food] Pacote: 100%% (%s/%s)\n' "$(human_bytes "$payload_total")" "$(human_bytes "$payload_total")" >&2
}

extract_appimage_with_progress() {
  local source="$1"
  local destination="$2"
  local extracted_bytes extracted_files elapsed

  say "Extraindo o aplicativo. Isso pode levar alguns minutos..."
  local offset
  offset="$("$source" --appimage-offset 2>/dev/null || true)"
  [[ "$offset" =~ ^[0-9]+$ ]] || fail "não foi possível determinar o deslocamento do AppImage."
  (
    unsquashfs -no-progress -o "$offset" -d "$destination/squashfs-root" "$source" >/dev/null
  ) &
  local extract_pid=$!
  local started_at="$(date +%s)"

  while kill -0 "$extract_pid" 2>/dev/null; do
    extracted_bytes="$(du -sb "$destination" 2>/dev/null | awk '{print $1}' || printf '0')"
    extracted_files="$(find "$destination" -type f 2>/dev/null | wc -l)"
    elapsed=$(( $(date +%s) - started_at ))
    printf '\r[Mosaico Food] Extração em andamento: %s em %s arquivos (tempo %02d:%02d)' \
      "$(human_bytes "$extracted_bytes")" "$extracted_files" "$((elapsed / 60))" "$((elapsed % 60))"
    sleep 1
  done
  wait "$extract_pid"
  printf '\r[Mosaico Food] Extração concluída: %s em %s arquivos.\n' \
    "$(human_bytes "$(du -sb "$destination" 2>/dev/null | awk '{print $1}' || printf '0')")" \
    "$(find "$destination" -type f 2>/dev/null | wc -l)"
}

show_help() {
  printf '%s\n' \
    "Instala o Mosaico Food no Arch Linux." \
    "" \
    "Uso:" \
    "  $0                         instala o AppImage embutido" \
    "  $0 /caminho/Mosaico.AppImage instala um AppImage ao lado do instalador" \
    "" \
    "O instalador instala as bibliotecas do sistema com pacman e o aplicativo" \
    "com backend, banco local e módulo/modelo de escuta de áudio." \
    "A pasta de instalação pode ser alterada com MOSAICO_INSTALL_DIR."
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ ! -r /etc/os-release ]]; then
  fail "não foi possível identificar o sistema operacional."
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ ! -f /etc/arch-release && "${ID:-}" != "arch" && "${ID_LIKE:-}" != *arch* ]]; then
  fail "este instalador é destinado ao Arch Linux."
fi

if ! command -v pacman >/dev/null 2>&1; then
  fail "pacman não foi encontrado."
fi

PACMAN_PACKAGES=(
  git
  fuse2
  gtk3
  nss
  nspr
  glib2
  dbus
  libx11
  libxcb
  libxcomposite
  libxdamage
  libxfixes
  libxi
  libxrandr
  libxss
  libxtst
  libxkbcommon
  libxkbcommon-x11
  libdrm
  mesa
  alsa-lib
  at-spi2-core
  cups
  pango
  cairo
  gdk-pixbuf2
  fontconfig
  freetype2
  xdg-utils
  ffmpeg
  squashfs-tools
)

# Áudio é opcional: em muitos Arch já existe PipeWire configurado e uma
# instalação forçada pode conflitar e abortar toda a transação do pacman.
PACMAN_AUDIO_PACKAGES=(
  pipewire
  pipewire-pulse
  libpulse
)

run_pacman() {
  if [[ "${EUID}" -eq 0 ]]; then
    pacman "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo pacman "$@"
  else
    fail "sudo é necessário para instalar as dependências do Arch."
  fi
}

node_ready() {
  local node_bin npm_bin
  node_bin="$(command -v node 2>/dev/null || true)"
  npm_bin="$(command -v npm 2>/dev/null || true)"
  for candidate in /usr/bin/node /usr/local/bin/node /usr/sbin/node; do
    if [[ -x "$candidate" ]] && "$candidate" --version >/dev/null 2>&1; then node_bin="$candidate"; break; fi
  done
  for candidate in /usr/bin/npm /usr/local/bin/npm /usr/sbin/npm; do
    if [[ -x "$candidate" ]] && "$candidate" --version >/dev/null 2>&1; then npm_bin="$candidate"; break; fi
  done
  if [[ -n "$node_bin" && -x "$node_bin" && -n "$npm_bin" && -x "$npm_bin" ]] && "$node_bin" --version >/dev/null 2>&1 && "$npm_bin" --version >/dev/null 2>&1; then
    NODE_BIN="$node_bin"
    NPM_BIN="$npm_bin"
    return 0
  fi
  return 1
}

find_payload_source() {
  if [[ -n "${1:-}" ]]; then
    [[ -f "$1" ]] || fail "AppImage não encontrado: $1"
    printf '%s\n' "$1"
    return
  fi

  local sibling
  sibling="$SCRIPT_DIR/Mosaico Food.AppImage"
  if [[ -f "$sibling" ]]; then
    printf '%s\n' "$sibling"
    return
  fi

  local marker_line
  marker_line="$(awk -v marker="$PAYLOAD_MARKER" '$0 == marker { print NR; exit }' "$SCRIPT_PATH")"
  [[ -n "$marker_line" ]] || fail "não encontrei o payload do AppImage."
  TEMP_DIR="$(mktemp -d)"
  local embedded="$TEMP_DIR/Mosaico Food.AppImage"
  copy_embedded_payload "$marker_line" "$embedded"
  [[ -s "$embedded" ]] || fail "o payload embutido está vazio."
  printf '%s\n' "$embedded"
}

APPIMAGE_SOURCE="$(find_payload_source "${1:-}")"
[[ -f "$APPIMAGE_SOURCE" ]] || fail "não foi possível acessar o AppImage."

# Node e npm são obrigatórios para o botão Atualizar. Instale-os primeiro,
# separados do restante, para que um conflito de áudio/vídeo não impeça isso.
say "Verificando Node.js e npm..."
if ! node_ready; then
  say "Node.js/npm ausentes; instalando nodejs e npm..."
  run_pacman -S --needed --noconfirm nodejs npm || true
  if ! node_ready; then
    fail "Node.js e npm são obrigatórios para o botão Atualizar. Rode 'sudo pacman -S nodejs npm' e execute o instalador novamente."
  fi
fi
say "Node.js $("$NODE_BIN" --version) e npm $("$NPM_BIN" --version) prontos para o botão Atualizar."

say "Verificando dependências do Arch Linux..."
if ! run_pacman -S --needed --noconfirm "${PACMAN_PACKAGES[@]}"; then
  say "Aviso: alguns pacotes do sistema não puderam ser atualizados automaticamente."
  say "O aplicativo pode abrir mesmo assim. Se algo faltar, rode 'sudo pacman -Syu' e execute o instalador novamente."
fi

for package in "${PACMAN_AUDIO_PACKAGES[@]}"; do
  run_pacman -S --needed --noconfirm "$package" >/dev/null 2>&1 || true
done

say "Extraindo o aplicativo para $INSTALL_DIR..."
install -d -m 0755 "$INSTALL_DIR" "$BIN_DIR" "$APPLICATIONS_DIR"
EXTRACT_DIR="$(mktemp -d)"
chmod 0755 "$APPIMAGE_SOURCE"
extract_appimage_with_progress "$APPIMAGE_SOURCE" "$EXTRACT_DIR"
[[ -x "$EXTRACT_DIR/squashfs-root/mosaico-food" ]] || fail "não foi possível extrair o aplicativo."
rm -rf -- "$INSTALL_DIR/app"
mv -- "$EXTRACT_DIR/squashfs-root" "$INSTALL_DIR/app"
EXTRACT_DIR=""

LAUNCHER="$BIN_DIR/mosaico-food"
printf '%s\n' '#!/usr/bin/env bash' "exec \"$INSTALL_DIR/app/mosaico-food\" \"\$@\"" > "$LAUNCHER"
chmod 0755 "$LAUNCHER"

ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
install -d -m 0755 "$ICON_DIR"
if [[ -f "$INSTALL_DIR/app/mosaico-food.png" ]]; then
  cp -- "$INSTALL_DIR/app/mosaico-food.png" "$ICON_DIR/mosaico-food.png"
fi

DESKTOP_FILE="$APPLICATIONS_DIR/mosaico-food.desktop"
printf '%s\n' \
  '[Desktop Entry]' \
  'Type=Application' \
  'Name=Mosaico Food' \
  'Comment=Operação da loja, caixa, estoque e atendimento' \
  "Exec=\"$LAUNCHER\" %U" \
  'Icon=mosaico-food' \
  'Terminal=false' \
  'Categories=Office;Utility;' \
  'StartupNotify=true' > "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

say "Instalação concluída."
say "Abra pelo menu de aplicativos ou execute: $LAUNCHER"
say "O áudio usa o whisper-server e o modelo local incluídos no aplicativo."

exit 0

__MOSAICO_FOOD_APPIMAGE_PAYLOAD__
