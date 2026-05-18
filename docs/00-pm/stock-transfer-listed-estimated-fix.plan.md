# 상장주식 환산취득가 버그 수정 계획서

> 사용자 보고 2건 — 상장 (KOSPI/KOSDAQ/KONEX) 환산취득가 모드의 산식·개산공제 누락.
> 작성일 2026-05-18 · 대상 모듈 `lib/tax-engine/stock-transfer/stock-valuation-listed.ts`

## 1. 버그 확인

### 1.1 Bug-A — 환산 산식 누락 (취득시 기준시가를 그대로 취득가액으로 사용)

**현재 동작** (`stock-valuation-listed.ts:27-64`):

```ts
const perShareValue = Math.floor(transferDatePriceAvg1Month);  // ★ 양도시 기준시가
const totalAcquisitionPrice = perShareValue * shareCount;       // ★ 그대로 곱셈
```

→ `transferDatePriceAvg1Month` (양도일 직전 1개월 종가평균)을 곧장 1주당 취득가로 사용. **취득시 기준시가 입력 필드 자체가 없음.** 환산 비율 산정 미실시.

**올바른 산식 (소득세법 §97①1호 다목 + 시행령 §163⑨, §99①3)**:

```
1주당 환산취득가 = 1주당 양도가 × (취득시 기준시가 / 양도시 기준시가)
총액 환산취득가 = 양도가액 × (취득시 기준시가 / 양도시 기준시가)
```

여기서:
- **양도시 기준시가** = 양도일 직전 1개월 종가평균 (`transferDatePriceAvg1Month`, 현행 필드)
- **취득시 기준시가** = 취득일 직전 1개월 종가평균 (★ 신규 필드 — 현재 미존재)

### 1.2 Bug-B — 개산공제 base + 자동 적용 누락

**현재 동작** (`stock-transfer-tax.ts:283`):

```ts
estimatedBase = listedResult.perShareValue * shareCount;  // = 양도시 기준시가 × shareCount  ★ 잘못
```

→ `estimatedBase`가 **양도시 기준시가** 기준이지만 §163⑥4는 **취득기준시가 총액**의 1%를 개산공제로 규정.

또한 `stock-transfer-tax.ts:319-327`:

```ts
if (expenseMode === "actual") expenses = input.actualExpenses ?? 0;
else expenses = estimatedDeduction ?? 0;
```

→ `expenseMode === "actual"` 이면 개산공제 미적용. **환산 모드는 expenseMode 강제 estimated 또는 actual+개산공제 합산이어야 한다.** 부동산 양도세는 `calcNecessaryExpense`에서 환산 시 자동 개산공제 — 주식은 누락.

### 1.3 영향 범위

- `acquisitionMode === "estimated"` + `marketType ∈ {kospi, kosdaq, konex}` + `acquiredBeforeListing === false` + `tradingHaltAtTransfer === false` 경로 (상장 1개월 종가평균 환산).
- 비상장 보충 평가(`marketType === "unlisted"`) + 거래정지(§165③) + 취득 후 상장(§165⑤) 분기는 별도 산식 사용 — 본 PR 범위 외.
- 비과세 분기에서도 정보용 산식 echo로 동일하게 노출되어 잘못된 취득가 표시 가능 — 동시 해결.

## 2. 법령 근거 (★ Pre-Do KoreanLaw MCP 검증 필수)

> Plan v1의 §165⑤ 인용은 **취득 후 상장** 분기(다른 PR `9988c32` 범위)임. 일반 상장 환산은 모법 §99①3 + 시행령 §163⑨ 조합. 본 PR에서 §165⑤ 인용 제거.

> **모법 vs 시행령 표기 혼동 차단**: §99①3은 두 곳에 존재 — (a) 모법 §99①3(=양도소득세법 §99 제1항 제3호), (b) 시행령 §99 제1항 제3호. 본 plan에서는 "**모법 §99**" / "**시행령 §163**" 명시. KoreanLaw 검증 시 모법·시행령 쌍방 원문 확인.

| 조문 | 인용 가설 (Pre-Do 검증 후 확정) |
|---|---|
| 모법 §94①3 | 주식 양도소득 과세대상 (가목·나목) — 본 PR 범위 밖이나 분기 분류 인용 |
| 모법 §97①1호 다목 | "양도가액을 실지거래가액으로 결정 시" 취득가액 = 환산취득가 |
| 모법 §97② 단서 | (검증 필요) 환산취득가+개산공제 < 실비 시 후자 우선 — **주식 적용 여부 확인**. 적용 시 swap 분기 |
| 모법 §99①3 (또는 시행령 §165) | 상장주식 기준시가 — 평가기준일(양도일·취득일) **이전 1개월 종가평균** ★ "이전" vs "직전" 정확 표현 확인 |
| 시행령 §163⑨ | 환산취득가 = 실지양도가 × (취득시 기준시가 / 양도시 기준시가) |
| 시행령 §163⑥4 | 환산취득가 적용 시 필요경비 = 취득기준시가 × 1% (주식 그룹) |
| 시행규칙 §81 (위임체인) | 시행령 §163·§165 위임 — 평가 산식·평균 산정 방법 |

> ★ **Pre-Do 검증 의무 (위임 체인 끝까지)**: KoreanLaw MCP `chain_action_basis`로 모법 §97·§99 → 시행령 §163·§165 → 시행규칙 §81 위임 체인 전 단계 원문 확인. 가설과 원문이 다르면 plan 갱신 후 Do 진입 ([[feedback_korean_law_82_vs_81_2_drift]]).

## 3. 인터뷰 (사용자 응답 보류 — 권장안 채택, 변경 가능)

| # | 결정사항 | 권장안 | 대안 |
|---|---|---|---|
| Q1 | 신규 input 명명 | **`acquisitionDatePriceAvg1Month` (number, 원)** — 1주당 취득시 기준시가 (transferDatePriceAvg1Month와 짝) | `acquisitionStdPriceTotal` (총액, 원). 1주당이 §99①3 표현과 일치 |
| Q2 | UI 입력 위치 | **Step 2 환산취득가 카드 — 양도시 기준시가 아래에 동일 패턴** | 별도 신규 카드 |
| Q3 | 환산 산식 정수 처리 | **`floor((transferPrice × acqStd) / transStd)`** — `safeMultiply` BigInt fallback 활용 | 1주당 단위로 먼저 환산 후 × shareCount (반올림 누적 위험) |
| Q4 | 개산공제 자동 적용 + §97② swap | **§97② 단서 swap이 주식에 적용된다면 — 환산+개산공제 vs 자본적지출+양도비 max 적용** (부동산 양도세 패턴 [[feedback_estimated_mode_expenses_pattern]] 차용). KoreanLaw 검증 후 확정. 미적용 시 → 환산 모드 무조건 개산공제만 적용 | 단순 무조건 개산공제만 (법령 swap 미고려) |
| Q5 | 회귀 보호 | **기존 cases 3·4 anchor를 새 산식에 맞춰 갱신** + 신규 LE-1~6 anchor | 기존 anchor 유지 시 회귀 발생 — 불가피한 정정 |

## 4. 설계

### 4.1 데이터 모델

#### 4.1.1 신규 Input 필드 — `types/stock-transfer.types.ts`

```ts
// 환산 모드 — 상장 (1개월 종가평균)
transferDatePriceAvg1Month?: number;   // 기존 — 양도일 직전 1개월 종가평균 (1주당, 원)
/**
 * 취득시 1주당 기준시가 (소득세법 §99①3·§163⑨).
 *
 * 상장주식(KOSPI/KOSDAQ/KONEX)의 환산취득가 모드에서 사용.
 * = 취득일 직전 1개월 종가평균 (1주당, 원)
 *
 * 환산취득가 산식:
 *   1주당 환산취득가 = 1주당 양도가 × (acquisitionDatePriceAvg1Month / transferDatePriceAvg1Month)
 *   총액 환산취득가 = 양도가액 × (acquisitionDatePriceAvg1Month / transferDatePriceAvg1Month)
 *
 * 개산공제 §163⑥4: estimatedBase = acquisitionDatePriceAvg1Month × shareCount
 */
acquisitionDatePriceAvg1Month?: number;
```

#### 4.1.2 FormData — `lib/stores/calc-wizard-stock-store.ts`

```ts
acquisitionDatePriceAvg1Month: string;  // 3중 패턴 default: ""
```

### 4.2 엔진 로직 변경

#### 4.2.1 `stock-valuation-listed.ts` — 산식 정정

> **필드명 충돌 주의**: 비상장 보충 평가(`stock-valuation-unlisted.ts`)의 `UnlistedValuationResult`에 이미 `acquisitionStdPriceTotal` 필드가 있음. 두 타입은 별도이므로 같은 이름 사용 가능하나, 호출자가 분기 추론 시 혼동 가능 — listed 결과에서는 `listedAcqStdPriceTotal` 또는 `stdPriceTotalForEstimatedDeduction`으로 별도 명명 권장.

```ts
export interface ListedValuationResult {
  perShareTransferStdPrice: number;             // 양도시 1주당 기준시가
  perShareAcquisitionStdPrice: number;          // 취득시 1주당 기준시가 (신규)
  conversionRatio: number;                      // acq / transfer (소수, 표시 전용)
  perShareAcquisitionPrice: number;             // 환산 후 1주당 취득가 (floor 적용)
  totalAcquisitionPrice: number;                // 총액 환산취득가 (floor 적용)
  stdPriceTotalForEstimatedDeduction: number;   // 개산공제 base = 취득시 기준시가 × shareCount (§163⑥4)
  method: "monthly_avg_listed";
  appliedRule: string;
  tradingHaltFallback: boolean;
}

export function calcListedValuation(
  input: StockTransferInput,
  transferPrice: number,  // ★ 신규 인자 — 양도가액 총액 (1주당 × shareCount 또는 total 직접입력)
): ListedValuationResult {
  // ... tradingHalt fallback 유지 ...

  const transferStd = input.transferDatePriceAvg1Month ?? 0;
  const acqStd = input.acquisitionDatePriceAvg1Month ?? 0;

  if (transferStd <= 0 || acqStd <= 0) {
    // validate에서 차단해야 함 — 방어 처리
    return { /* 0 값 */ };
  }

  // 환산취득가 — 총액 단위 산식 (floor 누적 차단)
  // safeMultiply는 양도가 5조+ 등 BigInt 안전망 — 일반 범위에서는 일반 곱셈과 동일
  const totalAcquisitionPrice = Math.floor(
    safeMultiply(transferPrice, acqStd) / transferStd
  );
  // 1주당은 표시 전용 (총액 ÷ 주식수). 산식 entry는 항상 총액 단위로 floor 1회.
  const perShareAcquisitionPrice = Math.floor(totalAcquisitionPrice / input.shareCount);
  const conversionRatio = acqStd / transferStd;

  return {
    perShareTransferStdPrice: Math.floor(transferStd),
    perShareAcquisitionStdPrice: Math.floor(acqStd),
    conversionRatio,
    perShareAcquisitionPrice,
    totalAcquisitionPrice,
    // §163⑥4 base — 총액 단위 (1주당 × shareCount 누적 floor 회피)
    stdPriceTotalForEstimatedDeduction: Math.floor(acqStd) * input.shareCount,
    method: "monthly_avg_listed",
    appliedRule: STOCK.SECTION_99_1_3_LISTED_AVG,
    tradingHaltFallback: false,
  };
}

// ★ Import 추가: safeMultiply from "@/lib/tax-engine/tax-utils"
```

#### 4.2.2 `stock-transfer-tax.ts` — 호출자 갱신 (★ 호출처 전수 갱신)

**`calcListedValuation` 호출처 (grep)**: 2건
1. `stock-transfer-tax.ts:280` — 메인 경로
2. `exempt-informational-acquisition.ts:135` — 비과세 분기 정보용 echo

둘 다 시그니처 변경(`transferPrice` 인자 추가) + 결과 필드(`totalAcquisitionPrice`/`stdPriceTotalForEstimatedDeduction`/`perShareAcquisitionPrice`) 사용으로 갱신 필요.

```ts
} else {
  // 상장 — 1개월 종가평균 (§99①3 + §163⑨ 환산)
  const listedResult = calcListedValuation(input, transferPrice);
  acquisitionPrice = listedResult.totalAcquisitionPrice;
  // 개산공제 base = 취득기준시가 총액 (§163⑥4 — 양도기준시가 아님)
  estimatedBase = listedResult.stdPriceTotalForEstimatedDeduction;
  valuationDetail = {
    method: "monthly_avg_listed",
    netAssetFloorApplied: false,
    finalPerShareValue: listedResult.perShareAcquisitionPrice, // ★ 환산 후 1주당
  };
}
```

`exempt-informational-acquisition.ts`도 동일 패턴 갱신.

#### 4.2.3 개산공제 자동 적용 (Bug-B 두 번째 측면) + §97② 단서 swap

**§97² 단서가 주식에 적용된다면** (KoreanLaw 검증 후 확정):

> **주식 vs 부동산 input 차이**: 부동산 양도세 input은 `capitalExpenditure` + `transferExpense` 분리. **주식 input은 `actualExpenses` 단일 필드만 존재**(자본적지출 개념 거의 없음 — 양도비·증권거래세 위주). swap 비교 시 `actualExpenses`를 directSide로 사용.

```ts
// STEP 4: 필요경비 — 환산 모드는 §97² 단서 swap 적용 (부동산 양도세 패턴 차용)
if (usedEstimatedAcquisition && estimatedDeduction !== undefined) {
  const estimatedSide = estimatedDeduction;            // §163⑥4 개산공제
  const directSide = input.actualExpenses ?? 0;        // 실비 (양도비·증권거래세 등 합계)
  // 직접 실비가 크면 swap (납세자 유리)
  if (directSide > estimatedSide) {
    expenses = directSide;
    appliedRules.push("§97②단서swap");
  } else {
    expenses = estimatedSide;
  }
} else if (expenseMode === "actual") {
  expenses = input.actualExpenses ?? 0;
} else {
  expenses = estimatedDeduction ?? 0;
}
```

**§97② 단서가 주식에 미적용이면** (KoreanLaw 검증 결과 부정 시):

```ts
if (usedEstimatedAcquisition && estimatedDeduction !== undefined) {
  expenses = estimatedDeduction;  // 환산 모드 무조건 개산공제만
  if (input.expenseMode === "actual" && (input.actualExpenses ?? 0) > 0) {
    warnings.push("환산취득가 모드에서는 실비 대신 §163⑥4 개산공제만 적용됩니다.");
  }
}
```

> **결정 기준**: 사용자 정책 ([[feedback_estimated_mode_expenses_pattern]])과 KoreanLaw §97② 원문 둘 다 확인 후 분기 확정. 미확정 상태로 Do 진입 금지.

### 4.3 API/Route/Zod (14 동기화 지점)

- ⑫ Zod schema — `acquisitionDatePriceAvg1Month: z.number().nonnegative().optional()`
- ⑬ `callStockTransferTaxAPI` body — `body.acquisitionDatePriceAvg1Month = parseIntOrUndef(form.acquisitionDatePriceAvg1Month)`
- ⑭ route.ts — 단건 + buildEngineInput 두 곳 매핑

### 4.4 UI 변경

`components/calc/stock-transfer/EstimatedListedBlock.tsx`(또는 동등 위치 — Step 2 환산 카드)에:

```tsx
{marketType ∈ {kospi,kosdaq,konex} && !tradingHaltAtTransfer && !acquiredBeforeListing && (
  <>
    <CurrencyInput
      label="양도시 1주당 기준시가 (양도일 직전 1개월 종가평균)"
      hint="소득세법 §99①3 · §165⑤"
      value={form.transferDatePriceAvg1Month}
      onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
      required
    />
    <CurrencyInput
      label="취득시 1주당 기준시가 (취득일 직전 1개월 종가평균)"
      hint="환산 산식 = 양도가 × (취득시 기준시가 / 양도시 기준시가)"
      value={form.acquisitionDatePriceAvg1Month}
      onChange={(v) => onChange({ acquisitionDatePriceAvg1Month: v })}
      required
    />
    <PreviewCard>
      <p>[1] 환산비율 = 취득시 기준시가 ÷ 양도시 기준시가</p>
      <p>     = {acqStd.toLocaleString()} ÷ {transStd.toLocaleString()} = <b>{ratio.toFixed(5)}</b></p>
      <p>[2] 총액 환산취득가 = 양도가 × 환산비율 (총액 단위 floor)</p>
      <p>     = {transferPrice.toLocaleString()} × {ratio.toFixed(5)} = <b>{totalAcq.toLocaleString()}</b></p>
      <p>[3] 1주당 환산취득가 = 총액 ÷ 주식수 = <b>{perShareAcq.toLocaleString()}</b></p>
      <p>[4] 개산공제 (§163⑥4) = 취득기준시가 총액 × 1%</p>
      <p>     = ({acqStd.toLocaleString()} × {shareCount.toLocaleString()}) × 0.01 = <b>{estimatedDeduction.toLocaleString()}</b></p>
      {/* §97② 단서 swap 활성 시 별도 행 추가 */}
    </PreviewCard>
  </>
)}
```

### 4.5 결과 카드 / 신고서 / PDF

- **신규 컴포넌트** `components/calc/results/ListedConversionDetailCard.tsx` — `PostListingDetailCard` 패턴 차용. 노출 조건: `result.acquisitionMode === "estimated"` && `result.valuationDetail?.method === "monthly_avg_listed"` && `!result.acquiredBeforeListing`. 4단계 산식 펼침:
  ```
  [1] 환산비율 = 취득시 기준시가 / 양도시 기준시가
  [2] 총액 환산취득가 = 양도가 × 환산비율 (floor)
  [3] 1주당 환산취득가 = 총액 ÷ 주식수
  [4] 개산공제 (§163⑥4) = 취득기준시가 총액 × 1%
  [5] (§97² swap 활성 시) 실비 vs 개산공제 max
  ```
- `StockTransferTaxResultView` — 환산 모드 비과세 분기에도 위 카드 렌더 (PR `9988c32`와 동일 패턴).
- `StockFilingFormTable` — 12행 "환산 base"·17행 "개산공제"에 신규 값 노출. `valuationDetail.method === "monthly_avg_listed"` 분기 산식 갱신.
- **PDF 영향 점검 의무**: `lib/pdf/HistoryPdfDocument.tsx` 의 `valuationDetail.method` 분기 + 환산 산식 표시 위치 grep. 신규 필드 사용처 미갱신 시 PDF에 잘못된 값 노출.

### 4.6 Validation

`lib/calc/stock-transfer-tax-validate.ts`:

```ts
if (acquisitionMode === "estimated" && isListed && !acquiredBeforeListing && !tradingHaltAtTransfer) {
  if (isEmpty(form.transferDatePriceAvg1Month)) {
    errors.push({ field: "transferDatePriceAvg1Month",
      message: "양도일 직전 1개월 종가평균을 입력하세요 (§99①3)", severity: "error" });
  }
  if (isEmpty(form.acquisitionDatePriceAvg1Month)) {
    errors.push({ field: "acquisitionDatePriceAvg1Month",
      message: "취득일 직전 1개월 종가평균을 입력하세요 (환산 산식 분자)", severity: "error" });
  }
}
```

## 5. 케이스 매트릭스 (anchor)

기본 입력: 양도가 50,000원/주 × 1,000주 = 50,000,000원

| ID | 양도시 기준 | 취득시 기준 | 환산비율 | 1주당 환산취득가 | 총 취득가 | 개산공제 | 비고 |
|---|---|---|---|---|---|---|---|
| **LE-1** ★ Pre-Do | 50,000 | 30,000 | 0.6 | 30,000 | 30,000,000 | 300,000 | 산출세액 3,440,000 직접 검증 |
| **LE-2** | 40,000 | 20,000 | 0.5 | 25,000 | 25,000,000 | 200,000 | 비율 0.5 |
| **LE-3** | 50,000 | 50,000 | 1.0 | 50,000 | 50,000,000 | 500,000 | 환산비율 1.0 → 양도차익 = 50M−50M−500K = **-500,000** → transferIncome max(0,−500K) = **0**, calculatedTax = 0. 음수 처리 검증 anchor |
| **LE-4** | 60,000 | 45,000 | 0.75 | 37,500 | 37,500,000 | 450,000 | 소수점 비율 + floor 누적 차단 검증 |
| **LE-5** | 0 | 30,000 | — | 0 | 0 | 0 | validate 차단 (transferStd=0) |
| **LE-6** | 50,000 | 0 | — | 0 | 0 | 0 | validate 차단 (acqStd=0) |
| **LE-7** | §97² swap — 양도시 50K·취득시 30K·`actualExpenses=1M` | — | 0.6 | — | 30M | swap → expenses=1M | swap 분기 활성 anchor (KoreanLaw §97² 적용 시) |
| **LE-8** | 비과세 분기 + 환산 (장내) | 30,000 | 0.6 | 30,000 | 30,000,000 | 300,000 | finalTax=0, calculatedTax=3,440,000 정보용 echo |

**LE-1 anchor 계산 (Pre-Do 우선)**:
- 양도가 50,000,000 × (30,000 / 50,000) = 30,000,000
- 양도차익 = 50,000,000 − 30,000,000 − 300,000 = 19,700,000
- 기본공제 250만 → 과세표준 17,200,000
- × 비중소 20% = 산출세액 3,440,000 (vs 현재 버그값 3,500,000)

## 6. 작업 단계

1. **Pre-Do A (법령)**: KoreanLaw MCP로 §97①1호 다목·§97② 단서·§163⑨·§163⑥4·§99①3 원문 검증. §165⑤는 본 PR 범위 외 — 인용 제거 확정.
2. **Pre-Do B (회귀 영향)**: `grep -rn "acquisitionMode.*estimated\|monthly_avg_listed\|calcListedValuation" __tests__/` 로 영향 anchor 전수 조사. 갱신 대상 list 미리 작성.
3. **Pre-Do C (anchor)**: LE-1 산출세액 anchor 우선 작성·실행 → 디자인 환류 ([[feedback_pre_anchor_verification]]).
4. **타입·스토어·마이그레이션** — `acquisitionDatePriceAvg1Month` 추가 (14지점 ①②③).
5. **엔진** — `calcListedValuation` 시그니처 + `ListedValuationResult` 인터페이스 확장 (필드명 `stdPriceTotalForEstimatedDeduction` 사용, `acquisitionStdPriceTotal` 명칭 충돌 회피) + 호출처 2곳(`stock-transfer-tax.ts:280`, `exempt-informational-acquisition.ts:135`) 동기 갱신 + 개산공제 자동 적용 (Bug-B) + §97② swap 분기(검증 후 확정).
6. **Validation** — 신규 필드 필수 검증 (Pre-Do A 분기에 맞춰).
7. **API/Zod/Route** — ⑫⑬⑭ (단건 + buildEngineInput 두 곳).
8. **UI** — Step 2 환산 카드에 신규 입력 필드 + 4단계 미리보기 카드 + §97② swap UX (해당 시).
9. **anchor 8건 + 회귀** — `__tests__/tax-engine/stock-transfer/listed-estimated-conversion.test.ts`.
10. **기존 anchor 정정** — Pre-Do B 결과 list 기반. case-3-8-listed.test.ts 환산 케이스 + OM-* 비과세 echo 등 신규 산식 반영.
11. **브라우저 수동 확인** — 환산 모드 입력 → 결과 카드 산식 정확성 + 미리보기 4단계.

## 7. 리스크

- **R-1 기존 anchor 다수 정정**: 양도시 기준시가만 입력하던 기존 시나리오에서 신규 필드 미설정 시 환산비율 정의 불가 → validate 차단 또는 기본값 0. **회귀 발생 불가피** — 기존 anchor 입력값을 신규 필드 포함으로 재구성 필요. Pre-Do B에서 영향 범위 측정 후 list 확정.
- **R-2 Zod backward compat**: `acquisitionDatePriceAvg1Month`를 optional로 두면 기존 클라이언트 호출은 통과하지만 환산 모드일 때 0이 되어 잘못된 값 산출. validate에서 명시 차단으로 보완.
- **R-3 BigInt 필요성**: 양도가 50억 × 취득기준시가 50,000 = 2.5조 → JS Number 안전 범위(2^53 ≈ 9000조). BigInt 불필요. 단 양도가 5조+ 케이스만 `safeMultiply`로 보호.
- **R-4 비상장·취득 후 상장 분기 영향 없음**: 변경은 listed estimated(상장 1개월 종가평균) 경로만 — 비상장 보충 평가·취득 후 상장 §165⑤·거래정지 §165③ 분기 회귀 0 (Pre-Do B에서 verify).
- **R-5 PDF anchor**: 사용자가 PDF 사례 제공 시 LE-9~ anchor 추가 ([[feedback_pdf_table_row_one_to_one_mapping]] + [[feedback_pdf_example_test_anchoring]] 패턴 — 행번호↔변수명 1:1 매핑 강제).
- **R-6 §163⑥4 1주당 vs 총액 floor**: 1주당으로 먼저 floor 적용 후 × shareCount 시 누적 오차. **총액 단위로 floor 1회**가 표준 ([[feedback_floor_residual_absorption]] 정신). 본 plan은 총액 단위 보장.
- **R-7 §97② 단서 swap 분기 결정 보류**: KoreanLaw 검증 결과에 따라 분기 코드가 달라짐 — Do 진입 전 확정 필수. 미확정 상태로 시작 시 후속 재작업 비용.
- **R-8 valuationDetail.finalPerShareValue 의미 변경**: 기존 = 양도시 기준시가 (잘못된 값). 신규 = 환산 후 1주당 취득가. 결과 카드·신고서·PDF 표시 위치 모두 확인 필요 — grep `finalPerShareValue` 전수 점검.
- **R-9 명명 혼동 — 3종 기준시가 필드**: `transferDatePriceAvg1Month`(양도일 직전 1개월) / `acquisitionDatePriceAvg1Month`(신규, 취득일 직전 1개월) / `listingDatePriceAvg1Month`(상장일 이후 1개월, §165⑤). 사용자 혼동 위험 ↑ — UI 라벨·hint에 차이 명시 + 미리보기에서 어떤 필드가 적용되는지 강조.
- **R-10 LE-3 음수 처리**: 환산비율 1.0 케이스에서 양도차익이 음수(개산공제로 인해). 엔진의 음수 transferIncome → max(0, x) 처리가 STEP 5에서 정상 작동하는지 anchor로 명시 검증. 음수 누적 시 결과 카드에 "-500,000" 잘못 표시 가능성 차단.
- **R-11 ListedConversionDetailCard 신규 컴포넌트**: PostListingDetailCard와 노출 조건 상호배타(`acquiredBeforeListing` true/false). 둘 다 비과세 분기에서 렌더 — `StockTransferTaxResultView.tsx` 비과세 + 과세 두 경로 모두에 카드 위치 매핑 필요.
- **R-12 §97② swap 적용 시 사이드바·결과 카드 추가**: swap 활성 시 "실비 vs 개산공제 비교" 카드 + applied rule "§97②단서swap" 배지. UI 미수정 시 사용자는 산식 추적 불가.

## 8. Definition of Done

- [ ] **Pre-Do A**: KoreanLaw MCP §97①1다·§97②·§163⑨·§163⑥4·§99①3 원문 검증 (§165⑤ 미포함 확정)
- [ ] **Pre-Do B**: 영향 anchor 전수 grep 결과 list 첨부
- [ ] **Pre-Do C**: LE-1 산출세액 anchor 우선 작성·실행 (디자인 환류)
- [ ] **§97② swap 분기 결정 확정** (적용 여부 + 적용 시 코드 분기)
- [ ] `acquisitionDatePriceAvg1Month` 추가 (Input + FormData + initial + normalize)
- [ ] `calcListedValuation` 시그니처 변경 (transferPrice 인자 추가) + `ListedValuationResult` 확장 (`stdPriceTotalForEstimatedDeduction` — `acquisitionStdPriceTotal` 명칭 충돌 회피)
- [ ] 호출처 2곳 갱신: `stock-transfer-tax.ts:280` + `exempt-informational-acquisition.ts:135`
- [ ] 개산공제 자동 적용 + §97② swap 분기(확정 시)
- [ ] Validation ⑧ — 양 기준시가 모두 필수 (listed estimated 분기)
- [ ] API/Zod/Route ⑫⑬⑭ — 단건 + buildEngineInput 두 곳
- [ ] UI 입력 필드 2개 + **4단계 미리보기 카드** (환산비율·총액 환산·1주당·개산공제, §97② swap 행 조건부)
- [ ] anchor LE-1~8 8건 + 기존 anchor 정정 (Pre-Do B list 반영)
- [ ] LE-3 음수 transferIncome 처리 anchor (max(0, x) 정상 작동 검증)
- [ ] LE-7 §97² swap anchor (검증 결과에 따라 활성/비활성)
- [ ] `valuationDetail.finalPerShareValue` grep 전수 점검 (의미 변경)
- [ ] `ListedConversionDetailCard` 신규 컴포넌트 + 비과세·과세 두 경로 매핑
- [ ] PDF 출력 영향 점검 — `lib/pdf/HistoryPdfDocument.tsx` 의 `valuationDetail.method` 분기 grep
- [ ] UI 라벨에 3종 기준시가 차이 명시 (transfer/acquisition/listing — R-9 명명 혼동)
- [ ] 전체 회귀 통과 (`npx vitest run` 0건 회귀)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] 브라우저 수동 확인 (LE-1 골든 패스 + LE-3 음수·LE-7 swap·비과세 echo)
- [ ] memory 업데이트 — `project_stock_transfer_listed_estimated_fix.md` + feedback (환산 산식 §163⑨ 직접 적용 정책)

## 9. 후속 PR 후보

- 사용자가 PDF 사례 제공 시 LE-9~ anchor 추가 ([[feedback_pdf_table_row_one_to_one_mapping]])
- 비상장 보충 평가의 estimatedBase 정합성 재검토 (이미 정상이지만 cross-cutting anchor 추가)
- §165⑤ 본문(취득 후 상장) 분기와의 cross-cutting anchor — 취득시 기준시가가 두 경로 모두에서 사용되는 일관성
- 환산 모드 입력 시 expenseMode=actual 자동 disabled UX
