# 부담부증여 세부담 비교 카드 — 엔진 설계

> Plan 참조: `docs/00-pm/burdened-gift-tax-burden-comparison.plan.md`
> 작성일: 2026-06-21
> 법령 검증: KoreanLaw MCP MST 276123 (상속세 및 증여세법 시행 2026-01-02) §47①③ 직접 확인
> 관련 PR: #315 (K-4/K-5 취득가액), #316 (§114의2 가산세), #321 (결과뷰 정리)

---

## Context

부담부증여 결과탭에 **단순증여 대비 총 세부담 비교** 카드를 독립 신설한다.

- 단순증여(동일 자산·채무 0 가정) 증여세 vs 부담부증여(증여세 + 양도소득세) 합계를 표 형식으로 표시
- 세부담 차이(단순증여 − 부담부 합계)를 중립적 사실로 표시 — "절세"·"유리"·"불리" 등 유불리 표현 금지

**이전 한계**: 결과탭에 부담부 양도세 결과는 있으나, 단순증여 baseline과의 비교가 없어 사용자가 두 시나리오를 직접 수계산해야 했다.

**엔진 신규 계산 0건**: `calcGiftTax(input, options)`는 이미 동기 순수 함수다. `assumedDebtForGift`를 0으로 덮어쓴 input을 그대로 전달하면 단순증여 baseline이 산출된다. DB 세율 조회·네트워크 호출 불필요.

---

## 법령 근거 (KoreanLaw MCP MST 276123 직접 확인)

### 상증법 §47① — 채무인수 차감 (KoreanLaw 확인)

```
제47조(증여세 과세가액)
① 증여세 과세가액은 증여일 현재 이 법에 따른 증여재산가액을 합친 금액[…합산배제증여재산 제외]에서
   그 증여재산에 담보된 채무(그 증여재산에 관련된 채무 등 대통령령으로 정하는 채무를 포함한다)로서
   수증자가 인수한 금액을 뺀 금액으로 한다.
```

**설계 적용**: 부담부증여 시 `assumedDebtForGift` > 0이면 엔진이 과세가액에서 차감한다. 단순증여 baseline 산출 시 이 채무를 0으로 설정하면 동일 자산의 전액 무상증여 케이스가 된다.

### 상증법 §47③ — 배우자·직계존비속 부담부증여 채무 추정 (KoreanLaw 확인)

```
③ 제1항을 적용할 때 배우자 간 또는 직계존비속 간의 부담부증여에 대해서는 수증자가 증여자의 채무를
   인수한 경우에도 그 채무액은 수증자에게 인수되지 아니한 것으로 추정한다. 다만, 그 채무액이
   국가 및 지방자치단체에 대한 채무 등 대통령령으로 정하는 바에 따라 객관적으로 인정되는 것인
   경우에는 그러하지 아니하다.
```

**설계 적용**: §47③ 단서(객관적 채무) 충족 여부는 기존 증여세 엔진이 이미 처리한다. 비교 카드는 엔진이 실제로 적용한 `finalTax`를 그대로 사용하므로, §47③ 분기를 별도로 재구현할 필요 없다.

### 상증법 §53 — 증여재산공제 (KoreanLaw 확인 — 비교값 유지 확인용)

```
거주자가 다음 각 호에 해당하는 사람으로부터 증여를 받은 경우:
1호 배우자: 6억원 (10년 합산)
2호 직계존속(성년): 5천만원 / (미성년): 2천만원 (10년 합산)
3호 직계비속: 5천만원 (10년 합산)
4호 기타 4촌 이내 혈족·3촌 이내 인척: 1천만원 (10년 합산)
```

**설계 적용**: 단순증여 input은 채무만 0으로 바꾸고 공제·관계·사전증여 등 나머지는 동일하게 유지한다. `§53` 공제 비선형성(과세가액 감소 → 공제 한도 재계산)이 있으므로, delta 역산이 아닌 엔진 재호출로만 정확한 단순증여 baseline을 얻을 수 있다.

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

| # | 시나리오 | 상황 | simpleGiftResult | 비교 카드 표시 | anchor 출처 | 상태 |
|---|---------|------|-----------------|--------------|-----------|------|
| T-01 | 부담부 자산 1건 + 양도세 성공 | 기본 케이스 | 산출됨 | 표시 | 수기 계산 (아래 §Anchor 기대값) | ☐ TODO |
| T-02 | 부담부 자산 0건 | 순수 증여 | null | 미표시 | — | ☐ TODO |
| T-03 | 양도세 계산 실패 (`transferTaxError` 있음) | API 오류 | 산출되나 카드 미표시 | 미표시 (불완전 합계 차단) | — | ☐ TODO |
| T-04 | 단순증여가 부담부 합계보다 클 때 (양수 차이) | 일반적 | 산출됨 | 차이 표시 | 아래 §Anchor T-01 | ☐ TODO |
| T-05 | 단순증여가 부담부 합계보다 작거나 같을 때 (음수·0 차이) | 비정상 방어 | 산출됨 | 차이 0 또는 음수 표시 — 중립 표기 | — | ☐ TODO |
| T-06 | 부담부 자산 2건 이상 (transferTaxResults 2건) | 다중 양도세 | 산출됨 | 양도세 = 합산 | — | ☐ TODO |
| T-07 | 주식 부담부증여 (`stockItems`에 채무) | 주식 채무 | 채무 0 처리 포함 (`giftItems` 병합분 전체) | 표시 | — | ☐ TODO |
| T-08 | 2-스트림 특례 자산 포함 | 특례 분리과세 | calcGiftTax 재호출 시 동일 특례 적용 | 표시 (특례 동일 반영) | — | ☐ TODO |
| T-09 | 사전증여 합산 포함 | §47② 10년 합산 | calcGiftTax 재호출 시 동일 합산 적용 | 표시 | — | ☐ TODO |
| T-10 | 세대생략 할증 포함 | §57 | calcGiftTax 재호출 시 동일 할증 적용 | 표시 | — | ☐ TODO |

**규칙**: T-02·T-03은 카드 미표시 — simpleGiftResult null / transferTaxError 있음. 나머지는 카드 표시.

---

## 엔진 input/result 타입 변경

### 신규 없음

엔진 타입(`GiftTaxInput`, `GiftTaxResult`, `TransferTaxResult`) 변경 없음.
비교 카드는 기존 타입 필드만 소비한다:

- `GiftTaxResult.finalTax` — 증여세 결정세액 (`inheritance-gift.types.ts:642`)
- `TransferTaxResult.totalTax` — 양도세 총납부세액(지방소득세 포함) (`transfer.types.ts:646`)

### 비교 순수함수 타입 (신규)

```ts
// 위치: lib/calc/gift-burden-comparison.ts (신규) 또는 gift-burdened-transfer-api.ts 말미

/** 부담부증여 세부담 비교 결과 */
export interface BurdenedGiftComparisonResult {
  /** 단순증여(채무 0) 시 증여세 결정세액 */
  simpleGiftTax: number;
  /** 부담부증여 시 증여세 결정세액 */
  burdenedGiftTax: number;
  /** 부담부증여 시 양도소득세 합계 (지방소득세 포함) */
  burdenedTransferTax: number;
  /** 부담부 총세부담 = burdenedGiftTax + burdenedTransferTax */
  burdenedTotal: number;
  /** 세부담 차이 = simpleGiftTax − burdenedTotal (음수 가능) */
  taxBurdenDiff: number;
}
```

---

## 계산 알고리즘 (단계별)

### STEP 1 — 단순증여 baseline input 구성

```
engineInput = buildGiftTaxInput(form)      // gift-api.ts:40 — FormState → GiftTaxInput
             (부동산 + 주식 병합: allItems = [...form.giftItems, ...form.stockItems])

simpleInput = {
  ...engineInput,
  giftItems: engineInput.giftItems.map(item => ({
    ...item,
    assumedDebtForGift: 0,   // §47① 채무인수액 0 — 전액 무상증여 가정
  })),
}
```

**주의**: `buildGiftTaxInput`의 `allItems`(gift-api.ts:42)는 `[...form.giftItems, ...form.stockItems]`
병합 후 `resolveActiveUnlistedValuation`으로 매핑된 배열이다. 이 배열이 `engineInput.giftItems`로
전달되므로, 채무 0 설정은 **엔진 input의 `giftItems` 배열 전체**(부동산 + 주식 병합분)에 적용해야 한다.
`form.giftItems`에만 적용하고 `form.stockItems`를 누락하면 주식 채무(§47①,
`project_gift_stock_burdened_debt` 메모리)만큼 과소 산출 → T-01 자기일관 위반.

**원본 불변**: `engineInput` 객체 직접 변경 금지. `map` + 스프레드로 새 객체 생성.

### STEP 2 — 단순증여 증여세 동기 산출

```
simpleGiftResult = calcGiftTax(simpleInput)
                               // lib/tax-engine/gift-tax.ts:70 — 동기 순수 함수
                               // DB 세율 주입 없음 (DEFAULT_INHERITANCE_GIFT_BRACKETS 기본값)
                               // gift route도 calcGiftTax(input) 인자 없이 호출 — 동일
```

- **2차 네트워크 호출 불필요**: 양도세와 달리 증여세 엔진은 DB 세율을 인수로 받지 않는다. route의
  `calcGiftTax(input)` 호출과 클라이언트의 `calcGiftTax(simpleInput)` 호출은 동일 세율(기본값)을 사용한다.
- **부담부 자산 없으면 생략**: `engineInput.giftItems.every(it => (it.assumedDebtForGift ?? 0) === 0)`
  이면 단순증여와 부담부증여가 동일 → `simpleGiftResult = null`, 비교 카드 미표시.
- **★ 게이트 필드 정렬 (STEP 2 ↔ STEP 4 동치 차이 주의)**: STEP 2의 `simpleGiftResult` 산출 게이트는
  `assumedDebtForGift > 0`(채무 존재)이지만, `transferTaxResults`는 `burdenedGiftTransferTax !== undefined`
  자산만으로 채워진다(`GiftTaxForm.tsx:142-143`). 두 필드는 **동치가 아니다**: 주식 부담부증여는
  `StockBurdenedDebtSection`이 `assumedDebtForGift`만 독립 설정하고 `burdenedGiftTransferTax`(양도세 토글)는
  미설정할 수 있다 → 이 경우 `simpleGiftResult != null`(채무>0)이지만 `transferTaxResults.length === 0`.
  비교 카드는 **양도세 합계가 존재할 때만 의미**가 있으므로, STEP 4의 AND 조건 (2)
  `transferTaxResults.length > 0`이 최종 표시 게이트다 → "주식 채무만 있고 양도세 토글 OFF"인 경우
  **카드 미표시가 의도**다(불완전한 비교 차단). simpleGiftResult를 채무 게이트로 산출하더라도
  표시는 transferTaxResults 존재에 종속됨을 STEP 4·anchor-3에 명시.
- **C-4 validation 관계 (참조)**: `burdenedGiftTransferTax` 토글 ON ⇒ `assumedDebtForGift > 0` 강제
  (`gift-tax-form-shared.tsx:367-369`, "채무인수가 있어야 양도소득세가 발생"). 즉
  `transferTaxResults`가 채워지는 자산은 항상 채무>0 부분집합이다. 역은 성립하지 않는다(주식 채무 단독 사례).
- **비동기 분기·에러 상태 불필요**: 동기 함수이므로 loading state·에러 배너 없음. 예외는 발생하지
  않는다(엔진 순수 함수 — 검증은 이미 route에서 통과한 input).

### STEP 3 — 비교값 산출 (순수함수)

```
function computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
): BurdenedGiftComparisonResult {
  const simpleGiftTax   = simpleGiftResult.finalTax;
  const burdenedGiftTax  = giftResult.finalTax;
  const burdenedTransferTax = transferTaxResults.reduce((s, t) => s + t.totalTax, 0);
  const burdenedTotal    = burdenedGiftTax + burdenedTransferTax;
  const taxBurdenDiff    = simpleGiftTax - burdenedTotal;   // 음수 가능, 중립 표기
  return { simpleGiftTax, burdenedGiftTax, burdenedTransferTax, burdenedTotal, taxBurdenDiff };
}
```

**단일 진실**: UI가 이 함수를 import해 사용한다. UI 자체 재계산 금지(`feedback_ui_engine_dual_truth_avoidance`).

### STEP 4 — 결과 카드 표시

표시 조건(AND):
1. `simpleGiftResult != null` (부담부 자산 존재 + 단순증여 산출 성공 — 채무>0 게이트)
2. `transferTaxResults.length > 0` (양도세 결과 최소 1건 — `burdenedGiftTransferTax !== undefined` 자산)
3. `!transferTaxError` (양도세 계산 오류 없음 — 불완전 합계 차단)

**★ 조건 (1)과 (2)는 동치가 아님**: (1)은 `assumedDebtForGift > 0`로 충족되지만, (2)는 양도세 토글
(`burdenedGiftTransferTax`)이 켜진 자산이 있어야만 충족된다(STEP 2 게이트 정렬 참조). 주식 채무만 있고
양도세 토글이 OFF인 경우 (1)은 true이나 (2)가 false → 카드 미표시(**의도된 동작**, 양도세 합계 없이
비교 불가). 비교 카드의 실질 게이트는 (2)다.

---

## 오케스트레이션 흐름 (GiftTaxForm.tsx 변경 지점)

현행 `handleCalculate` 흐름에 STEP 1~2를 삽입:

```
[현행]
  1. POST /api/calc/gift → giftResult
  2. burdenedItems 순회 → callGiftBurdenedTransferAPI → transferTaxResults

[추가]
  0'. engineInput = buildGiftTaxInput(form)   ← 1번 호출과 동일 input (재계산 아님)
      simpleInput = engineInput.giftItems 채무 0 덮어씀
      simpleGiftResult = calcGiftTax(simpleInput)
  [기존 1, 2 순서 불변]
```

- `simpleGiftResult`는 로컬 변수 또는 별도 `useState`에 보관.
  - **로컬 변수 접근법**: `handleCalculate` 내에서 산출 후 `GiftTaxResultView`에 prop으로 전달.
    `handleReset` 시 `setSimpleGiftResult(null)` 1줄만 추가.
  - **결정**: Plan §4-1 정정 — 동기 산출이므로 별도 비동기 state·로딩 없음.
- `handleReset`에 `simpleGiftResult = null` 처리 추가(state 사용 시).

---

## 14개 동기화 지점 점검

엔진 input/result **신규 필드 없음** → 대부분 N/A.

| # | 지점 | 작업 | 파일 |
|---|------|------|------|
| ① 폼 상태 | N/A (신규 폼 필드 없음) | — | — |
| ② initial | N/A | — | — |
| ③ normalize | N/A | — | — |
| ④ API 변환 | `buildGiftTaxInput(form)` 결과의 `giftItems` 전체 `assumedDebtForGift = 0` 덮어쓰기 (원본 불변, map+spread) | `lib/calc/gift-api.ts` 의존 (변경 없음) + `GiftTaxForm.tsx` 오케스트레이션 |
| ⑤ UI 위젯 | N/A (신규 입력 필드 없음) | — | — |
| ⑥ 사이드바 합계 | N/A (비교값은 결과 도착 후 파생) | — | — |
| ⑦ 결과 카드 | `BurdenedGiftComparisonCard` 신규 컴포넌트 + `GiftTaxResultView` Props에 `simpleGiftResult?: GiftTaxResult` 추가(구조분해에서 받음) + 삽입·prop 전달 + availablePrintIds memo deps 갱신 | `components/calc/results/BurdenedGiftComparisonCard.tsx` (신규) / `GiftTaxResultView.tsx` |
| ⑧ validation | N/A (신규 입력 필드 없음 — 비교값은 표시 전용) | — | — |
| ⑨ Zod enum | N/A | — | — |
| ⑩ Zod 컴패니언 | N/A | — | — |
| ⑪ acqDate fallback | N/A | — | — |
| ⑫ Zod 입력객체 | N/A | — | — |
| ⑬ body spread | N/A | — | — |
| ⑭ Route 매핑 | N/A | — | — |

**실제 작업 지점 요약**:
- `GiftTaxForm.tsx` — `calcGiftTax(simpleInput)` 동기 호출 + `simpleGiftResult` 보관 + prop 전달
- `GiftTaxResultView.tsx` — `interface Props`(`GiftTaxResultView.tsx:140-187`)에 `simpleGiftResult?: GiftTaxResult` 필드 추가 + 구조분해(189-205)에서 받음(optional이므로 기본값 불필요). **`GiftTaxResult` import는 이미 존재(line 9) — 중복 추가 금지.** 표시 조건 가드 + `availablePrintIds` memo 등록 + memo 의존성 배열에 `transferTaxError`·`simpleGiftResult` 추가
- `lib/calc/gift-burden-comparison.ts` (신규) — `computeBurdenedGiftComparison` + 타입
- `components/calc/results/BurdenedGiftComparisonCard.tsx` (신규) — 표 UI
- `lib/print/gift-print-sections.ts` — PrintSection id 3곳 동기화 (아래 §선택 출력 참조)

---

## 선택 출력 (PrintSection) 3곳 동기화

`project_selective_print_6tax_series` 패턴에 따라 **정확히 3곳**을 동기화해야 한다.
단 1곳이라도 누락 시 컴파일 오류 또는 선택 패널 미노출.

### (1) `GiftPrintSectionId` 유니온에 리터럴 추가

파일: `lib/print/gift-print-sections.ts:30-44`

```ts
export type GiftPrintSectionId =
  | "core-result"
  | ...
  | "burdened-transfer-tax"
  | "burdened-gift-comparison";  // ← 추가
```

미추가 시 `<PrintSection id="burdened-gift-comparison" ...>` 에서 TS 컴파일 에러.

### (2) `GIFT_PRINT_SECTIONS` leaf 노드 추가

파일: `lib/print/gift-print-sections.ts:55` `group:etc` 그룹 children에 추가:

```ts
{ id: "burdened-gift-comparison", label: "세부담 비교 (단순증여 vs 부담부증여)", channel: SCREEN },
```

미추가 시 선택 패널에 항목 미노출.

### (3) `availablePrintIds` useMemo 조건부 등록

파일: `components/calc/results/GiftTaxResultView.tsx:260` useMemo 내부, `burdened-transfer-tax` 등록 직후:

```ts
if (
  simpleGiftResult != null &&
  transferTaxResults.length > 0 &&
  !transferTaxError
)
  s.add("burdened-gift-comparison");
```

**★ useMemo 의존성 배열 갱신 필수 (TS 미감지 — 누락 시 stale Set)**: 현행 `availablePrintIds` memo의
의존성 배열은 `[result, estateItems, priorGifts, transferTaxResults]`(`GiftTaxResultView.tsx:292`)로
**`transferTaxError`와 신규 prop `simpleGiftResult`가 빠져 있다**. 위 등록 조건이 이 두 값을 참조하므로,
deps에 추가하지 않으면 `transferTaxError`·`simpleGiftResult`만 바뀔 때 memo가 재계산되지 않아
`burdened-gift-comparison` 선택 항목이 stale 상태로 표시/미표시 사이에서 어긋난다(특히 `transferTaxError`
발생 시 §4 STEP 4 표시 조건과 가용 목록 불일치). 반드시 다음으로 갱신:

```ts
}, [result, estateItems, priorGifts, transferTaxResults, transferTaxError, simpleGiftResult]);
```

**3자 일치 항목**: ① 화면 표시 조건(§4 STEP 4) · ② `availablePrintIds` 등록 조건(위) ·
③ useMemo 의존성 배열 — 셋 모두 `simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError`를
참조·구동하도록 일치시킨다. 미등록·deps 누락 시 선택 가능 목록에서 누락 또는 stale.

---

## Silent fallback / 자동 안분 후보 식별

| 위치 | 위험 | 처리 |
|------|------|------|
| `assumedDebtForGift` 0 덮어쓰기 | 원본 `engineInput` 변경 → 이후 `/api/calc/gift` 호출이 채무 0으로 오전송 | **map+spread 새 객체**로 불변 보장 — 원본 `engineInput` 직접 mutation 금지 |
| `form.stockItems` 채무 누락 | 주식 채무가 `engineInput.giftItems`에 이미 병합됨 → 누락 없음(gift-api.ts:42 실측) | `buildGiftTaxInput` 결과 `giftItems` 배열 전체에 0 적용으로 충분 |
| `calcGiftTax` 예외 | 순수 함수, 예외 발생하지 않음 | try/catch 불필요. 단, Do 시 실측 확인 |
| 비교값 음수 (`taxBurdenDiff < 0`) | UI에서 "−" 표시 시 사용자 혼동 | 부호 중립 표시 (예: "−15,000,000" 그대로 표시). "불리"·"유리" 표현 금지 |

**자동 안분 금지 정책**: 단순증여 baseline 산출 시 `assumedDebtForGift`를 0으로 **명시 설정**한다. 그 외 모든 필드는 원본 그대로 유지한다. 빈 필드를 추정값으로 자동채움하는 로직 없음.

---

## 결과 카드 UI 명세 (`BurdenedGiftComparisonCard.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│  단순증여 vs 부담부증여 세부담 비교                           │
│                                                         │
│  구분          단순증여       부담부증여                      │
│  ─────────────────────────────────────────────          │
│  증여세      120,000,000    70,000,000                   │
│  양도소득세        —         35,000,000                   │
│  ─────────────────────────────────────────────          │
│  합계        120,000,000   105,000,000                   │
│  세부담 차이              △ 15,000,000                    │
│                                                         │
│  두 시나리오의 세부담을 비교한 참고 정보입니다.                    │
└─────────────────────────────────────────────────────────┘
```

- 금액 칸: `text-right font-mono tabular-nums whitespace-nowrap` (amount-column-align 스킬)
- "원" 접미사 생략 (`feedback_no_won_suffix`)
- 차액 부호: "△" (삼각형) 기호 + 절댓값 표시 (음수 시 "▼" 등으로 중립 표기, Do 시 확정)
- **"절세"·"유리"·"불리" 표현 금지** (법령 정확성 중립 정책)
- 카드 하단: "두 시나리오의 세부담을 비교한 참고 정보입니다" 안내 텍스트
- 펼치기/접기 불필요 (단순 표 — 기본 노출)
- `BesshiRow`/`BesshiColumn` 재사용 가능 여부는 Do 시 판단

**삽입 위치**: `GiftTaxResultView.tsx` 내 `<PrintSection id="burdened-transfer-tax">` 블록 직후,
`<PrintSection id="burdened-gift-comparison">` 래핑으로 삽입.

---

## Anchor 기대값

### anchor-1: 단순증여 채무 0 산출 자기일관 (핵심 — Pre-Do 우선 실행)

**파일**: `__tests__/tax-engine/inheritance-gift/burdened-gift-comparison.test.ts` (신설)

> ★ 경로 주의: 증여세 엔진 테스트는 `__tests__/tax-engine/inheritance-gift/`에 위치한다
> (`gift.test.ts`·`gift-burdened-debt-47-1-anchor.test.ts` 등). `__tests__/tax-engine/gift/`
> 디렉터리는 존재하지 않으므로 신규 생성 금지 — 회귀 스위트 누락·컨벤션 이탈 방지.
> (계산 순수함수 `lib/calc/gift-burden-comparison.ts` 단위 테스트는 `__tests__/calc/` 컨벤션도 고려.)

**입력 구성**:
- 자산 1건: 부동산, 평가액 200,000,000원, `assumedDebtForGift = 80,000,000`
- 관계: 직계존속 → 성년 자녀 (공제 한도 5,000만원)
- 사전증여 없음, 세대생략 없음, 기한 내 신고

**수기 계산 (단순증여 — 채무 0)**:
```
과세가액 = 200,000,000 − 0 (채무 0) = 200,000,000
증여재산공제 = 50,000,000
과세표준 = 150,000,000 (천원 미만 절사 → 150,000,000)
산출세액 = 150,000,000 × 20% − 10,000,000 (누진공제) = 20,000,000
신고세액공제 = 20,000,000 × 3% = 600,000
finalTax = 20,000,000 − 600,000 = 19,400,000
```

**수기 계산 (부담부증여 — 채무 80,000,000)**:
```
과세가액 = 200,000,000 − 80,000,000 = 120,000,000
증여재산공제 = 50,000,000
과세표준 = 70,000,000 (천원 미만 절사 → 70,000,000)
산출세액 = 70,000,000 × 10% = 7,000,000
신고세액공제 = 7,000,000 × 3% = 210,000
finalTax = 7,000,000 − 210,000 = 6,790,000
```

**기대값**:
```ts
expect(simpleGiftResult.finalTax).toBe(19_400_000);
expect(burdenedGiftResult.finalTax).toBe(6_790_000);
```

> ★ Do 진입 전 anchor-1을 실행해 현행 엔진이 위 수치를 반환하는지 실측 확인 필수.
> 세율·공제 상수 차이가 있으면 엔진 반환값을 anchor에 원단위 toBe() 고정.

### anchor-2: computeBurdenedGiftComparison 자기일관

**입력**: anchor-1 결과 사용
- simpleGiftResult.finalTax = 19,400,000
- giftResult.finalTax = 6,790,000
- transferTaxResults[0].totalTax = 5,000,000 (가정)

**기대값**:
```ts
const cmp = computeBurdenedGiftComparison(simpleGiftResult, giftResult, [{ totalTax: 5_000_000 }]);
expect(cmp.simpleGiftTax).toBe(19_400_000);
expect(cmp.burdenedGiftTax).toBe(6_790_000);
expect(cmp.burdenedTransferTax).toBe(5_000_000);
expect(cmp.burdenedTotal).toBe(11_790_000);                    // 6,790,000 + 5,000,000
expect(cmp.taxBurdenDiff).toBe(7_610_000);                     // 19,400,000 − 11,790,000
// 자기일관: burdenedTotal = burdenedGiftTax + burdenedTransferTax
expect(cmp.burdenedTotal).toBe(cmp.burdenedGiftTax + cmp.burdenedTransferTax);
// 자기일관: taxBurdenDiff = simpleGiftTax − burdenedTotal
expect(cmp.taxBurdenDiff).toBe(cmp.simpleGiftTax - cmp.burdenedTotal);
```

### anchor-3: 주식 채무 포함 T-07 케이스

**목적**: `form.stockItems`에 `assumedDebtForGift > 0`이 있을 때 채무 0 덮어쓰기가 전체 `giftItems` 병합분에 적용됨을 확인.

> ★ 표시 게이트 주의 (STEP 4 (2) 종속): 주식 채무(`assumedDebtForGift > 0`)만 있고 양도세 토글
> (`burdenedGiftTransferTax`)이 OFF이면 `transferTaxResults.length === 0` → STEP 4 AND 조건 (2) 미충족 →
> **비교 카드 미표시가 의도**다. 이 anchor는 `simpleInput` 채무 0 덮어쓰기 적용 범위만 검증하며,
> 카드 표시 자체를 전제하지 않는다. 채무 0 덮어쓰기(T-07)는 양도세 토글이 함께 켜진(transferTaxResults 채워진)
> 자산에 대해서만 비교 카드로 이어진다.

```ts
// buildGiftTaxInput 결과에서 stockItems 채무가 giftItems 배열에 병합되어 있는지 확인
const engineInput = buildGiftTaxInput(formWithStockBurdenedDebt);
const allDebtSum = engineInput.giftItems.reduce((s, it) => s + (it.assumedDebtForGift ?? 0), 0);
expect(allDebtSum).toBeGreaterThan(0);  // 주식 채무가 병합 배열에 포함

const simpleInput = {
  ...engineInput,
  giftItems: engineInput.giftItems.map(it => ({ ...it, assumedDebtForGift: 0 })),
};
const simpleDebtSum = simpleInput.giftItems.reduce((s, it) => s + (it.assumedDebtForGift ?? 0), 0);
expect(simpleDebtSum).toBe(0);  // 전체 채무 0으로 설정 확인
```

### anchor-4: 비교 카드 미표시 조건 (T-02, T-03)

```ts
// T-02: 부담부 자산 없음 → simpleGiftResult null → 카드 미표시
// 검증: engineInput.giftItems.every(it => (it.assumedDebtForGift ?? 0) === 0) 이면 null 반환

// T-03: transferTaxError 있음 → 표시 조건 불충족
// 검증: 컴포넌트 render 시 BurdenedGiftComparisonCard 미렌더 확인 (RTL)
```

---

## 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 부담부 자산 0건 | `simpleGiftResult = null` → 비교 카드 미표시. `computeBurdenedGiftComparison` 호출 안 함 |
| 양도세 계산 실패 | `transferTaxError` 있음 → 비교 카드 미표시 (불완전 합계 방지) |
| `taxBurdenDiff < 0` (부담부 합계 > 단순증여) | 음수 그대로 중립 표시. "불리" 표현 금지 |
| transferTaxResults 2건 이상 | `reduce` 합산으로 처리 (STEP 3 산식) |
| `calcGiftTax` 내부 특례 2-스트림 | 동일 input 재호출이라 동일하게 반영 — 별도 처리 없음 |
| `handleReset` 시 비교 초기화 | `simpleGiftResult = null` (state 사용 시) 또는 handleReset 기존 로직으로 자동 초기화 |

---

## 작업 순서 (Do)

1. **Pre-Do anchor-1 작성·실행 (실패 확보)** → 수기 계산값(§Anchor 기대값)과 엔진 반환값 대조. 불일치 시 anchor를 엔진 실측값으로 교정하고 설계 환류.
2. **`lib/calc/gift-burden-comparison.ts` 신규**: `BurdenedGiftComparisonResult` 타입 + `computeBurdenedGiftComparison` 순수함수. anchor-2·3·4 작성·통과.
3. **`GiftTaxForm.tsx` 오케스트레이션**: `buildGiftTaxInput(form)` 결과에서 `simpleInput` 구성 → `calcGiftTax(simpleInput)` 동기 호출 → `simpleGiftResult` 보관 + `handleReset` 초기화 추가.
4. **PrintSection 3곳 동기화** (`gift-print-sections.ts` 유니온·leaf + `GiftTaxResultView.tsx` availablePrintIds memo).
5. **`BurdenedGiftComparisonCard.tsx` 신규** + `GiftTaxResultView.tsx` 삽입·prop 전달.
6. `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/inheritance-gift/` → E2E 1건 (`e2e/gift-burdened-transfer.spec.ts` 패턴 재사용 — testId 셀렉터 사용).
7. 브라우저 수동 확인 (단순증여 baseline이 전 자산 채무 0으로 산출되는지 Network 탭 확인) 또는 미수행 명시.

---

## SCOPE OUT

- 단순증여 시나리오의 양도세(증여자 양도 없음 — 단순 무상증여이므로 해당없음)
- 양도세 세부 경로(K-1~K-5)별 비교 (기존 양도세 카드가 담당)
- 비교 결과의 이력 저장·PDF 별도 채널 확장
- 유불리 판단·권유 문구 (정책상 금지)
- §47③ 채무 추정(배우자·직계존비속 단서) 적용 여부 별도 안내 (이미 기존 엔진·결과뷰가 처리)
