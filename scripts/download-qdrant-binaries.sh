#!/usr/bin/env bash
# Download official Qdrant binaries for all supported platforms.
# Run once before building: bash scripts/download-qdrant-binaries.sh
# Or via npm: npm run postinstall:qdrant
#
# Output layout:
#   resources/binaries/qdrant-linux-x64/qdrant
#   resources/binaries/qdrant-mac-x64/qdrant
#   resources/binaries/qdrant-mac-arm64/qdrant
#   resources/binaries/qdrant-win-x64/qdrant.exe

set -euo pipefail

QDRANT_VERSION="v1.18.0"
BASE_URL="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/resources/binaries"

MIN_SIZE_BYTES=10000000  # 10 MB sanity check

declare -A ARCHIVES=(
  ["qdrant-linux-x64"]="qdrant-x86_64-unknown-linux-musl.tar.gz"
  ["qdrant-mac-x64"]="qdrant-x86_64-apple-darwin.tar.gz"
  ["qdrant-mac-arm64"]="qdrant-aarch64-apple-darwin.tar.gz"
  ["qdrant-win-x64"]="qdrant-x86_64-pc-windows-msvc.zip"
)

declare -A BINARIES=(
  ["qdrant-linux-x64"]="qdrant"
  ["qdrant-mac-x64"]="qdrant"
  ["qdrant-mac-arm64"]="qdrant"
  ["qdrant-win-x64"]="qdrant.exe"
)

mkdir -p "$DEST_DIR"

download_platform() {
  local platform="$1"
  local archive="${ARCHIVES[$platform]}"
  local binary="${BINARIES[$platform]}"
  local out_dir="$DEST_DIR/$platform"
  local out_bin="$out_dir/$binary"

  if [[ -f "$out_bin" ]]; then
    local size
    size=$(stat -c%s "$out_bin" 2>/dev/null || stat -f%z "$out_bin" 2>/dev/null || echo 0)
    if [[ "$size" -gt "$MIN_SIZE_BYTES" ]]; then
      echo "[skip] $platform — binary exists (${size} bytes)"
      return 0
    fi
    echo "[warn] $platform — binary exists but too small (${size} bytes), re-downloading"
  fi

  mkdir -p "$out_dir"
  local tmp_archive
  tmp_archive="$(mktemp /tmp/qdrant-XXXXXX)"
  trap 'rm -f "$tmp_archive"' RETURN

  echo "[download] $platform — ${BASE_URL}/${archive}"
  curl -L --retry 3 --retry-delay 2 --fail \
    -o "$tmp_archive" \
    "${BASE_URL}/${archive}"

  local dl_size
  dl_size=$(stat -c%s "$tmp_archive" 2>/dev/null || stat -f%z "$tmp_archive" 2>/dev/null || echo 0)
  if [[ "$dl_size" -lt "$MIN_SIZE_BYTES" ]]; then
    echo "[error] $platform — downloaded file too small (${dl_size} bytes). Aborting."
    return 1
  fi

  echo "[extract] $platform — extracting $binary"
  if [[ "$archive" == *.zip ]]; then
    unzip -o -j "$tmp_archive" "$binary" -d "$out_dir"
  else
    tar -xzf "$tmp_archive" -C "$out_dir" "$binary"
  fi

  if [[ "$binary" != *.exe ]]; then
    chmod +x "$out_bin"
  fi

  local final_size
  final_size=$(stat -c%s "$out_bin" 2>/dev/null || stat -f%z "$out_bin" 2>/dev/null || echo 0)
  echo "[done] $platform — $out_bin (${final_size} bytes)"
}

echo "=== Qdrant binary downloader ==="
echo "Version: $QDRANT_VERSION"
echo "Destination: $DEST_DIR"
echo ""

failed=0
for platform in "${!ARCHIVES[@]}"; do
  download_platform "$platform" || failed=$((failed + 1))
done

echo ""
if [[ "$failed" -gt 0 ]]; then
  echo "[error] $failed platform(s) failed to download."
  exit 1
fi
echo "=== All platforms ready ==="
