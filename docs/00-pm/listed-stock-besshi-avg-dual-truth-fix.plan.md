# 상장주식 평가조서 갑지·미리보기 1주당 평균 — 을지 값으로 통일

> **증상 (이미지 14, 삼성전자·평가기준일 2022.07.06)**:
> - 평가조서 **갑지 ⑨ 1주당 평균** = **61,526원** (오답)
> - 평가조서 **을지 종가평균** = **61,465원** (= 5,163,100 ÷ 84, **법령 정답**)
> - 입력 폼 하단 **"전후 2개월 종가 단순평균"** = **61,526원** (오답)
>
> **결정 (사용자 확정)**: **을지 계산이 법령에 맞는 정답**. 갑지 ⑨ 및 미리보기 "전후 2개월 종가 단순평균"이 **을지 산식 결과(`page2.closingAverage`)를 그대로 표시**하도록 통일.

---

## 1. 원인 분석 — 두 산식의 Dual Truth

### 1-1. 검산 (RCA 확정)

이미지 14 을지의 D=2022-07-06 종가는 56,400원이고, 좌(beforeM1 NO 1)와 우(afterM1 NO 1) **양쪽에 동시 표기** 되어 있다. 평균 분자·분모도 D를 양쪽 2회 카운트:

| 산식 | 합계 | 분모 | 평균 | 판정 |
|---|---|---|---|---|
| **을지** (D 양쪽 2회) | 5,163,100 | 84 | **61,465** | ✓ 법령 정답 |
| **갑지·미리보기** (D 1회) | 5,163,100 − 56,400 = 5,106,700 | 84 − 1 = 83 | 5,106,700 ÷ 83 = 61,526.5 → floor 61,526 | ✗ 버그 |

→ 두 함수가 같은 시세 풀(quote pool)에서 **D의 카운트 횟수만 달라** 차이가 발생.

### 1-2. file:line 실측

#### (a) 갑지 ⑨ — 오답 경로

```
키움 API 응답 average  (= twoMonthSurroundingAvg 결과, D 1회)
  lib/kiwoom/averages.ts:219  Math.floor(sum / tradingDays)
    ↑ 슬롯 = buildSurroundingSlotsFromAnchor (D 단일 포함)
      lib/kiwoom/calendar.ts:125

  ↓ response.average
applyKiwoomValuationResponse
  lib/calc/listed-stock-besshi.ts:105
    listedStockAvgPrice: response.average     ← ★ 여기서 오답 값을 EstateItem에 박음

  ↓ EstateItem.listedStockAvgPrice
evaluateListedStock
  lib/tax-engine/property-valuation-stock.ts:209
    const avgPrice = item.listedStockAvgPrice ?? 0;
  computeListedBesshiPage1Values
    property-valuation-stock.ts:138, 177  closingAvg: avgPrice
                                          perShareMajorShareholder: Math.floor(avgPrice * (1+premiumRate))

  ↓ page1Values.closingAvg
Page1CoverSection ⑨ = fmt(page1Values.closingAvg)
  components/calc/inheritance/listed-stock/besshi/Page1CoverSection.tsx:147
ListedStockBesshiPdfDocument ⑨ = fmt(page1Values.closingAvg)
  lib/pdf/ListedStockBesshiPdfDocument.tsx:201
```

#### (b) 을지 종가평균 — 정답 경로

```
키움 API 응답 slotDates·closingPrices·weekendLabels (raw)
  ↓
applyKiwoomValuationResponse
  → splitTwoMonthSurroundingByMonthGroup        ← ★ D 양쪽 카운트 산식 (정답)
    lib/kiwoom/two-month-grouping.ts:53
      beforeM1[0] = D, afterM1[0] = D  (양쪽 표시 + 양쪽 합산)
      closingAverage = floor(closingSum / tradingDays)
        two-month-grouping.ts:120
  → listedStockDailyGroupsInput

  ↓ EstateItem.listedStockDailyGroupsInput
evaluateListedStock
  property-valuation-stock.ts:243  besshiData.page2 = item.listedStockDailyGroupsInput
  → page2.closingAverage  (정답)
```

#### (c) 미리보기 "전후 2개월 종가 단순평균" — 오답 경로

```
KiwoomValuationAutoFetchButton
  components/calc/KiwoomValuationAutoFetchButton.tsx:117
    patch.listedStockAvgPrice = data.average    ← ★ 갑지와 동일 (오답)
  → onFill(patch)
  → ListedStockEditor.set({ listedStockAvgPrice: patch.listedStockAvgPrice })
    components/calc/StockValuationForm.tsx
```

### 1-3. 결론

**`page2.closingAverage`(을지 산식)만이 법령 정답이며, 갑지·미리보기·EstateItem.listedStockAvgPrice·API response.average가 모두 잘못된 산식을 거치고 있음**. → **을지를 단일 진실 소스(SSOT)로 채택**, 모든 표시·저장값을 을지에서 derive.

---

## 2. 수정 전략 — Single Source of Truth = `page2.closingAverage`

### 2-1. 채널-fill 방향

```
[자동조회 응답 raw]
    slotDates / closingPrices / weekendLabels
        ↓
[splitTwoMonthSurroundingByMonthGroup]  (을지 산식 = 법령 정답)
    ListedStockMonthGroups { ..., closingAverage }
        ↓ ★ 단일 출처
   ┌──────────────┬──────────────────┬──────────────────────┐
   ↓              ↓                  ↓                      ↓
listedStockAvgPrice  page1Values.closingAvg  page2.closingAverage  미리보기 단순평균
(EstateItem 저장)    (갑지 ⑨ 표시)         (을지 표시)            (입력 폼)
```

- 키움 API `response.average`는 **무시**하고 `splitTwoMonthSurroundingByMonthGroup` 호출 결과의 `closingAverage`만 사용.
- `EstateItem.listedStockAvgPrice` 자체도 `groups.closingAverage` 값으로 set → 자동조회 미사용(수동 입력) 모드와 호환 유지.
- 엔진 `evaluateListedStock`은 **`groups.tradingDays > 0` 일 때만** grouping 결과를 SSOT로 사용. `tradingDays === 0` (수동 입력 모드 — `EMPTY_LISTED_STOCK_MONTH_GROUPS` 채워진 상태 포함) 인 경우 `item.listedStockAvgPrice` fallback.
- ⚠️ **fallback 0-trap 방지**: `?? avgPrice` 패턴은 **사용 금지** — `EMPTY_LISTED_STOCK_MONTH_GROUPS.closingAverage = 0` 이 `null/undefined`가 아니므로 `0 ?? avgPrice === 0` → 갑지 ⑨ = 0 표시 버그. **반드시 `tradingDays > 0` 가드를 사용**.

### 2-2. 핵심 원칙

- **엔진 input 타입 변경 0건** — `EstateItem.listedStockAvgPrice` 필드 유지, 값 출처만 정정.
- **단일 진실 소스화** [[feedback_ui_engine_dual_truth_avoidance]] — 표시·저장 모두 `closingAverage` 단일 출처.
- **응답 단일 패스** — adapter(`applyKiwoomValuationResponse`)가 grouping 결과의 `closingAverage`를 `listedStockAvgPrice`에 한 번에 채널-fill.
- **수동 입력 모드 안전** — `listedStockDailyGroupsInput`이 비어 있으면 `item.listedStockAvgPrice` fallback (현재 동작 그대로).
- **Pre-Do anchor 우선** [[feedback_pre_anchor_verification]] — 이미지 14 입력으로 61,465 출력 단일 anchor를 먼저 실패 확보.
- **잘못된 anchor 폐기** [[feedback_anchor_correction_legal_priority]] — 기존 테스트에 61,526·61,532류 기대값이 박혀 있으면 법령 정합값(을지 산식 재계산값)으로 갱신.

---

## 3. 작업 분해

### Step 1 — Pre-Do anchor 우선 (실패 확보)

- [ ] **A-1** `__tests__/tax-engine/property-valuation-stock-listed.test.ts` 에 이미지 14 fixture anchor 추가:
  - 입력: 삼성전자 평가기준일 2022-07-06, 일자별 종가 84건(이미지 14 을지 그대로).
  - 기대: `besshiData.page1Values.closingAvg === 61465` ∧ `besshiData.page2.closingAverage === 61465`.
  - 현재 RED 확인 (갑지 closingAvg가 `response.average` 산식이라 61,526 또는 그 근방으로 떨어짐).
- [ ] **A-2** `__tests__/kiwoom/two-month-grouping.test.ts` 에 동일 fixture로 `closingAverage === 61465` anchor 1건 추가 (을지 산식 회귀 차단용 정답 고정).

### Step 2 — Adapter 정정 (`applyKiwoomValuationResponse`)

- [ ] **B-1** `lib/calc/listed-stock-besshi.ts:82-114`:
  - `splitTwoMonthSurroundingByMonthGroup` 호출 결과(`groups`)를 우선 산출.
  - `listedStockAvgPrice: response.average` → `listedStockAvgPrice: groups.closingAverage` 변경.
  - 반환 객체 주석 갱신 ("§52의2 정답 산식 = 을지 grouping 결과의 closingAverage 단일 출처").

### Step 3 — 엔진 정정 (`computeListedBesshiPage1Values`)

- [ ] **C-1** `lib/tax-engine/property-valuation-stock.ts:108-190`:
  - `computeListedBesshiPage1Values(item, avgPrice, context)` 시그니처에 `groups?: ListedStockMonthGroups` 인자 추가.
  - **fallback 0-trap 회피 패턴**(★ `??` 금지):
    ```ts
    const closingAvg = (groups?.tradingDays ?? 0) > 0
      ? groups!.closingAverage
      : (item.listedStockAvgPrice ?? 0);
    ```
    이유: `EMPTY_LISTED_STOCK_MONTH_GROUPS.closingAverage = 0` 이 `null/undefined`가 아니므로 `?? avgPrice`는 0을 통과시켜 갑지 ⑨ = 0 버그 발생.
  - `perShareMajorShareholder = Math.floor(closingAvg * (1 + premiumRate));` (avgPrice 대신 closingAvg).
  - §63②3호 분기에서도 `avgPrice` 사용 라인을 `closingAvg`로 치환 (`applyCapitalIncreaseShareValuation` 인자, breakdown amount 모두).
- [ ] **C-2** `evaluateListedStock` (property-valuation-stock.ts:198~) — `avgPrice` 변수 다중 참조처 일괄 정정:
  - 함수 시작부에 `const closingAvg = ...` 단일 변수 도출 (item.listedStockDailyGroupsInput → groups → tradingDays 가드 적용, C-1과 동일 패턴).
  - `const groups = item.listedStockDailyGroupsInput;` 도출 후 `computeListedBesshiPage1Values(item, closingAvg, context, groups)` 로 전달.
  - **실측 정정 위치 3곳** (line 번호는 현재 master 기준):
    | Line | 코드 | 정정 |
    |---|---|---|
    | 168 (page1Values 내부) | `applyCapitalIncreaseShareValuation(avgPrice, ...)` | `closingAvg` |
    | 263 (§63②3호 분기) | breakdown ⑨ amount = `Math.floor(avgPrice)` | `Math.floor(closingAvg)` |
    | 315 (일반 분기) | breakdown ⑨ amount = `Math.floor(avgPrice)` | `Math.floor(closingAvg)` |
  - **완료 게이트**: `grep -n "\\bavgPrice\\b" lib/tax-engine/property-valuation-stock.ts` 출력에서 closingAvg 도출 라인 외 직접 참조 **0건** 확인 후 다음 Step 진행. (line 209의 원시값 변수는 유지 가능하나 사용 0건이면 제거 권장.)
  - breakdown `⑨ 전후 2개월 종가 평균` amount = `Math.floor(page1Values.closingAvg)` (avgPrice 직접 참조 제거).
  - totalValue 계산 시 `closingAvg` 기준 (`page1Values.perShareMajorShareholder * shares`)이 이미 정합되므로 추가 변경 없음.

### Step 4 — 미리보기 채널 정합

**채널 정합 두 옵션 비교** (실측: `KiwoomValuationAutoFetchButton.tsx:104-117`에서 `onResponse → onFill` 동기 호출. onFill이 onResponse의 set을 stale closure로 덮어쓸 수 있음 — [[listed-stock-besshi-page2-empty-bug-fix]] 사례):

| 옵션 | 구현 | 클라이언트 변경 | stale closure 함정 | 신규 필드 |
|---|---|---|---|---|
| **(a) route 응답에 `groupsClosingAverage` 신규 필드 echo** | route에서 grouping 1회 호출 + `data.groupsClosingAverage ?? data.average` 클라이언트 fallback | onFill 패턴 변경 필요 | 잔존 (data.average 폐기 전까지) | +3 (groupsClosingAverage/Sum/TradingDays) |
| **(b) ★권장 — route에서 `average` 필드 자체를 grouping 결과로 덮어쓰기** | route 응답 `{...result, average: groups.closingAverage, sum: groups.closingSum, tradingDays: groups.tradingDays}` 덮어쓰기 | **0건** | **무해화** (onResponse·onFill 동일 값) | 0 |

**옵션 (b) 채택 — 클라이언트 코드 변경 0건, stale closure 함정 자동 해소**:

- [ ] **D-1** `app/api/kiwoom/valuation-2month/route.ts:144-164`:
  - `twoMonthSurroundingAvg(...)` 호출 후 `splitTwoMonthSurroundingByMonthGroup(result.slotDates, result.closingPrices, result.weekendLabels, resolvedAnchor, options)` 추가 호출하여 `groups` 도출.
  - `NextResponse.json({...result, ...overrides})` 패턴에서 **`overrides = { average: groups.closingAverage, sum: groups.closingSum, tradingDays: groups.tradingDays }`** 로 정답 산식 덮어쓰기.
  - 주석에 RCA 참조 (`listed-stock-besshi-avg-dual-truth-fix.plan §1-1 — D 양쪽 카운트 정합`).
- [ ] **D-2** `lib/calc/listed-stock-besshi.ts:59-80` `KiwoomValuation2MonthResponse` 인터페이스:
  - 신규 필드 추가 없음 (옵션 b 채택 결과). `average`·`sum`·`tradingDays` 의미가 "을지 grouping 산식 결과" 로 정정됨을 인터페이스 주석에 명시.
  - **Runtime Zod 검증은 클라이언트에 없음** (인터페이스 타입만, `route.ts` 응답에도 Zod 없음). 응답 형태 갱신처는 본 인터페이스 단 1곳.
- [ ] **D-3** `KiwoomValuationAutoFetchButton.tsx` — **코드 변경 0**. `onFill(patch.listedStockAvgPrice = data.average)` 가 D-1 정정 후 자동으로 grouping 산식 값을 받음. onResponse 경로(adapter, B-1)와 동일 값 → stale closure 덮어쓰기 무해화.
- [ ] **D-4** 입력 폼 미리보기 위젯 ("전후 2개월 종가 단순평균" 표시 컴포넌트) — `listedStockAvgPrice` 그대로 노출되므로 D-1·B-1·C-1 정정 후 자동 정합. 변경 0 (확인만).

### Step 5 — 기존 anchor·테스트 정합

- [ ] **E-1** **grep 키워드 확장 — 전수 영향 표 사전 산출**:
  ```bash
  grep -rnE "listedStockAvgPrice|closingAvg\b|perShareMajorShareholder|⑨|⑩|61,?465|61,?526|61,?532|response\.average|twoMonthSurroundingAvg" \
    __tests__ e2e lib components app
  ```
  - 출력 분류 (영향 표 작성):
    | 분류 | 대상 |
    |---|---|
    | (i) 갑지 ⑨ 기대값 anchor | `__tests__/tax-engine/property-valuation-stock-listed*.test.ts` |
    | (ii) 을지 closingAverage anchor | `__tests__/kiwoom/two-month-grouping.test.ts` |
    | (iii) API route 응답 average anchor | `__tests__/kiwoom/valuation-2month*.test.ts` |
    | (iv) §63②3호 분기 breakdown anchor | `inheritance-stock-capital-increase-new-shares-section-63-2-3.*` |
    | (v) 할증 ⑩ anchor | (i)와 동일 파일, `1.2*` 곱셈 라인 |
    | (vi) PR-LS-01~LS-10 시리즈 anchor 영향 | `listed-stock-besshi-form-replica.plan.md` PR 단위 anchor 26건 grep |
    | (vii) e2e cross-display 텍스트 | `e2e/listed-stock-besshi.spec.ts` |
- [ ] **E-2** 각 anchor를 을지 산식으로 재계산한 정답값으로 갱신. anchor 변경 사유를 테스트 주석에 명시 ("§52의2 D 양쪽 카운트 정합 — listed-stock-besshi-avg-dual-truth-fix.plan §1-1"). 갱신 anchor 개수를 PR 본문에 표로 첨부.
- [ ] **E-3** anchor shift 케이스(이미지 13 — 2022-12-02, 2022-12-15, 2001-12-28)도 동일 산식으로 재산정. resolvedAnchor 기반 grouping 결과의 closingAverage가 그대로 갑지 ⑨로 흐르는지 확인.

### Step 6 — 결과 카드·PDF 정합 확인

- [ ] **F-1** `Page1CoverSection.tsx:147` 갑지 ⑨ — `page1Values.closingAvg` 그대로 표시 (B/C 정정 후 자동 61,465).
- [ ] **F-2** `ListedStockBesshiPdfDocument.tsx:201` PDF ⑨ — 동상.
- [ ] **F-3** `ListedStockBesshiPdfDocument.tsx:209` PDF ⑩ 할증 — `page1Values.perShareMajorShareholder` 자동 정합 (할증 20% 적용 시 73,758).
- [ ] **F-4** `ListedStockBesshiPreviewCard.tsx` 미리보기 — 동상.
- [ ] **F-5** breakdown(`evaluateListedStock` 반환 `breakdown`) `⑨ 전후 2개월 종가 평균` amount = 61,465 확인.

### Step 7 — 회귀·E2E

- [ ] **G-1** `npm run test:inheritance` + `npm run test:kiwoom` 회귀 0건.
- [ ] **G-2** PR 직전 전체 `npm test` 1회 [[feedback_per_tax_test_scripts]].
- [ ] **G-3** `npx tsc --noEmit` 0건.
- [ ] **G-4** `e2e/listed-stock-besshi.spec.ts` 에 cross-display 일치 assertion 추가:
  - 갑지 ⑨ 셀 텍스트, 을지 종가평균 셀 텍스트, 입력 폼 미리보기 "전후 2개월 종가 단순평균" 텍스트가 **모두 동일** (61,465).
  - PDF 다운로드 시 ⑨ 셀도 동일.

---

## 4. 8개 동기화 지점 점검 (CLAUDE.md ⑧)

본 수정은 엔진 input 타입 변경 0·result 타입 echo 산식만 정정.

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | EstateItem.listedStockAvgPrice | 타입 동일, 값 출처 정정 (adapter) |
| ② | initial | — | 변경 없음 |
| ③ | normalize | — | 변경 없음 |
| ④ | API 변환 | `lib/calc/listed-stock-besshi.ts` (Step 2) | adapter 산식 정정 |
| ⑤ | UI 위젯 | `KiwoomValuationAutoFetchButton` onFill (Step 4) | groupsClosingAverage 우선 |
| ⑥ | 사이드바 합계 | `inheritance-summary.ts:105` (listedStockAvgPrice × shares) | 자동 정합 (값 정정만) |
| ⑦ | 결과 카드·PDF | `Page1CoverSection` · `ListedStockBesshiPdfDocument` · breakdown (Step 6) | 자동 정합 (closingAvg 정정) |
| ⑧ | Validation | `lib/calc/inheritance-validate.ts:287` 갑·을 분기 | 규칙 영향 0건 확인만 |

`ui-engine-sync-checker` 호출은 Step 7 종료 후 1회.

---

## 5. 위험·회귀

- **R-1** `lib/kiwoom/averages.ts:twoMonthSurroundingAvg` — **본 PR 내 처리 의사결정 필요**.
  - 실측 grep 결과 호출처는 **단일** (`app/api/kiwoom/valuation-2month/route.ts:144` 외 0건, master 기준 검증 완료).
  - 옵션 (i) **본 PR 내 제거** — route(D-1)에서 grouping 결과로 응답을 구성하므로 twoMonthSurroundingAvg 호출 자체 삭제 가능. slot·closingPrices·weekendLabels 산출은 grouping 함수가 raw slotDates/closingPrices/weekendLabels 입력을 받도록 시그니처 점검 후 동일 결과 산출. **장점**: dead code 0, average 필드가 다시 잘못된 산식으로 회귀할 위험 영구 차단.
  - 옵션 (ii) **@deprecated 격하만, 차기 PR 제거** — D-1에서 호출은 유지하되 결과의 average/sum/tradingDays 만 grouping 결과로 덮어쓰기. 본 PR 범위 최소화. **단점**: dead path 유지 + 향후 신규 호출 추가 시 잘못된 산식 부활 위험.
  - **권장**: 옵션 (i) — 본 PR 내 제거. grouping 함수가 slot 생성·시세 매핑까지 모두 책임지도록 D-1에서 일원화.
- **R-2** **수동 입력 모드 보존** — 자동조회 미사용 시 `listedStockDailyGroupsInput`이 비어(undefined) 사용자가 평균만 직접 입력. **C-1의 `tradingDays > 0` 가드**가 fallback 분기를 보장 (`?? avgPrice` 패턴은 0-trap 위험으로 금지 — §2-1·C-1 참조).
- **R-3** **anchor shift 정합** [[listed-stock-valuation-anchor-shift-fix]] — resolvedAnchor 기반 grouping을 `applyKiwoomValuationResponse`가 이미 사용 중(`anchorForGrouping = response.resolvedAnchor ?? response.valuationDate`). 본 정정은 grouping 결과를 SSOT로 채택하는 것이므로 anchor shift와 자동 정합.
- **R-4** **§63②3호 미상장 신주 분기** — `applyCapitalIncreaseShareValuation(avgPrice, ...)` 호출에서 avgPrice → closingAvg 치환 필요. breakdown amount(⑨/⑮/⑯/⑰) 전체 점검. 기존 테스트(`inheritance-stock-capital-increase-new-shares-section-63-2-3.plan.md`) anchor 회귀 확인.
- **R-5** **할증 20% (§63③)** — `perShareMajorShareholder = floor(closingAvg × 1.2)`로 변경. 기존 anchor가 61,526 × 1.2 = 73,831 같은 값을 기대하면 61,465 × 1.2 = 73,758로 갱신. E-2 일괄 처리.
- **R-6** **IndexedDB 자동저장·이력 stale 값** [[feedback_local_storage_rules]] — 이전에 저장된 calculation의 `listedStockAvgPrice = 61,526` 등 stale 값은 **마이그레이션 불필요**. 사용자가 이력에서 폼 복원 후 "다시 계산하기" 트리거 시 본 PR 산식이 자동 적용되어 새 값으로 덮어쓰기. 단, **이력 복원 직후 결과 카드 첫 렌더에는 stale 값이 잠시 표시될 수 있음** → resultData 직렬화된 갑지 ⑨ 텍스트도 stale 일 가능성. 영향 경미하므로 별도 마이그레이션 없이 PR 노트에 1줄 안내(`이전 계산 이력은 재계산 시 자동 정정됩니다`)로 처리.

---

## 6. Acceptance Criteria

- [ ] **AC-1** 이미지 14 fixture 입력 → 갑지 ⑨ · 을지 종가평균 · 입력 폼 미리보기 단순평균 · PDF ⑨ **모두 61,465 원**.
- [ ] **AC-2** 할증 20% 적용 시 화면 ⑩ · **PDF ⑩** · breakdown ⑩ amount = floor(61,465 × 1.2) = **73,758 원**.
- [ ] **AC-3** EstateItem.listedStockAvgPrice 저장값 = 61,465 (Network 탭 API request body 확인).
- [ ] **AC-4** `breakdown[⑨ 전후 2개월 종가 평균]` amount = 61,465.
- [ ] **AC-5** 자동조회 미사용(수동 입력) 모드: 사용자가 직접 입력한 평균값이 갑지 ⑨에 그대로 표시 (fallback 동작).
- [ ] **AC-6** anchor shift 케이스(2022-12-02 → resolvedAnchor) 회귀 0건.
- [ ] **AC-7** §63②3호 미상장 신주 분기 anchor 회귀 0건 (산식은 closingAvg 기준, 기대값은 양쪽 카운트 평균 기준 갱신).
- [ ] **AC-8** 전체 회귀 0건, tsc 0건, e2e cross-display 일치 spec 통과.

---

## 7. 단일 PR로 묶을지 여부

권장: **단일 PR**. (a) 산식 정정 + (b) anchor 갱신 + (c) e2e cross-display 일치 검증을 한 묶음으로 머지해야 중간 상태에서 화면 모순이 노출되지 않음. PR 본문에 산식 RCA 표 + 영향 anchor 목록 + Network 탭 캡처 포함.

---

## 8. 참고

- 디자인: `docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md` §3-3·§4
- 인접 정정: `docs/00-pm/listed-stock-besshi-page2-empty-bug-fix.plan.md`, `docs/00-pm/listed-stock-valuation-anchor-shift-fix.plan.md`
- 메모리: [[feedback_pre_anchor_verification]] · [[feedback_anchor_correction_legal_priority]] · [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_engine_result_display_drift]] · [[feedback_per_tax_test_scripts]] · [[feedback_browser_verify_with_playwright]]
