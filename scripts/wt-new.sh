#!/usr/bin/env bash
#
# wt-new.sh — 동시 작업용 worktree 생성 + 단점 제거 셋업을 한 명령으로
#
#   ① git worktree add  (.claude/worktrees/<name>, 기존 컨벤션)
#   ② .env.local 심볼릭 링크   → Supabase/키움/법제처 키 드리프트 차단
#   ③ node_modules 심볼릭 링크 → 디스크·npm install 시간 0 (pnpm 동등 효과, 마이그레이션 0)
#   ④ 결정적 포트 배정         → DEV_PORT=3000+slot / E2E_PORT=3100+slot, 경합 끝
#
# 사용법:
#   scripts/wt-new.sh <name> [branch] [base]
#     <name>   worktree 폴더명·slot 추적 키 (영숫자/-/_/+)
#     [branch] 새 브랜치명           (기본 feat/<name>)
#     [base]   분기 기준 commit-ish  (기본 origin/master — fetch로 최신화 후 분기)
#
#   기본 base를 origin/master로 두는 이유: 로컬 master ref가 동시 세션 worktree에
#   점유되면 PR 머지 후에도 갱신되지 않아 stale → 그 stale master에서 분기하면
#   방금 머지한 변경이 빠진다. origin/master(+fetch)는 항상 최신 원격을 가리킨다.
#
#   예) scripts/wt-new.sh gift-fix
#       scripts/wt-new.sh acq-rate feat/acq-rate-12 origin/master
#       scripts/wt-new.sh hotfix feat/hotfix HEAD   # 명시 base는 그대로 존중(fetch 생략)
#
# 정리: scripts/wt-rm.sh <name>
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

NAME="${1:-}"
BRANCH="${2:-}"
BASE_ARG="${3:-}"
BASE="${BASE_ARG:-origin/master}"

if [[ -z "$NAME" ]]; then
  echo "usage: scripts/wt-new.sh <name> [branch] [base]" >&2
  exit 1
fi
if [[ ! "$NAME" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  echo "✗ name은 영숫자 . _ + - 만 허용 (슬래시 불가): $NAME" >&2
  exit 1
fi

BRANCH="${BRANCH:-feat/$NAME}"
WT_BASE="$REPO_ROOT/.claude/worktrees"
WT_DIR="$WT_BASE/$NAME"

if [[ -e "$WT_DIR" ]]; then
  echo "✗ 이미 존재: $WT_DIR" >&2
  exit 1
fi

# ── 결정적 slot 할당: 기존 worktree들의 .wt-ports에서 사용 중 slot을 모아 최소 빈 번호 ──
used_slots=""
if [[ -d "$WT_BASE" ]]; then
  while IFS= read -r f; do
    s="$(grep -m1 '^SLOT=' "$f" 2>/dev/null | cut -d= -f2 || true)"
    [[ -n "$s" ]] && used_slots="$used_slots $s "
  done < <(find "$WT_BASE" -maxdepth 2 -name .wt-ports 2>/dev/null)
fi

slot=1
while [[ "$used_slots" == *" $slot "* ]]; do
  slot=$((slot + 1))
done

DEV_PORT=$((3000 + slot))   # 메인 repo는 slot 0(3000) 예약
E2E_PORT=$((3100 + slot))

# ── 사전 점검 ──
if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "⚠ 메인 repo에 node_modules 없음 — 먼저 'npm install' 후 재실행 권장 (링크는 생략됨)" >&2
fi
if [[ ! -f "$REPO_ROOT/.env.local" ]]; then
  echo "⚠ 메인 repo에 .env.local 없음 — 링크 생략 (키 없이 graceful 통과)" >&2
fi

# ── 기본 base(origin/master)면 추적 ref 신선화 — 동시 세션의 PR 머지 즉시 반영 ──
#   명시 base($3)를 준 경우는 의도 존중 → fetch 생략.
if [[ -z "$BASE_ARG" ]]; then
  if git fetch --quiet origin master 2>/dev/null; then
    echo "  ✓ origin/master fetch (최신 반영)"
  else
    echo "⚠ origin/master fetch 실패(오프라인?) — 현재 추적 ref로 진행" >&2
  fi
fi

# ── ① worktree 생성 ──
echo "▸ worktree add: $WT_DIR  ($BRANCH ← $BASE)"
git worktree add "$WT_DIR" -b "$BRANCH" "$BASE"

# ── ②③ 심볼릭 링크 (절대경로 — worktree 어디서 실행해도 유효) ──
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  ln -s "$REPO_ROOT/.env.local" "$WT_DIR/.env.local"
  echo "  ✓ .env.local 링크"
fi
if [[ -d "$REPO_ROOT/node_modules" ]]; then
  ln -s "$REPO_ROOT/node_modules" "$WT_DIR/node_modules"
  echo "  ✓ node_modules 링크 (공유)"
fi

# ── ④ 포트 기록 (다음 생성 시 slot 충돌 회피용) ──
# info/exclude는 worktree 간 공유 → .gitignore 미커밋 상태에서도 .wt-ports 즉시 무시 (멱등)
EXCLUDE="$(git rev-parse --git-path info/exclude)"
if [[ -f "$EXCLUDE" ]] && ! grep -qxF '.wt-ports' "$EXCLUDE"; then
  echo '.wt-ports' >> "$EXCLUDE"
fi

cat > "$WT_DIR/.wt-ports" <<EOF
SLOT=$slot
DEV_PORT=$DEV_PORT
E2E_PORT=$E2E_PORT
EOF

echo
echo "✅ 준비 완료 — slot $slot"
echo "   cd .claude/worktrees/$NAME"
echo "   npm run dev -- -p $DEV_PORT          # dev  → http://localhost:$DEV_PORT"
echo "   E2E_PORT=$E2E_PORT npm run test:e2e   # E2E"
echo
echo "ℹ node_modules는 메인과 공유됨. 이 worktree에서 의존성을 바꾸려면(npm install/add)"
echo "  메인 repo에서 실행하세요 — 모든 worktree에 동시 반영됩니다."
