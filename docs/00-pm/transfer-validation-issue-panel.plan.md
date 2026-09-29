# 양도세 입력 검증 오류 표시 — 화면 이동 없이 보이게

- 작성: 2026-09-30
- 브랜치·워크트리: `feat/transfer-validation-error-panel` · `.claude/worktrees/transfer-error-panel` (slot 1 — dev 3001 / E2E 3101)
- 범위: **UI 표시만**. 검증 규칙(`lib/calc/transfer-tax-validate*.ts`)·엔진·API 무변경.

## 1. 문제 (사용자 제보)

「다음」·「세금 계산하기」를 누르면 검증 오류가 뜨는데, 그걸 보려면 화면 위쪽으로 올라가야 한다.
수정하면서 메시지를 다시 보려면 또 스크롤해야 한다.

## 2. 원인 — 코드 실측

오류는 **세 곳**에서 표시되고, 각각 다른 이유로 시야 밖에 놓인다.

| # | 위치 | 표시 지점 | 시야 밖으로 밀리는 이유 |
|---|---|---|---|
| A | 단건 — 하단 일괄 목록 | `TransferTaxCalculator.tsx:573-613` (「다음」 버튼 바로 위, 문서 흐름 안) | ① step 0 자산 오류면 `failWithIssues`(`:183-190`)가 **자산 카드로 스크롤**해 목록에서 멀어진다. ② 「세금 계산하기」(`handleSubmit :233-244`)는 실패한 앞 단계로 `setStep(s)` — 단계 내용 길이가 바뀌어 목록 위치가 뷰포트에서 벗어난다(스크롤은 step 0 자산 오류일 때만). |
| B | 단건 — 자산 카드 머리 배너 | `CompanionAssetCard.tsx:233-237` (카드 **최상단**) | 오류 시 섹션 5개 **전부 펼침**(`:180 forceOpenAll`) + `scrollIntoView({ block: "center" })`(`TransferTaxCalculator.tsx:197`) ⇒ 길어진 카드의 **가운데**로 가므로 카드 맨 위 배너가 화면 위로 잘린다. **사용자가 「상단」이라 느낀 주된 원인으로 판단**(브라우저 재현은 Pre-Do에서 확인 — V-0). |
| C | 다건 — 공통 설정 「세액 계산」 | `MultiTransferTaxCalculator.tsx:406-412` — **페이지 최상단** `Alert` | 버튼은 설정 카드 맨 아래(`:520`)인데 오류는 페이지 맨 위. 문자 그대로 「상단까지 올라가야」 하는 경로. |

보조 사실:
- `ValidationIssue`는 `{ message, step, assetIndex? }`뿐이다(`transfer-tax-validate.ts:42-47`) — **어느 입력칸인지 정보가 없다**. 하위 검증 파일 약 20개도 문자열만 반환한다.
- `collectStepIssues(i, formData)`는 이미 **매 렌더 전 단계**에 대해 `useMemo`로 돌고 있다(사이드바 배지 `stepStatuses`, `:338-345`). 실시간 재계산을 추가해도 새 비용이 아니다.
- 상위 요소에 `overflow`가 없다: `app/layout.tsx:68`(body)·`app/calc/layout.tsx`·계산기 루트 `:370`·그리드·`<main>` — grep 0건. **단, `Card`는 `overflow-hidden`**(`components/ui/card.tsx:15`) ⇒ 다건 설정(C)은 Card 안이라 `sticky`가 먹지 않는다. 다건 편집 단계의 임베드 계산기(`Multi… :471-475`)는 Card 밖이다.

## 3. 설계 결정

### D-1. 모달 팝업이 아니라 **하단 고정(sticky) 오류 패널** ✅ (사용자 승인안)

모달은 폼을 가려서, 닫는 순간 메시지가 사라지고 고칠 위치는 여전히 직접 찾아야 한다. 오류가 여러 건이면 외워야 한다.
⇒ 기존 목록(A)을 **그 자리에 둔 채** `sticky bottom-*`로 바꾼다.

- **`fixed`가 아니라 `sticky`인 이유**: `fixed`는 페이지 끝까지 내려가면 「다음」/「계산하기」 버튼을 **가린다**(가리지 않으려면 패널 높이만큼 동적 여백이 필요). `sticky`는 본래 자리(버튼 바로 위)에 도달하면 문서 흐름으로 돌아가 버튼을 가리지 않는다. 스크롤을 위로 올리면 뷰포트 하단에 붙는다.
- 목록이 길면 폼을 덮는다 ⇒ `max-h-[40vh] overflow-y-auto` + **접기 토글**(헤더 「입력 확인이 필요합니다 (N건)」은 접어도 남는다). 닫기(X)는 두지 않는다 — 차단 오류를 숨길 이유가 없고, 다시 「다음」을 누르면 어차피 다시 뜬다.
- `z-40`(앱 헤더 `z-50`·`SaveToast` `z-50` 아래). `print:hidden`. `aria-live="polite"` — ⚠️ Do 중 변경: 계획은 `role="alert"`였으나 Q-1=A로 목록이 **입력할 때마다** 바뀌므로 assertive 낭독이 매 입력을 끊는다. polite로 건수 변화만 알린다.
- `data-testid="validation-issues"` **유지** — E2E 2건이 의존(§6).

### D-2. 패널 컴포넌트 추출 — `components/calc/transfer/ValidationIssuePanel.tsx`

현 블록(`:573-613`, 약 40줄)을 옮기고 접기 상태를 컴포넌트 내부에 둔다. 새 오류 묶음이 오면 펼침으로 되돌리는 것은 **`key` 교체**로 한다(useEffect 금지 — 저장소 규칙).
props: `issues`·`error`·`onIssueClick(assetIndex)`·`canJumpToAsset(it)`·`onRetry?`(마지막 단계 「다시 계산하기」). 계산기 파일은 683줄 → 약 650줄로 준다.
⚠️ 공용(`components/calc/shared/`)으로 올리지 않는다 — 지금 소비처는 양도세뿐이다(§7 범위 밖 참고).

### D-3. 자산 카드 스크롤 기준 `center` → `start` ✅

`TransferTaxCalculator.tsx:197`. 카드 루트에 이미 `scroll-mt-24`(`CompanionAssetCard.tsx:227`)가 있어 sticky 앱 헤더(`h-14`) 밑으로 배너가 보인다. 한 단어 변경.

### D-4. 다건 설정 오류(C)는 **「세액 계산」 버튼 바로 위**로 옮긴다 (sticky 아님)

Card의 `overflow-hidden` 때문에 sticky가 무효다. 그러나 사용자는 방금 그 버튼을 눌렀으므로 버튼 바로 위면 이미 시야 안이다 — sticky가 필요 없다.
`error`는 `handleCalculate`(`:331-357`)에서만 세팅되므로 설정 단계 안으로 옮겨도 다른 단계의 표시를 잃지 않는다. (설정 → 목록 이동 시 목록 화면 상단에 남던 낡은 오류는 더 이상 보이지 않게 된다 — 개선으로 본다.)

### D-5. ✅ Q-1 — 고친 오류를 목록에서 **실시간으로 지울 것인가**

| 안 | 동작 | 비용·위험 |
|---|---|---|
| **A (권장)** | 패널이 열린 동안 목록 = `collectStepIssues(실패 단계, formData)` **파생**(`useMemo`). 고치면 즉시 사라지고, 0건이 되면 패널이 닫힌다. 자산 카드 배너도 같이 따라간다. | 상태 `issues[]`를 `failedStep: number \| null`로 바꾸는 리팩터(호출부 `failWithIssues`·`handleSubmit`·임베드 버튼 2곳). 입력 중에 **새 오류가 목록에 생길 수 있다**(같은 단계의 다른 규칙). 계산 비용은 기존 `stepStatuses`와 동일 계열(§2). |
| B | 현행 유지 — 버튼을 다시 누를 때까지 목록 고정 | 변경 최소. 고친 뒤에도 빨간 목록이 남아 「아직 틀렸나?」 오해 소지. |

→ ✅ **A 확정**(2026-09-30 사용자 결정).

## 4. 변경 지점

| 파일 | 변경 |
|---|---|
| `components/calc/transfer/ValidationIssuePanel.tsx` | **신규** — D-1·D-2 |
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | `:573-613` 블록 → `<ValidationIssuePanel>` · `:197` `center`→`start` · (Q-1=A면) `issues` 상태 → `failedStep` 파생 |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | `:406-412` Alert → 설정 Card의 버튼 행(`:519`) 바로 위로 이동 |

검증 규칙·엔진·API·store·14 동기화 지점: **해당 없음**(입출력 필드 변화 0).

## 5. 단계별 실행 계획

```
0. Pre-Do — V-0 브라우저 재현(현행에서 B·C 증상 스크린샷) + E2E 신규 spec을 먼저 작성해 현행에서 FAIL 확인
   → verify: 신규 spec이 현행 코드에서 「패널이 뷰포트 밖」으로 실패
1. ValidationIssuePanel 추출 + sticky/max-h/접기 (D-1·D-2)
   → verify: 기존 E2E 2건 통과 + RTL 단위(접기·항목 클릭 콜백·key 리셋)
2. 스크롤 기준 start (D-3)
   → verify: 신규 spec — 자산 카드 배너가 뷰포트 안
3. (Q-1=A) failedStep 파생
   → verify: 신규 spec — 필드 채우면 해당 항목 소멸, 전부 채우면 패널 소멸
4. 다건 설정 오류 이동 (D-4)
   → verify: 신규 spec — 「세액 계산」 실패 시 오류가 버튼과 함께 뷰포트 안
5. 뮤테이션 probe — `sticky` 제거 / `start`→`center` 복원 / D-4 원위치 각각에서 신규 spec이 FAIL하는지
   → verify: 3건 모두 KILLED (하나라도 통과하면 spec이 구별력 없음 → 보강)
6. typecheck + lint + `npm run test:transfer` + 관련 E2E, 워크트리라 pre-push 수동 실행(§8)
```

## 6. 테스트

**기존 의존 (깨지면 안 됨)** — `validation-issues` testid 참조는 2건뿐(grep 실측):
- `e2e/transfer-input-error-prevention.spec.ts:25-28` — 빈 폼 「다음」 → 건수 헤더·양도일·총양도가액 문구
- `e2e/transfer-burdened-gift-fractional.spec.ts:167-169` — 마지막 단계 「계산하기」 → 목록 표시 + 특정 차단 문구 0건
  - ⚠️ Q-1=A면 이 spec의 「목록 자체는 뜬다」 전제(자산 2가 빈 상태)가 그대로인지 확인 — 빈 자산은 계속 오류이므로 유지될 것으로 보이나 **실행으로 확인**.
- `data-asset-card-index` 셀렉터는 E2E 다수가 쓰지만 이번 변경은 그 속성을 건드리지 않는다.

**신규 E2E** `e2e/transfer-validation-issue-panel.spec.ts` (E2E_PORT=3101):
1. 빈 폼 「다음」 → 패널 `toBeInViewport()` **그리고** 자산 카드 배너 `toBeInViewport()` (자동 스크롤 후에도 둘 다)
2. 마지막 단계에서 「세금 계산하기」 → step 0으로 복귀 → 패널 `toBeInViewport()`
3. 페이지 맨 아래로 스크롤 → 「다음」 버튼 `click({ trial: true })` 성공(= 패널이 버튼을 가리지 않음)
4. 페이지 맨 위로 스크롤 → 패널 여전히 `toBeInViewport()` (sticky 동작)
5. (Q-1=A) 양도일 입력 → 목록에서 「양도일을 선택하세요.」 소멸
6. 다건 설정 「세액 계산」 검증 실패 → 오류 문구와 버튼이 함께 뷰포트 안 — **실패 입력 경로는 V-1**

**RTL 단위** `__tests__/components/transfer/validation-issue-panel.test.tsx` — 접기/펼치기, 자산 항목 클릭 시 `onIssueClick(assetIndex)`, `key` 교체 시 펼침 복귀. (jsdom은 sticky·뷰포트를 판정하지 못한다 ⇒ 위치 검증은 E2E만.)

## 7. 범위 밖 (기록만)

- **입력칸 단위 포커스 이동** — `ValidationIssue`에 필드 키가 없고 하위 검증 약 20파일이 문자열 반환(§2). 규모 큰 리팩터라 별건.
- **다른 세목 계산기** — 판정 메뉴(`OneHouseJudgmentCalculator.tsx:254`)·주식(`StockTransferTaxCalculator.tsx:349`) 등도 오류 위치가 제각각이다. 이번 패널이 자리 잡으면 공용화 여부를 따로 판단.
- **비차단 경고 배너**(`StepWarningBanner`, 단계 제목 아래) — 진행을 막지 않으므로 이번 불편과 무관. 유지.

## 8. 미검증·결정 레지스터

| ID | 내용 | 상태 |
|---|---|---|
| V-0 | 현행 브라우저에서 A·B·C 증상 실재 | ✅ 실측 — 신규 spec 5건 전부 현행에서 FAIL(`viewport ratio 0` 4건 · 고친 항목 잔존 1건). B는 패널 단언을 빼고 따로 돌려 카드 배너 `viewport ratio 0` 확인 |
| V-1 | 다건 설정 단계 실패 경로 | ✅ sessionStorage `multi-transfer-tax-wizard`에 `activeStep="settings"` + `annualBasicDeductionUsed="3000000"` 주입 후 reload → 「세액 계산」 |
| V-2 | 모바일 폭에서 패널이 「다음」을 가리지 않는지 | ✅ 375×812 케이스 추가·통과. ⚠️ 처음엔 실패했는데 가린 것은 패널이 아니라 **Next.js dev 표시기 배지**였다(§9) |
| Q-1 | 실시간 목록 갱신 A/B | ✅ **A 확정**(2026-09-30 사용자) |

## 8-1. 실측 결과 (Do)

| 항목 | 결과 |
|---|---|
| 신규 E2E `transfer-validation-issue-panel.spec.ts` | 6/6 통과 (데스크톱 5 + 모바일 1) |
| 기존 의존 E2E 2파일 (`transfer-input-error-prevention` 3건 · `transfer-burdened-gift-fractional` 3건) | 통과 |
| RTL `__tests__/components/transfer-validation-issue-panel.test.tsx` | 6/6 |
| `npm run test:transfer` | 992파일 통과 |
| 양도세 관련 E2E 전건 (파일명 transfer·multi·burdened·general-building·mixed-use·redev·companion 186파일) | **478 passed**, 실패·flaky 0 (4.4분) |
| typecheck · 변경 파일 eslint(오류 0, 다건 파일의 기존 경고 5건은 무관 줄) · 폰트·톤 게이트 | 통과 |
| `TransferTaxCalculator.tsx` 줄 수 | 683 → 656 |

**뮤테이션 probe** — 하나씩 되돌려 신규 spec이 잡는지 (최종 spec 기준 재실행, 매회 원본 복원을 `cmp`로 확인):

| # | 뮤테이션 | 결과 |
|---|---|---|
| M1 | 패널 `sticky` 제거 | KILLED (A·B / 세금 계산하기 / 맨 위 스크롤 / 모바일 4건) |
| M2 | 스크롤 `start` → `center` | KILLED (A·B 카드 배너) |
| M3 | 실시간 파생 제거(deps에서 `formData` 제외) | KILLED (Q-1=A) |
| M4 | 다건 오류를 페이지 최상단으로 복귀 | KILLED (C) |
| M5 | `sticky` → `fixed`(버튼 가림) | 처음엔 **SURVIVED** → 단언 보강 후 KILLED (데스크톱·모바일 2건) |

## 9. 실행 함정 (이 저장소에서 실제로 밟은 것)

- 🔴 **`click({ trial: true })`로는 「가리지 않는다」를 증명할 수 없다** — 가려지면 Playwright가 스크롤 위치를 바꿔 재시도해 통과한다(M5 생존). 스크롤을 고정한 채 `elementFromPoint`로 버튼 중심의 최상단 요소가 **패널 안인지**를 본다.
- 🔴 **Next.js dev 표시기(우하단 배지)가 모바일 폭에서 「다음」 버튼을 덮는다** — 「버튼이 최상단인가」로 물으면 거짓 실패하고, 「패널이 덮었나」로 물으면 배지가 패널보다 위라 M5가 살아남는다. spec에서 `nextjs-portal`을 숨겨 해소.
- 🔴 **zsh는 `$files`를 단어 분리하지 않는다** — `npx playwright test $files`가 186파일을 인자 하나로 넘겨 `No tests found`. `echo exit=$?`를 뒤에 붙여 백그라운드 알림은 exit 0이었다. `xargs`로 넘긴다.

- 워크트리는 **husky 훅이 조용히 안 돈다** → 푸시 전 `FULL_TEST=1 bash .husky/pre-push` 수동 실행, 로그에 `▶ pre-push gate` 확인.
- E2E는 **반드시 `E2E_PORT=3101`** — 안 주면 메인 트리 3000 서버를 재사용해 남의 코드를 검증한다.
- `node_modules`는 심링크가 아니라 `cp -cR` 복제본으로 바꿔 두었다(Turbopack webServer 기동 조건).
- 머지는 `--auto` 금지 — `gh pr checks --watch --fail-fast` 후 롤업 conclusion 전건 SUCCESS + `headRefOid` 일치 확인 뒤 수동 머지.
