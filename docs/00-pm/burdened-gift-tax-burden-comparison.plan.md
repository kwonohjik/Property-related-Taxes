# 부담부증여 세부담 비교 — 계획서

> 작성일: 2026-06-21 · 세목: 증여세(gift) · 유형: 결과뷰 신규 카드
> 상태: Plan (Do 미착수) · 선행 인터뷰 완료(아래 §2 확정사항)

## 1. 목표

부담부증여 결과탭에 **단순증여(부담부증여가 아닐 경우) 대비 세부담 비교**를 독립 카드로 표시한다.

- 단순증여 시 증여세
- 부담부증여 시 증여세 + 양도소득세(채무인수분)
- 두 시나리오의 **총 세부담 차이**

**성공 기준(검증 가능)**: 부담부증여 자산이 있는 입력으로 계산했을 때, 결과탭에 비교 카드가 렌더되고 각 칸의 숫자가 (a) 단순증여 증여세, (b) 부담부 증여세, (c) 양도세 합계, (d) 합계·차액과 자기일관(합계 = 증여세 + 양도세, 차액 = 단순증여 − 부담부 합계)을 만족한다. anchor 테스트 1건으로 실증.

## 2. 인터뷰 확정사항 (2026-06-21)

| 항목 | 확정 |
|---|---|
| **비교 범위** | **총 세부담 비교(양도세 포함)** — 단순증여 증여세 vs (부담부 증여세 + 양도소득세) |
| **표시 형태/위치** | **독립 비교 카드 신설** — 부담부증여 양도세 카드(`BurdenedTransferTaxResultCard`) 인근, 표 형태 |
| **단순증여 정의(가정)** | 동일 자산을 **채무인수 없이 전부 무상증여**로 가정. 입력 중 **엔진 전달 전 자산 배열 전체(`giftItems` + `stockItems` 병합분)**의 `assumedDebtForGift`만 0(주식 부담부증여 §47① 채무 포함), 공제·사전증여·세대생략·2-스트림 특례 등 나머지 조건 동일 |

## 3. 현황 (실측 기준)

### 입력·엔진
- 부담부증여 토글: `EstateItem.burdenedGiftTransferTax !== undefined` (양도세 함께 계산 ON). 단일 자산만 허용.
- 채무인수액: `EstateItem.assumedDebtForGift` (§47①). 증여세 엔진 `lib/tax-engine/gift-tax.ts:122-165`에서 전 자산 합산 후 과세가액에서 차감 → `netCurrentGiftValue` 감소.
- **`assumedDebtForGift`를 0으로 두면 단순증여 증여세가 정확히 산출됨** (엔진 변경 불필요. grossGiftValue는 이미 자산 전체 평가액).

### 결과 타입 필드 (확정)
- 증여세 결정세액: `GiftTaxResult.finalTax` (`inheritance-gift.types.ts:442`)
- 양도세 총납부세액(지방소득세 포함): `TransferTaxResult.totalTax` (`transfer.types.ts:646`)

### 오케스트레이션 (`components/calc/GiftTaxForm.tsx:125-176`)
- `handleCalculate`가 ① `/api/calc/gift` 1회 호출 → `result` ② 부담부 자산별 `callGiftBurdenedTransferAPI` 직렬 호출 → `transferTaxResults` / `transferTaxError`.
- 결과뷰 삽입 지점: `GiftTaxResultView.tsx:501-505` (`<BurdenedTransferTaxResultCard>` PrintSection).

## 4. 설계

### 4-1. 단순증여 증여세 — `calcGiftTax` 동기 호출 (2차 네트워크 호출 아님)

> **정정(과복잡 제거)**: 단순증여 증여세는 `/api/calc/gift` 2차 네트워크 라운드트립이 **불필요**하다. 증여세 엔진 `calcGiftTax(input, options)`는 `lib/tax-engine/gift-tax.ts:70`의 **동기 순수 함수**이며 Supabase `tax_rates` preload가 없다(`brackets`는 `DEFAULT_INHERITANCE_GIFT_BRACKETS` 기본값 — gift route `app/api/calc/gift/route.ts:70`도 `calcGiftTax(input)`을 인자 없이 호출). 양도세와 달리 DB 세율 주입이 없으므로, 2차 호출이 추가로 하는 일은 rate-limit + Zod 검증뿐인데 동일 input(채무만 다름)으로 1차 호출에서 이미 통과한 것이라 중복이다. 따라서 클라이언트에서 `calcGiftTax(debtZeroedInput)`를 **직접 1줄 동기 호출**한다.

부담부 자산이 1건 이상일 때만 산출:

```
단순증여 input = buildGiftTaxInput(form) 결과에서
  giftItems[].assumedDebtForGift = 0 (또는 제거)
  ── ★ buildGiftTaxInput은 [...form.giftItems, ...form.stockItems]를 합쳐 giftItems 단일 배열로
     엔진에 전달한다(gift-api.ts:42). 따라서 위 giftItems[]는 **부동산 + 주식이 병합된 전 자산 배열**이며,
     그 배열 전체의 assumedDebtForGift를 0으로 덮어써야 한다(주식 부담부증여 §47① 채무 포함).
→ calcGiftTax(debtZeroedInput) 동기 호출 → simpleGiftResult: GiftTaxResult | null
```

- 새 state 불요(파생값) — 비교 순수함수 안에서 `calcGiftTax`를 호출해 즉시 산출 가능. state로 둘 경우에도 `handleReset` reset만 추가하면 되나, **네트워크 실패 분기·로딩 직렬화가 사라지므로** 별도 비동기 state·에러 배너 모두 불필요.
- **부담부 자산이 없으면 산출 생략**(`simpleGiftResult = null`) → 비교 카드 미표시.
- (2차 네트워크 호출 제거에 따라 기존 "2차 호출 실패 시 null" 분기·§6 '2차 gift 호출 실패' 엣지 케이스는 통째로 불필요해진다.)
- **이력 저장(`autoSave`)·resultData에는 미포함** — 비교용 파생값. 기존 `result`만 저장.

> 구현 주의: `buildGiftTaxInput`은 `[...form.giftItems, ...form.stockItems]`를 매핑해 **단일 `giftItems` 배열**로 엔진에 전달한다(gift-api.ts:42). 따라서 채무 0 적용은 **변환 결과(엔진 input)의 `giftItems` 배열 전체(부동산 + 주식 병합분)의 `assumedDebtForGift`를 0으로** 덮어쓴다(원본 `form` 불변). 주식도 `assumedDebtForGift`(§47①, `StockBurdenedDebtSection.tsx:81`, 메모리 `project_gift_stock_burdened_debt`)를 보유하므로, `giftItems`에만 적용하고 `stockItems`를 누락하면 단순증여 baseline이 주식 채무만큼 과소 산출되어 §1 자기일관성을 위반한다. 정확한 키 이름은 `lib/calc/gift-api.ts`에서 Do 착수 시 grep 확인(채무 필드 매핑 키).

### 4-2. 비교 데이터 (파생, 순수 계산)

| 값 | 산식 |
|---|---|
| 단순증여 증여세 | `simpleGiftResult.finalTax` |
| 부담부 증여세 | `result.finalTax` |
| 부담부 양도세 | `transferTaxResults.reduce((s,t)=>s+t.totalTax, 0)` |
| 부담부 총세부담 | 부담부 증여세 + 부담부 양도세 |
| **세부담 차이** | 단순증여 증여세 − 부담부 총세부담 |

순수 함수 1개로 추출(예: `computeBurdenedGiftComparison(simpleGiftResult, giftResult, transferTaxResults)`) — UI에서 자체 재계산 금지(단일 진실). 위치 후보: `lib/calc/gift-burdened-transfer-api.ts` 또는 신규 `lib/calc/gift-burden-comparison.ts`.

> `simpleGiftResult` 산출: 비교 순수함수(또는 별도 헬퍼) 안에서 `buildGiftTaxInput(form)` 결과의 **`giftItems` 배열 전체(부동산 + 주식 병합분 — gift-api.ts:42)**의 `assumedDebtForGift`를 0으로 덮어쓴 input을 `calcGiftTax(debtZeroedInput)`로 **동기 호출**해 얻는다(§4-1 정정 — 2차 네트워크 호출 아님). `finalTax`만 비교하더라도 §46①2호·§58 안분이 `netCurrentGiftValue`에 비선형 의존하므로 재계산 자체는 필요(delta 역산 불가)하지만, fetch가 아닌 순수 호출이라는 점이 핵심.

### 4-3. 결과 카드 (신규 컴포넌트)

`components/calc/results/BurdenedGiftComparisonCard.tsx`

- 표 형태(인터뷰 확정 미리보기):

```
구분          단순증여      부담부증여
증여세        120,000,000    70,000,000
양도소득세         —         35,000,000
─────────────────────────────────────
합계          120,000,000   105,000,000
세부담 차이              △15,000,000
```

- 금액 칸: `text-right font-mono tabular-nums whitespace-nowrap` + `BesshiRow`/`BesshiColumn` 재사용 (amount-column-align 스킬).
- "원" 접미사 생략(`feedback_no_won_suffix`).
- 차액 부호: 단순증여 > 부담부 합계면 부담부 합계가 작다는 **중립적 사실**만 표시(△ 또는 색상). **"절세"·"유리"·"불리" 등 유불리 표현 금지**(`feedback_tax_calculation_principle`). 카드 하단에 "두 시나리오의 세부담을 비교한 참고 정보입니다" 수준 중립 안내.
- 펼치기/접기는 단순 표라 불필요(기본 노출). 필요 시 `ExpandToggleButton` 표준.

### 4-4. 결과뷰 삽입 (`GiftTaxResultView.tsx`)

- `BurdenedTransferTaxResultCard` 인근에 `<PrintSection id="burdened-gift-comparison">` 으로 삽입.
- props: `simpleGiftResult`, `giftResult`(=result), `transferTaxResults`.
- **표시 조건**: `simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError`.
  - `transferTaxError` 존재 시 양도세 합계가 불완전 → 합계 오도 방지 위해 비교 카드 숨김.
- `GiftTaxResultView`까지 `simpleGiftResult` prop 전달 경로 추가(`GiftTaxForm` → `GiftTaxResultView`).
- 선택 출력(PrintSelectionPanel) 신규 id 등록 — **3곳 동기화 필수**(한 줄 등록으로 동작하지 않음, `project_selective_print_6tax_series` 패턴):
  1. **`GiftPrintSectionId` 유니온에 `"burdened-gift-comparison"` 리터럴 추가** (`lib/print/gift-print-sections.ts:30`). 미추가 시 PrintSection `id` prop이 TS 컴파일 에러.
  2. **`GIFT_PRINT_SECTIONS` 트리에 leaf 노드 추가** (`gift-print-sections.ts:55`, 예: `group:summary` 또는 적절 그룹에 `{ id: "burdened-gift-comparison", label: ..., channel: SCREEN }`). 미추가 시 선택 패널에 항목 미노출.
  3. **`GiftTaxResultView` `availablePrintIds` useMemo에 조건부 등록** (`GiftTaxResultView.tsx:290` `burdened-transfer-tax` 패턴과 동일): `if (simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError) s.add("burdened-gift-comparison")` — **표시 조건(§4-4 표시 조건)과 동일하게 일치**. 미등록 시 선택 가능 목록에서 누락.

## 5. 동기화 지점 점검

엔진 input/result **신규 필드 없음**(기존 타입 재사용) → 14지점 대부분 N/A. 실제 작업 지점:

| 지점 | 작업 |
|---|---|
| 오케스트레이션 | `GiftTaxForm.tsx` — `calcGiftTax(debtZeroedInput)` 동기 호출로 `simpleGiftResult` 산출(§4-1 정정: 2차 네트워크 호출 아님). state로 둘 경우 reset 추가, 네트워크 실패 분기 불요 |
| ④ API 변환 | `buildGiftTaxInput` 결과 input의 **`giftItems` 배열 전체(부동산 + 주식 병합분, gift-api.ts:42)**의 `assumedDebtForGift`를 0으로 덮어쓰기(원본 form 불변). 주식 채무 누락 금지 |
| ⑦ 결과 카드 | `BurdenedGiftComparisonCard` 신규 + `GiftTaxResultView` 삽입·prop 전달 |
| 선택 출력 | PrintSection id 등록 — **3곳 동기화**: ① `GiftPrintSectionId` 유니온 ② `GIFT_PRINT_SECTIONS` leaf ③ `availablePrintIds` memo (§4-4 참조) |
| ⑧ validation | N/A (신규 입력 필드 없음) |
| 사이드바 | N/A (결과 도착 후에만 산출되는 비교값) |

## 6. 엣지 케이스

- 부담부 자산 0건 → 단순증여 산출 생략, 카드 미표시.
- 양도세 계산 실패(`transferTaxError`) → 카드 미표시(불완전 합계 차단).
- (§4-1 정정으로 단순증여는 `calcGiftTax` 동기 호출 — **2차 gift 네트워크 호출 실패 케이스는 더 이상 존재하지 않음**.)
- 사전증여 합산·세대생략 할증·2-스트림 특례 → 동일 input(전 자산 채무만 0)이라 두 시나리오에 일관 반영(자동).
- 차액 음수(부담부가 더 큼) → △ 없이 양수 차이로 중립 표시(부호 규칙 명확화).

## 7. Pre-Do anchor (Do 진입 전 우선 작성)

`pre-do-anchor-verification` 정책. Do 전 anchor 1건 우선 실행 → 실패 확보 → 환류:

1. **단순증여 증여세 = 채무 0 산출 일치**: 동일 자산에서 `assumedDebtForGift` 0 vs 채무 N 두 input을 엔진에 통과시켜, 0일 때 `finalTax`가 채무 미차감(자산 전체 증여) 값과 일치, 채무 N일 때 차감 값과 일치함을 원단위 `toBe()`로 고정. 위치: `__tests__/tax-engine/gift/` 또는 비교 순수함수 단위 테스트.
2. **비교 자기일관**: `computeBurdenedGiftComparison` 합계 = 증여세 + 양도세, 차액 = 단순 − 부담부 합계 anchor.

## 8. E2E

`e2e/gift-burdened-transfer.spec.ts` 패턴 재사용(worktree `E2E_PORT` 격리). 부담부 자산 입력 → 계산 → 비교 카드 testid 존재 + 3개 금액 행 노출 확인. RadioCardGroup accessible-name 오매칭 함정 주의 → **testId 셀렉터** 사용.

## 9. 작업 순서 (Do)

1. Pre-Do anchor 2건 작성·실행(실패 확보) → 환류.
2. 비교 순수함수 `computeBurdenedGiftComparison` + 단위 anchor.
3. `GiftTaxForm` — `calcGiftTax(debtZeroedInput)` 동기 호출(전 자산 채무 0)·simpleGiftResult 산출·(state 시 reset). §4-1 정정: 2차 네트워크 호출 아님.
4. `BurdenedGiftComparisonCard` 신규 + `GiftTaxResultView` 삽입·prop·PrintSection id **3곳 동기화**(§4-4: 유니온·leaf·memo).
5. `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/gift/` → E2E 1건.
6. 브라우저 수동 확인(폼→계산→결과, 단순증여 baseline이 전 자산 채무 0으로 산출되는지) 또는 미수행 명시.

## 10. SCOPE OUT

- 양도세 세부 경로(K-1~K-5)별 비교는 기존 양도세 카드가 담당 — 비교 카드는 합계만.
- 비교 결과의 이력 저장·PDF 별도 채널 확장(필요 시 후속).
- 유불리 판단·권유 문구(정책상 금지).
