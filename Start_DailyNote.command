#!/bin/bash
# macOS local launcher. No downloads or npm installation at startup.
set -eu
cd -- "$(dirname -- "$0")"
fail() {
  printf '\n%s\n' "$1" >&2
  if [ -t 0 ]; then read -r -p 'Enter를 누르면 닫힙니다. ' _; fi
  exit 1
}
[ "$(uname -s)" = Darwin ] || fail '이 파일은 맥용입니다. Windows에서는 Start_DailyNote.bat를 실행하세요.'
case "$(uname -m)" in
  arm64) architecture=arm64 ;;
  x86_64) architecture=x64 ;;
  *) fail '지원하지 않는 맥 CPU입니다.' ;;
esac
node_bin="$PWD/runtime/darwin-$architecture/bin/node"
if [ -f "$node_bin" ]; then
  chmod u+x "$node_bin" || fail '런타임 실행 권한을 설정하지 못했습니다. 쓰기 가능한 폴더에 압축을 풀어 주세요.'
elif command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
else
  fail '맥용 런타임이 없습니다. GitHub Actions의 DailyNote-macOS 패키지를 받아 주세요. Git의 소스 ZIP만 받은 경우 Node.js 24가 필요합니다.'
fi
unset NODE_OPTIONS PORT
if "$node_bin" "$PWD/scripts/portable-start.cjs"; then
  exit 0
else
  fail 'DailyNote 실행에 실패했습니다. 위 오류를 확인해 주세요.'
fi
