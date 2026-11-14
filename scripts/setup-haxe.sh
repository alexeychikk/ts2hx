#!/usr/bin/env bash
# Populates the project-local haxelib repo (.haxelib/) with the libraries pinned in ADR 0003.
set -euo pipefail

HXCPP_VERSION=4.3.184
HXCS_VERSION=4.2.0
FORMATTER_VERSION=1.18.0

cd "$(dirname "${BASH_SOURCE[0]}")/.."

neko_dir="$(dirname "$(command -v neko)")"
export LD_LIBRARY_PATH="${neko_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

[ -d .haxelib ] || haxelib newrepo

is_installed() {
  [ -d ".haxelib/$1/${2//./,}" ]
}

install_lib() {
  local name=$1 version=$2
  if ! is_installed "$name" "$version"; then
    haxelib install "$name" "$version" --always --quiet
  fi
  haxelib set "$name" "$version" --always
}

install_hxcpp() {
  if ! is_installed hxcpp "$HXCPP_VERSION"; then
    local tmp
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' RETURN
    curl -fsSL -o "$tmp/hxcpp.zip" \
      "https://github.com/HaxeFoundation/hxcpp/releases/download/v${HXCPP_VERSION}/hxcpp-${HXCPP_VERSION}.zip"
    haxelib install "$tmp/hxcpp.zip" --always --quiet
  fi
  haxelib set hxcpp "$HXCPP_VERSION" --always
}

install_hxcpp
install_lib hxcs "$HXCS_VERSION"
install_lib formatter "$FORMATTER_VERSION"

haxelib list
