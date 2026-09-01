#!/usr/bin/env bash
#
# check-next-cache-size.sh — Turbopack 영속 캐시 비대 경고.
#
# ## 왜 필요한가 (2026-09-01 실측)
#
# Next 16의 `turbopackFileSystemCacheForDev`는 **v16.1.0부터 개발 모드 기본 활성**이고
# (`node_modules/next/dist/docs/.../turbopackFileSystemCache.md`), **크기 상한·TTL·GC가 없다**.
# 옵션은 on/off뿐이라 캐시는 무한히 자란다.
#
# 이 저장소에서는 3주 만에 `.next` 12GB(`cache/turbopack` 8.8GB)까지 자랐고, dev 서버가
# `/api/kiwoom/transfer-1month` 컴파일 중 V8 OOM으로 죽었다.
#
# ⚠️ 기전 주의 — RSS가 아니라 **JS 힙**이다. `--max-old-space-size`는 V8 힙만 제한하고
#    캐시 자체는 Rust 네이티브/mmap에 올라간다(12GB 캐시 + `--max-old-space-size=512`로도
#    정상 기동한다). 캐시가 힙을 먹는 것은 **컴파일·복원 시점**이다:
#
#      동일 10개 calc 페이지 로드 후 `used_heap`
#        캐시 238MB → 333MB      캐시 8.8GB → 4,097MB   (12배)
#
#    그래서 heap 상한을 올리는 것은 해법이 아니다 — 컴파일당 소모가 캐시 크기에 비례한다.
#
# ⚠️ 캐시를 끄는 것(`turbopackFileSystemCacheForDev: false`)도 해법이 아니다. warm 이점은
#    작은 캐시에서 이미 다 나온다 — 880MB 캐시로 재기동 후 동일 10페이지가 823ms(개별
#    36~236ms)에 힙 358MB였다. 끄면 이 이점만 잃는다. ⇒ **끄지 말고 가지치기한다.**
#
# ## 이 스크립트는 게이트가 아니라 알림이다
#
# 항상 exit 0이다. `package.json`의 dev 스크립트가 `&&`가 아니라 `;`로 잇는 이유가 이것이다 —
# 알림 하나 때문에 개발 서버가 안 뜨면 비용/편익이 뒤집힌다.
# (pre-push의 `check-workflow-runner.sh`는 **차단이 목적**이라 `&&`가 맞다 — 층위가 다르다.)
#
# 자동 삭제도 하지 않는다. `.next`는 재생성 가능하지만 삭제는 되돌릴 수 없고, 개발자가
# 의도적으로 warm cache를 유지 중일 수 있다. 삭제는 `npm run dev:clean` 또는
# `DEV_CACHE_AUTOCLEAN=1`로 **명시적으로** 요청할 때만 한다.
#
# 사용법:
#   scripts/check-next-cache-size.sh                 # 경고만
#   DEV_CACHE_THRESHOLD_MB=2048 scripts/...          # 임계 조정
#   DEV_CACHE_AUTOCLEAN=1 scripts/...                # 초과 시 자동 삭제
set -uo pipefail

CACHE_DIR="${DEV_CACHE_DIR:-.next/dev/cache}"

# 임계 4GB — 실측 근거:
#   880MB → 힙 358MB · 8.8GB → 힙 4,097MB 이므로 4GB면 힙 1.5GB 내외로 추정된다.
#   2GB로 잡으면 며칠 만에 도달해(238MB → 880MB가 10페이지 + 재기동 1회) 경고가 소음이 된다.
THRESHOLD_MB="${DEV_CACHE_THRESHOLD_MB:-4096}"

[ -d "$CACHE_DIR" ] || exit 0

SIZE_MB=$(du -sm "$CACHE_DIR" 2>/dev/null | awk '{print $1}')
[ -n "${SIZE_MB:-}" ] || exit 0
[ "$SIZE_MB" -le "$THRESHOLD_MB" ] && exit 0

# 1GB 미만이면 GB 표기가 "0.0GB"로 뭉개져 정보가 없다 — 단위를 크기에 맞춘다.
human() { awk -v m="$1" 'BEGIN{ if (m < 1024) printf "%dMB", m; else printf "%.1fGB", m/1024 }'; }
SIZE_GB=$(human "$SIZE_MB")
THRESHOLD_GB=$(human "$THRESHOLD_MB")

if [ "${DEV_CACHE_AUTOCLEAN:-}" = "1" ]; then
  echo "🧹 Turbopack 캐시 ${SIZE_GB} (임계 ${THRESHOLD_GB}) — DEV_CACHE_AUTOCLEAN=1 이므로 .next 삭제"
  rm -rf .next
  exit 0
fi

cat <<MSG

⚠️  Turbopack 영속 캐시가 ${SIZE_GB} 입니다 (임계 ${THRESHOLD_GB} · $CACHE_DIR).

    이 캐시는 컴파일 시 JS 힙을 캐시 크기에 비례해 소모합니다.
    방치하면 dev 서버가 V8 OOM(heap limit)으로 죽고, 그때 진행 중이던
    자동조회 요청은 응답 없이 끊깁니다.

    정리:  npm run dev:clean        (.next 삭제 후 재기동)
    무시:  그대로 두어도 dev 서버는 정상 기동합니다 (이 메시지는 알림입니다)

MSG
exit 0
