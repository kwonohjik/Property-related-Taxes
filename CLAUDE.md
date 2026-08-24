# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KoreanTaxCalc** — 한국 부동산 6대 세금 자동계산 웹 앱 (양도·상속·증여·취득·재산·종합부동산세).

- 구현 현황: 6대 세목 + 주식양도세 전부 엔진·UI·API·결과뷰·테스트 완료. 계산 결과 선택 출력 공통화(8 결과뷰). 상속·증여세는 별지 서식(별지9호·부표2·3·5 등) PDF 재현까지 확장.
- 최근 완료 이력: [`docs/00-pm/recent-completions.md`](docs/00-pm/recent-completions.md). (초기 로드맵은 현황과 차이 큼 — Next.js 16·6세목 완료 미반영.)
- 양도세 감면 23개 조문 확장: `lib/tax-engine/transfer-reductions/` 대부분 구현 완료 (`metadata.isFullyImplemented` 기준).

## ⚠️ Next.js 16 주의사항

**This is NOT the Next.js you know** — API·컨벤션이 학습 데이터와 다를 수 있다.

- `middleware.ts` → `proxy.ts` rename. 세션 처리는 `proxy.ts`.
- 변경 사항 확인 시 `node_modules/next/dist/docs/` 가이드를 먼저 읽을 것.

## Commands

```bash
npm run dev                   # 개발 서버 (Turbopack)
npm run build                 # 프로덕션 빌드
npm run typecheck             # tsc --noEmit
npm run lint                  # ESLint
npm run check:pre-pr          # typecheck + lint + test (PR 전 수동 게이트)
npm test                      # vitest 전체 (1회)
npm run test:watch            # vitest 감시 모드
npx vitest run <path>         # 단일 파일/디렉터리
npx vitest run -t "T-01"      # 이름 패턴
npx playwright test <spec>    # E2E 단일 스펙 (비-worktree는 E2E_PORT 생략, 기본 3000)
npx shadcn@latest add <name>  # shadcn/ui 컴포넌트 추가

# 데이터·법령 (.env.local 필요)
npm run seed:tax-rates        # Supabase tax_rates 시딩
npm run verify:legal          # 법령 조문 상수 검증 (:refresh = 캐시 무효화 후)
```

**자동 게이트**: husky pre-commit(lint-staged) + pre-push(폰트·톤·**워크플로 러너** + typecheck + **lint** + **범위 선택 테스트**) + CI(GitHub 호스팅 러너).

### CI는 GitHub 호스팅 러너에서 돈다 (2026-08-04 환원 — 저장소 public 전환)

2026-07-31~08-04에는 **self-hosted(개발자 Mac)**로 돌렸다. 이유는 **비공개 저장소**의 무료 한도였다 — 월 2,000분인데 종전 CI는 `push`·`pull_request`를 **둘 다** 트리거해 변경 1건당 **2회**(각 10.4~14.4분 실측) 돌아 **약 83건**이면 소진됐고(2026-07-30 하루 9건 머지 ≈ 216분), 소진 후 실행은 3~13초 만에 거부되어(`spending limit needs to be increased`) **과금도 신호도 없는** 상태였다.

**저장소가 public이 되면서 두 전제가 동시에 뒤집혔다**:

1. **public 저장소는 호스팅 러너가 무료**다 — Actions 분을 쓰지 않으므로 한도 문제 자체가 사라졌다.
2. **public에서 self-hosted는 위험**하다 — fork PR이 개발자 Mac에서 임의 코드를 실행할 수 있다. GitHub이 명시적으로 권장하지 않는 조합이다.

부수 효과로 **Mac 전원과 무관하게 CI가 돈다**(종전에는 러너가 꺼져 있으면 체크가 큐에 대기했다). `~/actions-runner/`는 더 이상 CI 경로가 아니다 — 서비스는 중지해도 된다(`~/actions-runner/svc.sh stop`).

> ⚠️ **저장소를 다시 비공개로 되돌리면 1번 근거가 사라진다.** 그때는 사용량을 먼저 확인하고 self-hosted 복귀를 검토할 것 — `scripts/check-workflow-runner.sh`의 방향도 함께 되돌려야 한다.

**역할 분담 — pre-push와 중복되지 않게**:

| | 시점 | 내용 |
|---|---|---|
| **pre-push** | 매 푸시 (빠름) | 폰트·톤 + typecheck + **lint** + **범위 선택** 테스트 |
| **CI** | PR 1회 (철저) | fresh checkout + **`npm ci`** + typecheck + lint + **전체** 테스트 + **E2E** |

##### 🔴 호스팅 러너는 Mac보다 훨씬 느리다 — job 분리 + E2E 4샤딩 (2026-08-05)

환원 직후의 **단일 job 구성은 호스팅 러너에서 한 번도 완주하지 못했다**(3전 3패, 전부 타임아웃 취소 — PR #1056·#1058·#1059). 실측 분해(run 30962559594):

| 단계 | 호스팅(ubuntu-latest) | self-hosted(Mac) |
|---|---|---|
| npm ci·typecheck·lint | 2.5분 | ~1.5분 |
| npm test (vitest) | **18.7분** | 3.1분 |
| E2E 894건 | **~29분**(2 worker) | ~5분(5 worker) |
| **합계** | **~50분** | 9~10분 |

원인은 **코어 수**다 — 호스팅 러너는 2 worker, Mac은 5 worker로 잡힌다. vitest·Playwright 둘 다 코어 수에 비례해 병렬도를 정하므로 그대로 몇 배가 된다.

⇒ **`check`(vitest)와 `e2e`를 별도 job으로 분리**하고 E2E를 **6샤드**로 나눈다(2026-08-04 4샤드로 시작 → **2026-08-08 `a8da141d`에서 6샤드**). 두 job은 서로 기다리지 않는다(`needs` 없음) — public 저장소는 Actions 분이 무료라 **벽시계가 유일한 비용**이다. 샤드 리포트는 `e2e-report` job이 `merge-reports`로 HTML 하나로 합친다.

> ⚠️ **"실측 10분"은 Mac 수치였다.** PR #1059가 그 값을 호스팅 실측으로 오인해 타임아웃을 25분으로 줄였고, 결과는 **더 일찍 죽은 것뿐**이었다. `timeout-minutes`는 **호스팅 러너 실측**으로만 갱신할 것 — 러너가 다르면 다른 숫자다.
>
> ⚠️ **샤드 수를 바꾸면 `--shard=N/6`의 분모도 함께** 바꿔야 한다(`ci.yml:137`에 같은 경고가 있다). 어긋나면 일부 테스트가 어느 샤드에도 안 들어가 **조용히 실행되지 않는다**.

##### ✅ 법제처 API 의존 spec은 **fixture mock** (2026-08-06 — 원인 규명 후 해소)

`law-*.spec.ts` 16파일 **29건** 중 **5건**(POPUP-1·HTML-1·TBL-1·CITE-1·IMP-1)만 **조문 본문**을 단언한다. 나머지 24건은 다이얼로그 제목·라우팅 배너 등 **props/정규식 파생 값만** 보므로 API 없이도 통과한다 — **즉 24건 통과는 API 가용성을 증명하지 않는다**(`PLAW-2`가 실패 run에서 1.2초 통과).

**원인 규명 (48회 전수 실측)**: success **32** · failure **16** = **실패율 33%**. 상시 장애가 아니라 **러너 인스턴스에 종속된 이항(binary) 상태**다 — `31055656433`(23:14 실패)이 도는 **중에** 시작한 `31055699662`(23:15)·`31055996368`(23:20)은 **둘 다 성공**했다. ⇒ 시각·동시성·OC 키 요인이 아니다.

계기는 **`836139a1`(2026-08-04)** 이다. public 전환으로 self-hosted(**개발자 Mac = 한국 IP**) → **`ubuntu-latest`(Azure = 해외 IP)** 로 환원했고, 법제처 DRF가 Azure 대역 **일부**에서 연결되지 않는다. 전면 차단은 아니다(미국에서 `www.law.go.kr` 연결 성공). 증상은 `fetch failed` — **HTTP 레이어에 도달조차 못 한** 저수준 실패다(4xx/5xx면 `법제처 API 오류 (503)`으로 뜬다).

> ⚠️ **기각된 가설**(재검토 금지): 샤드 동시 호출(당시 4샤드 — 오진: `--workers=1`로도 실패) · IPv6(AAAA 레코드 없음) · 캐시(`.legal-cache/`는 `.gitignore:48`이라 CI엔 애초에 없다) · 해외 IP 전면차단 · 시간대.

⇒ **판별은 소요시간으로 즉시 된다** — success **2분20초~4분13초**, failure **10분18초~10분35초**(48건 예외 없음).

⇒ 5건을 `page.route` **fixture mock**으로 돌렸다(`e2e/_helpers/law-api-mock.ts`). 외부 정부 API 의존 E2E를 mock하는 것은 이 저장소의 **확립된 패턴**(14 spec)이고 `law-*`만 예외였다. 가용성 감시는 **`.github/workflows/law-api-health.yml`(주간 스케줄)** 이 이어받는다 — `LAW_E2E_LIVE=1`이 mock을 우회한다.

> 🔑 **키는 여전히 필요하다.** `/law` 페이지는 `KOREAN_LAW_OC`가 없으면 검색창을 렌더하지 않고 안내 화면을 띄운다 — mock으로 우회되지 않는 **서버 사이드 게이트**다.
> ⚠️ **fixture는 실제 응답 원문이어야 한다.** 실응답은 박스표가 개행 없이 한 줄로 붙어서 오고, 그것을 복원하는 `restoreBoxTableLines`를 지키는 것이 HTML-1의 존재 이유다. 손으로 만든 이상적인 JSON을 넣으면 **회귀 테스트가 조용히 무의미해진다**. 갱신은 `LAW_FIXTURE_CAPTURE=1`(한국 IP에서).

> 🔴 **교훈 — `continue-on-error`는 체크를 초록으로 만들지 않는다** (실측 정정 2026-08-05, 이 문제로 배운 것이라 남긴다).
> **job 레벨 플래그는 그 job의 conclusion을 `failure` 그대로 둔다**:
>
> | run | law 결과 | job conclusion |
> |---|---|---|
> | 30968955696 | 29 passed | success (실제 통과) |
> | 30974419277 | **5 failed** | **failure** ← 플래그가 있어도 빨간불 |
>
> 그때 머지가 가능했던 것은 **master에 브랜치 보호가 없기** 때문이지 플래그 덕이 아니었다.

##### ⏱️ CI 테스트 타임아웃 60초 (로컬 30초) — 2코어 러너 대응

호스팅 러너는 **2 worker**(Mac 5)라 브라우저 안에서 도는 작업이 몇 배 느리다. `transfer-multi-*` 계열의 `beforeEach`(`page.evaluate` → `indexedDB.open` → Dexie 스토어 생성)가 기본 30초에 걸린다.

실측(run 30968955696 샤드 4): 실패·flaky **10건이 전부 30.1~30.4초** — "느려서 못 끝낸 것"이지 단언이 틀린 게 아니다(8~9건은 재시도로 통과).

⇒ `playwright.config.ts` `timeout: IS_CI ? 60_000 : 30_000`.

> ⚠️ 타임아웃 상향은 **단언을 약화시키지 않는다** — 틀린 결과는 60초를 줘도 틀리다. 다만 진짜 성능 회귀를 늦게 알아채게 되므로 **로컬은 30초를 유지**해 개발 중에 느려짐이 먼저 드러나게 둔다.

> 📌 종전에는 샤딩 job과 `e2e-law` job으로 나뉘어 **"두 job의 합이 전건인지"** 확인해야 했다(어긋나면 조용한 미실행). 2026-08-06에 law spec을 샤드로 되돌려 그 위험은 사라졌다 — 이제 **샤드 6개**가 전건을 나눈다.
> ```bash
> CI=1 npx playwright test --list | tail -1   # 전건 수 확인
> ```

- **lint는 pre-push로 이관했다**(실측 26초). 종전엔 lint-staged가 변경 파일만 `--fix`하고 전체 lint 관문이 CI뿐이었는데 그 CI가 상시 실패해 **실질 관문이 없었다**.
- **CI가 주는 고유 신호는 fresh `npm ci`**다 — 러너가 매번 깨끗한 환경이라 로컬 node_modules가 가리던 lockfile·의존성 문제가 드러난다. 그 신호가 유일하므로 CI는 **범위를 좁히지 않고 전체 테스트**를 돌린다(좁히면 pre-push의 재탕이 된다).
- **Node 버전은 `setup-node`로 24에 고정**한다(로컬과 메이저 일치). 명시하지 않으면 러너 기본 Node가 더 낮아 로컬에서 통과한 코드가 CI에서만 깨질 수 있다.

#### E2E는 CI에만 있다 (2026-08-03 추가)

**종전엔 E2E가 어느 자동 게이트에도 없었다** — pre-push도 CI도 vitest만 돌렸다. 그래서 PR#1008이 `gift-deemed-capital-increase.spec.ts`를 **조용히 무력화**시킨 것을 다음 작업에서야 발견했다(`toContainText("0")`이 substring이라 `"300,000,000"`도 통과 → 깨진 게 아니라 검증을 멈춘 것).

pre-push에는 넣지 않는다 — 매 푸시에 붙으면 개발 흐름이 끊긴다. PR 1회만, **별도 job 6샤드**로 돌린다(위 표).

두 전제가 이 게이트를 의미 있게 만든다(`playwright.config.ts`):

- **CI 포트 3199** — 호스팅 러너에서는 불필요하지만 유지한다. 로컬에서 `CI=1`로 재현할 때 3000의 dev 서버를 `reuseExistingServer`가 잡아 **PR 코드가 아니라 로컬 작업 트리**를 테스트하는 것을 막아준다. `reuseExistingServer: !CI`도 함께 건다.
- ⚠️ **호스팅 러너는 Linux**다. Mac 기준으로 쌓인 known-failures와 어긋나 렌더 차이로 새 실패가 나올 수 있다 — 원인을 확인해 고칠 것(목록에 추가는 금지).
- **`e2e/known-failures.ts`** — master에도 실패하는 **16건**을 제외한다. 그대로 넣으면 CI가 상시 빨간불이 되어 게이트 구실을 못 한다(lint가 상시 실패 CI에만 있어 실질 관문이 없던 것과 같은 실패). **목록은 줄이기만 한다** — 새 실패를 추가하는 것은 회귀를 숨기는 것이다.

**spec은 포트를 하드코딩하지 않는다** — `page.goto("/calc/...")` 상대경로로 `baseURL`을 쓴다. `http://localhost:3000` 고정 spec 1건이 CI 포트에서 전건 실패해 정정했다(`inheritance-cohabit-redev-right`).

#### 법령 검증 커버리지 100%는 vitest가 지킨다 (2026-08-03)

`legal-codes/`에 새 조문을 인용하면 **`lib/legal-verification/manifest/additions-{세목}.ts`에도 등록**해야 한다. 등록하지 않으면 그 조문은 `npm run verify:legal` 대상에서 **조용히 빠져**, 개정돼도 아무도 알려주지 않는다.

이 갭은 **두 번 재발**했다(2026-06-08 4건 · 2026-08-03 9건). 둘 다 E2E가 빨개진 뒤에야 발견됐다.

⇒ `__tests__/lib/legal-verification-coverage-complete.test.ts`가 게이트다. **커버리지 계산은 순수 정적 분석**(법제처 API·`.env.local` 불필요)이라 vitest에 둘 수 있고, 그래서 **pre-push와 CI 전체 테스트 양쪽에서** 자동으로 잡힌다. 실패하면 누락 조문명을 그대로 출력한다.

키워드는 **KoreanLaw MCP로 조회한 본문의 verbatim 표현**이어야 한다(강학상 용어 금지). 등록 후 `npm run verify:legal`로 키워드가 실제 법문과 맞는지 확인한다.
- 문서 전용(`**.md`·`docs/**`·`.claude/**`)·draft PR은 건너뛴다 — **대기시간** 때문이다.

#### 🔒 신규 워크플로는 `runs-on: ubuntu-latest`가 **기본**이다 (pre-push 하드블록)

**방향이 2026-08-04에 뒤집혔다.** 종전에는 GitHub 호스팅을 차단했지만(비공개 저장소 한도), 지금은 **self-hosted를 차단**한다 — public 저장소에서는 fork PR이 개발자 Mac에서 임의 코드를 실행할 수 있다. `scripts/check-workflow-runner.sh`가 `.github/workflows/**`를 검사해 **pre-push에서 차단**한다(폰트·톤 게이트와 동일 층위 — 우회 금지).

- `supabase-keepalive`(3일마다)·`matrix-update`(분기 1회)는 종전 예외였으나, 이제 전 워크플로가 호스팅이라 **예외 개념 자체가 필요 없다**. keepalive가 밀리면 Supabase가 pause되어 세율 로드가 fallback으로 떨어지므로 스케줄 유지는 여전히 중요하다.
- 저장소를 비공개로 되돌리면 이 게이트의 방향도 함께 되돌릴 것(스크립트 상단 주석에 근거를 남겼다).

### 테스트 범위 정책 (2026-07-28 — 반복 검증에 전체 실행 금지)

전체 `npm test`는 **1036파일 11628테스트 ≈ 152초**다. 작업 중 반복 실행하면 그 자체가 최대 시간 낭비다.

| 상황 | 명령 | 실측 |
|---|---|---|
| 작업 중 반복 검증 | `npx vitest run __tests__/tax-engine/{tax}/ __tests__/calc/` | ~36초 |
| 세목 단위 회귀 | `npm run test:{transfer\|acquisition\|property\|comprehensive\|inheritance\|gift}` | ~59초(transfer) |
| push 직전·PR 전 | pre-push가 자동 판정 / `npm run check:pre-pr` | ~152초 |

**pre-push는 변경 경로로 범위를 자동 판정**한다(`scripts/select-test-scope.sh`, 판정 회귀 테스트 `scripts/select-test-scope.test.sh` 14케이스):

- `components/calc/{tax}/**` · `app/calc/{tax}-tax/**` · `app/api/calc/{tax}/**` · `lib/calc/{tax}-tax*` · `__tests__/**/{tax}*` **만** 바뀌면 → 그 세목 스크립트만
- `docs/**`·`*.md`·`e2e/**`만 바뀌면 → vitest 생략(typecheck는 수행)
- **`lib/tax-engine/**` · `lib/api/**` · `lib/stores/**` · `types/**` · 설정 파일이 하나라도 걸리면 전체** — 세목 간 공유(종부세→재산세 의존, 상속·증여 `property-valuation` 공유, `legal-codes`·`date-coerce` 공용) 때문에 좁히면 타 세목 회귀를 놓친다
- 두 세목 동시 변경·미분류 신규 경로·판정 불가 → **전체**(안전측 기본값)
- 강제 전체: `FULL_TEST=1 git push`

**판정 규칙을 넓히려면 반드시 `select-test-scope.test.sh`에 케이스를 먼저 추가**한다. 좁히기 오판정은 회귀 안전망을 뚫는 방향이라 "회귀 허용치 0" 원칙과 정면 충돌한다.

### 머지 워크플로 — `scripts/ship.sh` (수시 수정 사이클)

브랜치 → 커밋 → 푸시 → PR → 머지 → 브랜치 삭제 → master 동기화를 **한 명령**으로.

```bash
scripts/ship.sh <branch> "<commit message>"          # 즉시 머지 + 원격/로컬 브랜치 삭제 + master 동기화
scripts/ship.sh <branch> "<commit message>" --auto   # ⚠️ 이 저장소에서는 즉시 머지와 같다 (아래)
```

- **전제**: master에서 작업 변경분을 들고 실행(자동으로 새 브랜치 분기)하거나, 이미 `<branch>`에 있는 상태.
- **진짜 게이트는 `git push` 시 pre-push(tsc + 전체 test)뿐**. master에 브랜치 보호가 없어 **CI는 머지를 차단하지 않음** → 즉시 머지 모드는 CI를 기다리지 않는다. (2026-07-31부터 CI는 **PR에서만** 돌고 머지 후 push 실행은 없다 — 위 사용량 정책.)
- repo 설정 `deleteBranchOnMerge: true`(원격 자동삭제) + `allowAutoMerge: true` 적용됨.

#### 🔴 `--auto`는 「CI 통과 후 머지」가 아니다 — 실측 정정 (2026-08-23)

**종전 기재는 「CI 통과 후 자동 머지(감독 불필요)」였다. 틀렸다.** GitHub의 auto-merge는
**머지를 막고 있는 것**(필수 상태 체크·필수 리뷰)이 있어야 예약된다. 이 저장소는 **master에
브랜치 보호가 없어** PR이 생성 즉시 `MERGEABLE`이 되고, 그러면 GitHub은 예약을 거부한다:

```
GraphQL: Pull request is in clean status (enablePullRequestAutoMerge)
```

⚠️ **더 위험한 것은 재시도다.** PR 체크가 돌기 시작한 뒤 `gh pr merge <n> --auto --merge`를
다시 부르면 **에러 없이 exit 0으로 즉시 머지된다**(2026-08-23 PR #1249 실측 — CI 7 job이
`pending`인 상태에서 머지됨). `autoMergeRequest`는 여전히 `null`이라 **예약 실패로 오독하기
쉽다** — 「예약이 안 걸렸으니 아직 안 머지됐겠지」가 아니라 **이미 머지된 것**이다.

⇒ **CI 통과를 기다려야 하면 `--auto`를 믿지 말고 두 단계로 나눈다**:

```bash
git push -u origin <branch> && gh pr create --fill --base master   # ship.sh 대신 수동 2단계
gh pr checks <n> --watch --fail-fast                               # green 확인 (파이프 금지)
gh pr merge <n> --merge --delete-branch                            # 확인 후 머지
```

- `--fail-fast`가 있어야 한 job 실패 시 즉시 멈춘다.
- **파이프를 걸지 말 것** — `gh pr checks --watch | tail`은 실패해도 exit 0이다
  (memory `feedback_gh_watch_pipe_exit0_false_green`).
- `gh pr merge --auto`를 **확인 목적으로도 부르지 말 것** — 그 호출 자체가 머지다.
- 브랜치 보호를 켜면 `--auto`가 본래 의미대로 동작한다. 켜기 전까지 위 2단계가 정본이다.
- **lint 갭 해소(2026-07-31)**: pre-push가 이제 전체 `npm run lint`도 돌린다(26초). 종전의 "lint는 CI에서만" 갭은 없다.
- **효율**: 작은 수정 여러 개를 한 브랜치에 모아 1회 ship → CI 실행 횟수↓.
- `.claude/commands/`(로컬 개인 슬래시 커맨드)는 `.git/info/exclude`로 제외됨 → `git add -A` 오염 없음.

**ESLint --fix 함정**: pre-commit lint-staged의 `eslint --fix`가 미사용 import 정리 시 **같은 라인의 사용 중인 named export까지 제거**할 수 있다 (`import { CurrencyInput, parseAmount }`에서 CurrencyInput만 미사용 → parseAmount도 제거 → TS2304). 회피: 신규 import는 한 라인에 한 named만. pre-push `tsc`가 잡지만 fix 커밋 1개 추가됨.

## Tech Stack

Next.js 16 (App Router, React 19, Turbopack) + TS strict / shadcn(BaseUI) + Tailwind v4 + zustand / Next Route Handlers (`app/api/**`) / Supabase (Auth + Postgres) / vitest + jsdom + RTL / Playwright E2E / Sentry (`tax_type`·`request_id` 태그).

## Architecture — 2-Layer Tax Engine

```
Layer 1: Orchestrator (app/api/calc/{tax-type}/route.ts)
  → Rate limiting (lib/api/rate-limit.ts) IP당 분당 30회
    · 테스트 우회: shouldBypassRateLimit(req) — prod NODE_ENV는 항상 false
  → Zod 검증 (discriminatedUnion 감면 스키마)
  → preloadTaxRates() Supabase RPC 일괄 로드
  → Pure Engine 호출 (세율 데이터 매개변수 전달)
  → (이력 저장은 서버 미경유 — 결과 화면 마운트 시 클라이언트 IndexedDB 자동 저장, lib/storage)

Layer 2: Pure Engine (lib/tax-engine/*.ts)
  → DB 직접 호출 없음, 순수 함수
  → 단방향 의존만 허용: comprehensive → property (역방향 금지)
  → 감면 라우터: lib/tax-engine/transfer-reductions/ (23개 조문)
  → 양도세 4-파일 분할: transfer-tax.ts + -helpers.ts + -rate-calc.ts + -finalize.ts
  → 환산: commercial-building-valuation.ts / general-building-valuation.ts

lib/calc/ — 클라이언트↔API 변환 (14개 동기화 지점 ④⑧ 담당)
```

세부 파일 조직·의존·정수 연산: [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md).

## File Size Policy (강제)

**분리 트리거 800줄 · 착지 목표 ≤700줄**(hard cap 800, PostToolUse hook 경고 — 우회 금지). 800줄 초과 감지 시 즉시 분리(orchestrator + helpers/types/sections).

- **트리거(800)와 착지목표(≤700)를 분리**한다. 800 직하로 착지시키면 기능 1건(≈+50줄)마다 재분리 thrash → `transfer-tax.ts`가 "≈800" 분리 후 801줄로 재초과한 실례. ≤700 착지로 ≈100줄(기능 2건) 데드밴드 확보.
- **트리거는 낮추지 않는다**: 700~749에 안정적으로 앉은 파일을 커지지도 않는데 미리 쪼개면 순수 낭비(Simplicity/Surgical). 800 초과 시에만 분리하되, 분리할 땐 여유분까지 확보.
- **줄 수는 응집도에 종속**: ≤700은 여유분 목표이지 숫자 맞추기가 아니다. 자연 이음매로 2분할해 ≤700이 안 되면 3분할하거나 더 깊은 이음매를 찾는다. 억지 조각화 금지(과분할 방지 — ~500 이하로 무리하게 내리지 말 것).
- **타입 전용 파일 예외**: 로직 없이 타입 선언만 나열된 파일(`*.types.ts` 등)은 분리 가치 낮음(재성장 위험 낮음·import 간접만 증가) — 별도 판단.
- **기회주의적 분리**: 기능 작업으로 이미 연 파일이 ≥750 위험구간이면 그 김에 깊게 분리 — 미래의 분리 전용 PR(고정비: PR·리뷰·pre-push 전체 테스트) 회피.

## 세금 엔진 규칙

**계산 원칙**:
- DB 기반 세율: `tax_rates` jsonb. key: `${tax_type}:${category}:${sub_category}`.
- 정수 연산: 금액은 원(KRW, 정수). `applyRate()`/`safeMultiply()` 사용. `Math.round()` 금지.
- 중간 절사: 세율 × 금액 직후 `Math.floor()`. 지방소득세는 원 미만 절사.
- 감면 중복배제(양도세 조특법 §127⑦·취득세/재산세 지방세특례제한법 §180): 후보 배열 max 패턴.
- 법령 조문 상수: 문자열 리터럴 금지. `lib/tax-engine/legal-codes/` 의 `TRANSFER.*` 등 상수.

**API Date 직렬화** — `lib/api/date-coerce.ts` 필수. JSON 경유 후 string 도달 → `Date < string` silent false 함정. `toDate(v, "field")` / `toOptionalDate(v)` / `coerceDates(obj, [...])`. 신규 코드 `new Date(x)` 직접 호출 금지.

**설계 원칙 (UI 금지)**:
- 자동 안분 fallback 금지(예외: PHD §164⑦). 미입력은 검증 오류로 차단.
- useEffect → store 미러링 금지. cross-field 동기화는 onChange/useMemo.
- 법령 정확성 최우선. 납세자 유리/불리·절감 표현 금지.

## UI 작성 원칙 (요약 — 상세: [components/calc/CLAUDE.md](components/calc/CLAUDE.md))

계산 로직 순서 = UI 표시 순서(모드 토글은 영향 필드 직전). 사이드바 합계는 계산 가능한 항목만 0원 제외. 결과 산식은 한국어 풀어쓰기(변수 약어·`floor()` 금지). 토글/라디오는 `ToggleCard`/`RadioCardGroup` 필수, native 신규 금지, OFF도 tone 유지. 공시지가는 `LandPriceLookupField` 필수. 면적 반올림(UI 한정) `parseFloat(toFixed(2))` 후 단가 곱셈. placeholder 숫자 예시 금지 — 형식 설명은 FieldCard `hint`. **신규 카드·라벨 표준화(2026-07-10)**: 안내·섹션 카드는 `<ToneCard>`(인라인 톤 하드코딩 금지·`tones.ts` 단일 소스), 라벨 크기는 역할별 정본 클래스(임의 px `text-[Npx]` 금지·pre-push 게이트), 모달 런처 버튼은 `<Button variant="modalLauncher">`(native 런처 금지). 상세·강제력은 components/calc/CLAUDE.md.

**자산 종류 특수 분기 진입점**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` — 상단 일반 "취득가액 산정 방식·취득가액" 영역을 `assetKind`(redevelopment_apt·general_building·commercial_building 등)/`transferType`(burdened_gift)별로 조건부 숨김. 특수 분기 추가 시 violet/fuchsia 안내 카드 패턴 차용. 자산-수준 입력은 해당 자산 전용 Block(`RedevelopmentBlock`/`GeneralBuildingBlock`/`CommercialBuildingBlock`)에 격리.

## 인프라

**Supabase / DB**: `supabase/migrations/`(tax_rates·regulated_areas·standard_prices·users·calculations). 시딩 `npm run seed:tax-rates`. 환경변수 미설정 시 graceful 통과(로컬 개발 가능). `DISTINCT ON` 미지원 → DB Function `preload_tax_rates()`.

**Route Protection (`proxy.ts`)**: `updateSession`으로 Auth 세션만 유지 — 이력 로컬 IndexedDB 일원화로 보호 라우트(`/api/history`·`/api/pdf`) 제거됨(proxy.ts:4). 모든 계산·법령 라우트 비로그인 허용.

**로컬 저장소**: IndexedDB(Dexie). 비로그인 sessionStorage 보존→로그인 후 마이그레이션. zustand `result`는 partialize 제외. Store 마이그: `lib/stores/calc-wizard-migration.ts`. 상세: [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md).

**법령 리서치 (`/law`)**: 법제처 Open API 직접 호출(`KOREAN_LAW_OC`). Routes `app/api/law/{search-law,law-text,search-decisions,decision-text,annexes,chain,route-router,applicable-law}/route.ts`. Client barrel `lib/korean-law/client.ts`(5파일). 별칭 다수 `aliases.ts`. 캐시 `.legal-cache/` 30일 TTL(`client-core.ts:21` — 주말·야간 API 차단 완화).

- **통합 검색 + Query Router**(`lib/korean-law/router/query-router.ts`): 자연어 질의를 정규식 패턴으로 도구 자동 라우팅. 우선순위 0=행위시법(`applicable_law`)·개정신구대조(`amendment_article`), 1=조문(제 포함), 2=조문(제 생략), 10~=개정·판례·별표 등. `UnifiedSearchBar`→`/api/law/route-router`→`LawResearchClient` 탭 전환.
- **v4.4 고도화(korean-law-mcp 동급)**:
  - **행위시법**(`applicable-law.ts`): 기준일 시행 조문 + 부칙 경과규정. 법제처 `target=eflaw`(시행일자별)·연혁. `ApplicableLawPanel`. 부칙 발췌는 조문 전용(`articleSpecific`) 우선. "2021년 시행 소득세법 89조".
  - **신구대조**(`time-travel.ts`): `compareLatestAmendment`(distinct MST 거슬러 실제 변경 탐색)·LCS `diffLines`. `amendment_track` 체인 `diff` 섹션 + `LawDiffView`. "소득세법 89조 개정".
  - **현행성 라벨**: 조문 표시 지점에 `CurrentLawBadge`([현행]). 과거 시점은 행위시법 [연혁].
- 구조화 참조조문(`parsers/ref-parser.ts` `LawRef[]`)·시나리오 8종(`scenarios/`)·판례 17도메인(`DECISION_DOMAINS`).

**키움 OpenAPI 자동조회**: 주식 시세 자동조회(양도·상속·증여 공용). 시점 4종·인프라·법령 인용 정정: [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md).

## 새 기능 추가 워크플로 (강제)

엔진+UI 시니어를 **Plan 단계부터 단일 메시지로 병렬 호출**(한쪽 단독 보고 금지) → **Do는 시퀀셜**(엔진이 타입·헬퍼·anchor 선처리 → UI가 ⑤⑥⑦ 담당) → Check는 `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate). 에이전트 목록·PDCA 5단계·E2E 표준 상세: [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md).

**검증 기준 (강제)**: 계획·설계·분석·검토 문서의 모든 주장은 **추정 금지**. 인용 file:line은 실제 파일로, 동작·수치는 throwaway probe/anchor 실측으로 검증 후 단정. "현행 일치 예상"·"아마"·미확인 인용 금지. 미검증은 "확인 필요" 명시. (memory `feedback_pre_anchor_verification` · `feedback_numeric_impact_verify_before_bug_claim` · `feedback_korean_law_citation_verify`)

### Definition of Done — 14개 동기화 지점

엔진 input·result 변경 시 14개 **모두** 동기화. ⑫⑬⑭는 TypeScript 미감지 — 누락 시 침묵 stripping/엔진 미도달.

**클라이언트 8개**: ①폼 상태 → ②initial → ③normalize → ④API 변환(`lib/calc/{tax}-api.ts`) → ⑤UI 위젯 → ⑥사이드바 합계 → ⑦결과 카드 → ⑧validation(`lib/calc/{tax}-validate.ts`).

**API/Route 6개**: ⑨Zod enum 메인 → ⑩Zod enum 컴패니언+`addPropertyRefines` → ⑪자산-수준 `acquisitionDate` fallback → **⑫Zod 입력 객체 정의** → **⑬callTransferTaxAPI body spread** → **⑭Route handler 엔진 input 매핑(Date 변환)**.

**5단 파이프라인 전수 점검**: 폼(①②③) → 변환(④⑬) → fetch body(⑬) → Zod(⑨⑩⑫) → Route(⑪⑭) → 엔진 input. ⑧ 규칙: API/UI fallback 있는 필드는 validate도 동일 fallback. UI 통과↔validate 차단 모순 금지.

**3중 패턴 강제** (memory `mirror-pattern`): UI display fallback이 있는 필드는 API 변환·validate 모두 동일 fallback 적용. 토글/라디오 기본값(예: `redevSubject || "apt"`)도 3 layer 모두 일치. `useEffect → store` 미러링으로 fallback 구현 금지 — 무한 루프 위험.

**완료 보고 전 자가 점검**:
- [ ] 케이스 매트릭스 표 모든 분기 enumerate (단순 케이스부터)
- [ ] anchor 테스트 작성
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/{tax}/` 통과
- [ ] **브라우저 수동 확인** (폼→계산→결과, Network 탭 request body 신규 필드 확인). 미수행 시 명시.

## 참조 문서

| 영역 | 파일 |
|---|---|
| 세금 엔진 (파일·의존·정수·양도세 설계) | [lib/tax-engine/CLAUDE.md](lib/tax-engine/CLAUDE.md) |
| UI 마법사 (StepWizard·공용·14지점 상세) | [components/calc/CLAUDE.md](components/calc/CLAUDE.md) |
| 테스트 (Mock·시나리오 분할·anchor) | [__tests__/tax-engine/CLAUDE.md](__tests__/tax-engine/CLAUDE.md) |
| 로컬 저장소 (Dexie·resultData·Supabase 전환) | [lib/storage/CLAUDE.md](lib/storage/CLAUDE.md) |
| 키움 자동조회 (시점·인프라·법령) | [lib/kiwoom/CLAUDE.md](lib/kiwoom/CLAUDE.md) |
| 새 기능 워크플로 (에이전트·PDCA·E2E 상세) | [docs/00-pm/feature-workflow.md](docs/00-pm/feature-workflow.md) |
| PRD / Roadmap | `docs/00-pm/korean-tax-calc.{prd,roadmap}.md` |
| Engine / DB / UI Design | `docs/02-design/features/korean-tax-calc-{engine,db-schema,ui}.design.md` |
| 신규 기능 템플릿 / 세목 UI 킥오프 | `docs/02-design/features/_template.engine.design.md` · `_new-tax-ui-kickoff.checklist.md` |
| 최근 완료 이력 | [docs/00-pm/recent-completions.md](docs/00-pm/recent-completions.md) |
