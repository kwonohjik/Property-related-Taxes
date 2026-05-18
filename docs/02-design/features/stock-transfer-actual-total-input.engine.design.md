# 주식 양도소득세 — 양도가액 합계 직접 입력 모드 엔진 디자인

> 작성일: 2026-05-18  
> 기반 계획서: `docs/00-pm/stock-transfer-actual-total-input.plan.md` v2  
> 영향 범위: 엔진 타입·분기 2곳 / Zod 스키마 / Route 2곳 / API 변환 / validate / store / 결과 뷰 산식

---

## 1. 법령 근거

### 1.1 소득세법 §96 — 양도가액: 실지거래가액 원칙

```
§96①  양도차익을 계산할 때 양도가액은 그 자산의 양도 당시의 양도자와 양수자 간에
      실지거래가액에 의한다.
```

**1주당 단가 × 주식수 = 총액 직접 입력** — 두 방식은 모두 §96①이 규정하는 "실지거래가액"의 다른 표현 방식에 불과합니다.

- **현행** (`perShareTransferPrice × shareCount`): 단가와 수량을 각각 입력하고 엔진이 곱셈으로 총액 산출
- **신규** (`transferTotalPrice` 직접 입력): 계약서·등기부 등에 총액으로 명시된 경우 역산 오차 없이 그대로 입력

두 경우 모두 §96①의 실지거래가액이므로 세율·공제 적용 단계에 차이가 없습니다. 신규 필드가 도입되더라도 `StockTransferResult.transferPrice`는 단일 최종 금액만 반환하고, 후속 파이프라인(개산공제·swap 비교·세율 적용)은 변경 없습니다.

### 1.2 적용 범위

- 단건 모드(`lotsMode === "single"`) + 실가 모드(`transferPriceMode === "actual"`)에 한정
- 분할 모드(`lotsMode === "split"`)에서는 lot별 단가 매칭 의미 충돌 → 차단
- 교환 모드(`transferPriceMode === "exchange"`)와 직교 → 무관

---

## 2. 입력·결과 타입 변경

### 2.1 엔진 Input 타입 diff

**파일**: `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`

현행 (L69~L74):
```ts
  // 양도가액 모드
  transferPriceMode: "actual" | "exchange";
  perShareTransferPrice?: number;
  exchangePropertyValue?: number;
  exchangeDebtRelief?: number;
  exchangeCash?: number;
```

변경 후:
```ts
  // 양도가액 모드
  transferPriceMode: "actual" | "exchange";
  /**
   * 실가 입력 방식 (transferPriceMode === "actual" 한정).
   * - "per_share" (default): 1주당 단가 × 주식수 (현행)
   * - "total": 양도가액 합계 직접 입력 (§96① 실지거래가액, 비상장 계약서 총액 케이스)
   */
  transferActualInputMode?: "per_share" | "total";
  /** 1주당 양도가액 (transferActualInputMode === "per_share" 또는 미지정 시 필수, 원) */
  perShareTransferPrice?: number;
  /**
   * 양도가액 합계 직접 입력 (transferActualInputMode === "total" 시 필수, 원).
   * 소수점 잔돈 없이 계약서 총액을 그대로 반영 가능.
   */
  transferTotalPrice?: number;
  exchangePropertyValue?: number;
  exchangeDebtRelief?: number;
  exchangeCash?: number;
```

추가 필드 수: 2개 (`transferActualInputMode`, `transferTotalPrice`)  
optional이므로 기존 호출자 전부 TypeScript 무오류 (회귀 0 보장).

### 2.2 결과 타입 — 변경 없음

`StockTransferResult.transferPrice`는 최종 합산금액만 보유. 입력 방식 에코는 결과 카드 산식 문구(`TransferPriceFormulaCard` 신규 컴포넌트 — UI 디자인 문서)에서 처리.

산식 표시를 위해 결과 뷰에 추가 prop 2개 전달 (§7 참조):
- `transferActualInputMode?: "per_share" | "total"`
- `perShareTransferPrice?: number` (역산 참고용)

이 두 값은 `StockTransferResult`가 아닌 `form` 에서 Step4가 직접 꺼내 prop으로 전달합니다 — `shareCount`와 동일한 패턴.

---

## 3. 케이스 인벤토리 표

Do 진입 전제 — 모든 분기 행이 enumerate되어야 합니다.

| ID | lotsMode | transferPriceMode | transferActualInputMode | perShareTransferPrice | transferTotalPrice | shareCount | 예상 transferPrice | 비고 |
|---|---|---|---|---|---|---|---|---|
| C-1 | single | actual | per_share (또는 undefined) | 50,000 | — | 5,000 | **250,000,000** | 현행 회귀 보호. default 동작 |
| C-2 | single | actual | total | — | 250,000,000 | 5,000 | **250,000,000** | 신규. 총액 정확히 입력 |
| C-3 | single | actual | total | — | 250,000,001 | 5,000 | **250,000,001** | 신규. 1원 잔돈 보존 (per_share와 1원 차이) |
| C-4 | single | exchange | N/A | — | — | 5,000 | `property+debt+cash` | 교환 분기 — 무관, 회귀 보호 |
| C-5 | split | actual | per_share | (lot별) | — | (lot 합계) | `lotMatchingDetail.totalTransferPrice` | 현행 회귀 보호 |
| C-6 | split | actual | total | — | (무시) | — | Zod/validate **차단** | 분할 모드 total 차단 검증 |
| C-7 | single | actual | undefined | 50,000 | — | 5,000 | **250,000,000** | default fallback "per_share" 동작 확인 |
| C-8 | single | actual | per_share | 0 | — | 5,000 | validate **오류** | perShareTransferPrice ≤ 0 차단 |
| C-9 | single | actual | total | — | 0 | 5,000 | Zod/validate **오류** | transferTotalPrice ≤ 0 차단 |
| C-10 | single | actual | total | — | 1,000,000,000 | 1 | **1,000,000,000** | 단주(1주) 총액 입력 |

---

## 4. 엔진 분기 코드

### 4.1 본문 분기 — `stock-transfer-tax.ts` L107~120

현행:
```ts
  if (lotMatchingDetail) {
    // split 모드 — lot 합계 사용
    transferPrice = lotMatchingDetail.totalTransferPrice;
  } else if (input.transferPriceMode === "actual") {
    transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;  // L112
  } else {
```

변경 후:
```ts
  if (lotMatchingDetail) {
    // split 모드 — lot 합계 사용 (transferActualInputMode 무관)
    transferPrice = lotMatchingDetail.totalTransferPrice;
  } else if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";   // default "per_share"
    if (actualMode === "total") {
      transferPrice = input.transferTotalPrice ?? 0;                   // 총액 직접 사용
    } else {
      transferPrice = (input.perShareTransferPrice ?? 0) * shareCount; // 기존 동작 보존
    }
  } else {
```

**삽입 위치**: L111 `} else if (input.transferPriceMode === "actual") {` 직후, L112 기존 단일 라인을 4줄로 교체.  
**줄 순증**: +4줄 (현행 1줄 → 5줄).

### 4.2 헬퍼 함수 분기 — `calcTransferPriceSimple()` L527~537

현행 (L527~536):
```ts
function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
    return (input.perShareTransferPrice ?? 0) * input.shareCount;  // L529
  }
  return (
    (input.exchangePropertyValue ?? 0) +
    (input.exchangeDebtRelief ?? 0) +
    (input.exchangeCash ?? 0)
  );
}
```

변경 후:
```ts
function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";
    if (actualMode === "total") return input.transferTotalPrice ?? 0;
    return (input.perShareTransferPrice ?? 0) * input.shareCount;
  }
  return (
    (input.exchangePropertyValue ?? 0) +
    (input.exchangeDebtRelief ?? 0) +
    (input.exchangeCash ?? 0)
  );
}
```

**삽입 위치**: L529 기존 return 라인을 3줄로 교체.  
**줄 순증**: +2줄.

### 4.3 800줄 정책 검토

현행 파일 줄수: **747줄**. 엔진 본문 순증 = +6줄 → **753줄**. 800줄 한도 내 (여유 47줄). helper 분리 불필요.

---

## 5. 결과 카드 산식 (CalculationStep — 지점 ⑦)

### 5.1 현황 파악

`StockTransferTaxResultView`는 현재 양도가액 산식을 별도 텍스트로 표시하지 않습니다. 결과 표의 `ResultRow label="양도가액" value={result.transferPrice}`만 있습니다.

총액 모드 추가 시 사용자가 "1주당 × 주식수 = 합계" 산식을 확인할 수 없으므로 `TransferPriceFormulaCard` 신규 컴포넌트를 추가해야 합니다.

### 5.2 산식 문구 분기

**per_share 모드** (기존 동작, 신규 컴포넌트로 이동):
```
양도가액 산식 (§96① 실지거래가액)
1주당 양도가액 50,000원 × 5,000주 = 250,000,000
```

**total 모드** (신규):
```
양도가액 산식 (§96① 실지거래가액)
양도가액 합계 직접 입력 = 250,000,001
참고: 역산 1주당 단가 = 250,000,001 ÷ 5,000주 = 50,000.0002 (표시 전용, 계산에 미사용)
```

역산 단가가 정수로 떨어지면 참고 줄 생략합니다.

### 5.3 컴포넌트 배치 위치

`StockTransferTaxResultView` 본문 내 기존 `EstimatedValuationBreakdown` 바로 위에 삽입:

```tsx
{/* 양도가액 산식 (per_share: 단가×수량 / total: 합계 직접) */}
<TransferPriceFormulaCard
  result={result}
  shareCount={shareCount}
  transferActualInputMode={transferActualInputMode}   // Step4 prop
  perShareTransferPrice={perShareTransferPrice}       // Step4 prop (역산 표시용)
/>

{/* 환산 취득가 분해 (사례 48) */}
{result.usedEstimatedAcquisition && result.valuationDetail && (
  <EstimatedValuationBreakdown result={result} shareCount={shareCount} />
)}
```

### 5.4 Step4 prop 전달 추가

`app/calc/stock-transfer-tax/steps/Step4.tsx` — `StockTransferTaxResultView` 호출부:

```tsx
// 기존
<StockTransferTaxResultView
  result={result}
  shareCount={shareCount}
  isFraudulent={form.isFraudulent}
  isInternationalTransaction={form.isInternationalTransaction}
/>

// 변경 후
<StockTransferTaxResultView
  result={result}
  shareCount={shareCount}
  isFraudulent={form.isFraudulent}
  isInternationalTransaction={form.isInternationalTransaction}
  transferActualInputMode={form.transferActualInputMode || "per_share"}
  perShareTransferPrice={parseAmount(form.perShareTransferPrice)}
/>
```

`parseAmount`는 Step4에서 이미 import되어 있거나 동일 방식으로 추가 합니다.

### 5.5 비과세 화면에서도 표시

비과세(`result.isExempt`) 분기에도 동일 `TransferPriceFormulaCard`를 렌더합니다. 위치: 비과세 안내 카드 아래.

---

## 6. swap 비교·환산 cross-cutting 검증

### 6.1 §97②2호 단서 swap 비교

`stock-transfer-tax.ts` L165:
```ts
transferPrice,  // ← 이미 최종값으로 확정된 뒤 전달
```

swap 비교 로직(`calcAcquisitionBySwap`)은 `transferPrice` final 값만 받아 취득가와 비교합니다. `transferActualInputMode`와 `transferTotalPrice`가 추가되어도 final `transferPrice` 산출 후 동일 파이프라인을 통과하므로 **영향 없음**.

### 6.2 개산공제 §163⑥4 (취득기준시가 × 1%)

개산공제는 `estimatedBase`(취득기준시가 총액)의 1%로, `transferPrice`와 무관합니다. **영향 없음**.

### 6.3 비상장 보충적 평가 (§165④)

`calcUnlistedValuation(input, transferPrice)` 호출 (L213, L236). final `transferPrice`만 전달. **영향 없음**.

### 6.4 결론

`transferPrice` final 값 도출 이후 모든 후속 계산은 입력 방식에 투명(transparent)합니다. 추가 cross-cutting 수정 불필요.

---

## 7. 14개 동기화 지점 상세

| # | 지점 | 파일 경로 | 현행 라인 | 변경 내용 |
|---|---|---|---|---|
| ① | FormData 타입 | `lib/stores/calc-wizard-stock-store.ts` | L113 `transferPriceMode` 직후 | `transferActualInputMode: "per_share" \| "total"` + `transferTotalPrice: string` 2줄 추가 |
| ② | INITIAL_FORM_DATA | `lib/stores/calc-wizard-stock-store.ts` | L210~211 | `transferActualInputMode: "per_share"`, `transferTotalPrice: ""` 추가 |
| ③ | normalize | `lib/stores/calc-wizard-stock-store.ts` | L319~320 | `enumField("transferActualInputMode", ["per_share", "total"], "per_share")` + `strField("transferTotalPrice")` 추가 |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` | L97~110 | §6.1 코드 (actualMode 분기, 한쪽 값만 body에 전송) |
| ⑤ | UI 위젯 | `app/calc/stock-transfer-tax/steps/Step2.tsx` | L91~111 (실가 분기 내부) | 서브 라디오 + CurrencyInput 2종 분기 (UI 디자인 문서) |
| ⑥ | 사이드바 합계 | `components/calc/stock-transfer/StockSidebar.tsx` | L47~60 (single 분기) | §8.1 코드로 교체 |
| ⑦ | 결과 카드 산식 | `components/calc/results/StockTransferTaxResultView.tsx` | `EstimatedValuationBreakdown` 위 | `TransferPriceFormulaCard` 신규 + Step4 prop 2개 추가 (§5.3~§5.4) |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate.ts` | L310~313 | §8.2 코드 (actual 분기 내부 actualMode 서브분기) |
| ⑨ | Zod enum 신규 | `lib/api/stock-transfer-tax-schema.ts` | L33 `transferPriceModeSchema` 직후 | `export const transferActualInputModeSchema = z.enum(["per_share", "total"])` |
| ⑩ | Zod enum 컴패니언 | (해당 없음 — 자산-수준 아님) | — | 불필요 |
| ⑪ | acquisitionDate fallback | (해당 없음) | — | 불필요 |
| ⑫ | Zod 입력 객체 정의 | `lib/api/stock-transfer-tax-schema.ts` | L129 `perShareTransferPrice` 직전 | `transferActualInputMode: transferActualInputModeSchema.optional()` + `transferTotalPrice: z.number().int().min(0).optional()` 2줄 + `addStockRefines` 2개 |
| ⑬ | API body spread | `lib/calc/stock-transfer-tax-api.ts` | L97~110 | `body.transferActualInputMode` + `body.transferTotalPrice` 명시 (§6.1) |
| ⑭ | Route handler 엔진 매핑 (**2곳**) | `app/api/calc/stock-transfer/route.ts` | L121~126 (단건) + L200~205 (`buildEngineInput`) | `transferActualInputMode` + `transferTotalPrice` 각 2곳 추가 |

**⑫⑬⑭ TypeScript 미감지 위험** — Do 단계에서 grep 자가 점검 강제:
```bash
grep -n "transferActualInputMode\|transferTotalPrice" \
  lib/api/stock-transfer-tax-schema.ts \
  lib/calc/stock-transfer-tax-api.ts \
  app/api/calc/stock-transfer/route.ts
```
⑭ route.ts는 단건 + `buildEngineInput` **2곳 모두** 확인.

---

## 8. 주요 변경 코드 상세

### 8.1 사이드바 단건 분기 교체 (`StockSidebar.tsx` L47~60)

현행:
```ts
} else {
  const perShare = parseAmount(formData.perShareTransferPrice);
  const count = parseInt(formData.shareCount || "0", 10);
  const transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
  const exchangeTotal = ...;
  effectiveTransferPrice =
    (formData.transferPriceMode || "actual") === "exchange"
      ? exchangeTotal > 0 ? exchangeTotal : null
      : transferPrice;
}
```

변경 후:
```ts
} else {
  // single 모드
  const priceMode = formData.transferPriceMode || "actual";
  let transferPrice: number | null = null;
  if (priceMode === "actual") {
    const actualMode = formData.transferActualInputMode || "per_share";
    if (actualMode === "total") {
      const total = parseAmount(formData.transferTotalPrice);
      transferPrice = total > 0 ? total : null;
    } else {
      const perShare = parseAmount(formData.perShareTransferPrice);
      const count = parseInt(formData.shareCount || "0", 10);
      transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
    }
  }
  const exchangeTotal =
    parseAmount(formData.exchangePropertyValue) +
    parseAmount(formData.exchangeDebtRelief) +
    parseAmount(formData.exchangeCash);
  effectiveTransferPrice =
    priceMode === "exchange"
      ? exchangeTotal > 0 ? exchangeTotal : null
      : transferPrice;
}
```

3중 패턴: `formData.transferActualInputMode || "per_share"` — store default / normalize default / UI display fallback 모두 동일.

### 8.2 validate 변경 (`stock-transfer-tax-validate.ts` L308~313)

현행:
```ts
if (transferPriceMode === "actual") {
  if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
    errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
  }
} else if (transferPriceMode === "exchange") {
```

변경 후:
```ts
if (transferPriceMode === "actual") {
  const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
  if (actualMode === "total") {
    if (isEmpty(form.transferTotalPrice) || parseI(form.transferTotalPrice) <= 0) {
      errors.push({ field: "transferTotalPrice", message: "양도가액 합계를 입력하세요", severity: "error" });
    }
  } else {
    if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
      errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
    }
  }
} else if (transferPriceMode === "exchange") {
```

**API/UI fallback 동기화**: `"per_share"` default가 API 변환(`stock-transfer-tax-api.ts` L97), validate(본 코드), 사이드바(`StockSidebar.tsx` L47) 3곳 모두 동일 — 3중 패턴 준수.

### 8.3 Zod `addStockRefines` 추가

`lib/api/stock-transfer-tax-schema.ts` — `addStockRefines` superRefine 내부:

**(a) 분할 모드 게이트 안** (기존 `transferPriceMode === "exchange"` 차단 직후):
```ts
// 분할 모드에서 total 모드 차단
if (data.transferActualInputMode === "total") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["transferActualInputMode"],
    message: "분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
  });
}
```

**(b) superRefine 본문 최상위** (분할 게이트 외부):
```ts
// total 모드 필수값 검증
if (
  data.transferPriceMode === "actual" &&
  (data.transferActualInputMode ?? "per_share") === "total" &&
  (!data.transferTotalPrice || data.transferTotalPrice <= 0)
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["transferTotalPrice"],
    message: "총액 직접 입력 시 양도가액 합계는 0보다 커야 합니다",
  });
}
```

### 8.4 API 변환 변경 (`stock-transfer-tax-api.ts` L97~110)

현행:
```ts
body.transferPriceMode = transferPriceMode;         // 3중 패턴 default: "actual"
if (transferPriceMode === "actual") {
  const perShare = parseIntOrUndef(form.perShareTransferPrice);
  if (perShare !== undefined) body.perShareTransferPrice = perShare;
} else {
  // 교환 (exchange) ...
}
```

변경 후:
```ts
body.transferPriceMode = transferPriceMode;         // 3중 패턴 default: "actual"
if (transferPriceMode === "actual") {
  const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
  body.transferActualInputMode = actualMode;
  if (actualMode === "total") {
    const total = parseIntOrUndef(form.transferTotalPrice);
    if (total !== undefined) body.transferTotalPrice = total;
  } else {
    const perShare = parseIntOrUndef(form.perShareTransferPrice);
    if (perShare !== undefined) body.perShareTransferPrice = perShare;
  }
} else {
  // 교환 (exchange) — 무변경 ...
}
```

→ 활성 모드 값만 body에 포함 — cross-mode silent overwrite 방지.

### 8.5 Route handler 매핑 (`app/api/calc/stock-transfer/route.ts`)

**(a) 단건 L121~126**:
```ts
transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
transferActualInputMode: coerced.transferActualInputMode as StockTransferInput["transferActualInputMode"],  // 신규
perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
transferTotalPrice: coerced.transferTotalPrice as number | undefined,                                     // 신규
exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
exchangeDebtRelief: coerced.exchangeDebtRelief as number | undefined,
exchangeCash: coerced.exchangeCash as number | undefined,
```

**(b) `buildEngineInput()` L200~205** — 동일 패턴 적용 (누락 시 다자산 경로 silent stripping):
```ts
transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
transferActualInputMode: coerced.transferActualInputMode as StockTransferInput["transferActualInputMode"],  // 신규
perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
transferTotalPrice: coerced.transferTotalPrice as number | undefined,                                     // 신규
exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
...
```

---

## 9. 부담부증여 Phase 3 / 다자산 합산 / 비상장 보충적 평가 cross-check

### 9.1 부담부증여 Phase 3

부담부증여는 양도 사건으로 처리되며 (`transferType === "burdened_gift"`), 증여세 통합 계산 시 `result.transferPrice`를 기준으로 채무분 안분이 이루어집니다. `transferPrice` final 값만 사용하므로 입력 방식 변경에 **투명**.

### 9.2 다자산 합산 (`calculateStockTransferAggregate`)

`buildEngineInput()` 함수가 ⑭ 두 번째 매핑 지점 — **이곳 누락이 silent stripping의 원인**. 본 디자인에서 명시적으로 식별·처리.

### 9.3 비상장 보충적 평가 (§165④ 가중평균)

`calcUnlistedValuation(input, transferPrice)` 내부에서 `input.shareCount`와 함께 `transferPrice`를 받습니다. 입력 방식이 달라도 final `transferPrice`가 동일하면 평가 결과도 동일. **영향 없음**.

---

## 10. Pre-Do anchor 5건 (v2 정정)

계획서 §9.2 기반. 각 anchor는 Do 진입 전 실패 메시지를 확인하고 엔진 분기 정합성을 검증합니다.

⚠️ v1 오류 정정 — 실제 `StockTransferInput` 필드명 적용:
- `shareRatio` → `selfShareRatio`, `marketCapAtPriorYearEnd` → `selfMarketCap`
- 필수 필드 누락분 추가: `isLargestShareholderGroup`, `combinedShareRatio`, `combinedMarketCap`, `bookLost`, `expenseMode`, `filingType`, `filingDate`, `realEstateGroupBasicDeductionUsed`
- T-TOTAL-4: `validateStockTransferForm` 미존재 → 실제 `validateStep2(form)` 사용. form은 string 필드(`transferTotalPrice: "250000000"`)

### 공통 base (모든 anchor 공유)

```ts
const baseInput: Omit<StockTransferInput, "transferActualInputMode" | "transferTotalPrice" | "perShareTransferPrice" | "transferPriceMode" | "exchangePropertyValue" | "exchangeDebtRelief" | "exchangeCash"> = {
  marketType: "unlisted",
  isMajorShareholder: true,
  selfShareRatio: 0.6,
  selfMarketCap: 2_000_000_000,
  isLargestShareholderGroup: false,
  combinedShareRatio: 0,
  combinedMarketCap: 0,
  priorYearEndDate: new Date("2023-12-31"),
  isSmallMediumEnterprise: true,
  isMidsizeEnterprise: false,
  isVentureCompany: false,
  isKOTCTrading: false,
  isListedSmallShareholder: false,
  isQualifyingBlockShareholder: false,
  isHeavyRealEstateForRate: false,
  isHeavyRealEstateForValuation: false,
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2023-06-30"),
  shareCount: 5_000,
  totalIssuedShares: 10_000,
  acquisitionCause: "purchase",
  acquisitionMode: "actual",
  perShareAcquisitionPrice: 30_000,
  acquiredBeforeListing: false,
  tradingHaltAtTransfer: false,
  bookLost: false,
  expenseMode: "estimated",
  filingType: "preliminary",
  filingDate: new Date("2023-08-31"),
  isElectronicFiling: false,
  isFraudulent: false,
  isInternationalTransaction: false,
  realEstateGroupBasicDeductionUsed: 0,
};
```

### T-TOTAL-1 — 단순 total 모드 기본 동작

**케이스 인벤토리 C-2에 대응**

```ts
// 파일: __tests__/tax-engine/stock-transfer/actual-total-input.test.ts
it("T-TOTAL-1: total 모드에서 transferTotalPrice가 transferPrice로 직접 반영된다", () => {
  const result = calculateStockTransferTax({
    ...baseInput,
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: 250_000_000,
  });
  expect(result.transferPrice).toBe(250_000_000);
});
```

### T-TOTAL-2 — per_share와 total 결과 동치성 (세액 일치)

**케이스 인벤토리 C-1 vs C-2**

```ts
it("T-TOTAL-2: per_share 모드와 total 모드가 같은 합계일 때 산출세액이 동일하다", () => {
  const perShareResult = calculateStockTransferTax({
    ...baseInput,
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,  // 50,000 × 5,000 = 250,000,000
  });
  const totalResult = calculateStockTransferTax({
    ...baseInput,
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: 250_000_000,
  });
  expect(totalResult.transferPrice).toBe(perShareResult.transferPrice);
  expect(totalResult.calculatedTax).toBe(perShareResult.calculatedTax);
});
```

### T-TOTAL-3 — 1원 잔돈 보존 (소수점 역산 케이스)

**케이스 인벤토리 C-3에 대응**

```ts
it("T-TOTAL-3: 총액 250,000,001원이 잔돈 없이 그대로 transferPrice가 된다", () => {
  const result = calculateStockTransferTax({
    ...baseInput,
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: 250_000_001,
  });
  expect(result.transferPrice).toBe(250_000_001);  // per_share 250M과 정확히 1원 차이
});
```

### T-TOTAL-4 — 분할 모드 + total 조합 validate 차단

**케이스 인벤토리 C-6에 대응**

```ts
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";

it("T-TOTAL-4: split 모드에서는 Zod refine에서 total 옵션이 차단된다 (UI 1차 + Zod 2차 방어선)", () => {
  // validate 레벨에서는 split 분기가 lot 단위 검증으로 일찍 return되어 transferActualInputMode를 검사 안 함.
  // 따라서 Zod refine(addStockRefines)에서 차단됨을 확인.
  const inputSchema = addStockRefines(stockTransferInputSchema);
  const parsed = inputSchema.safeParse({
    ...minimalSplitInput,  // lotsMode 가정 입력 (acquisitionLots/transferLots 1행 이상)
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: 250_000_000,
  });
  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues.some(i => i.path.includes("transferActualInputMode"))).toBe(true);
  }
});
```

⚠️ v1 정정: `validateStockTransferForm` 미존재. 실제는 `validateStep1`/`validateStep2`로 분리되어 있고, split 모드는 `validateStep2` L290~307에서 lot 검증 후 early return하여 `transferActualInputMode` 자체를 검사하지 않음. 따라서 본 케이스는 **Zod refine**이 차단 책임.

### T-TOTAL-5 — exchange 모드에서 actualInputMode 무관

**케이스 인벤토리 C-4에 대응**

```ts
it("T-TOTAL-5: exchange 모드에서 transferActualInputMode 값은 transferPrice에 영향을 주지 않는다", () => {
  const result = calculateStockTransferTax({
    ...baseInput,
    transferPriceMode: "exchange",
    exchangePropertyValue: 80_000_000,
    exchangeDebtRelief: 15_000_000,
    exchangeCash: 5_000_000,
    transferActualInputMode: "total",  // exchange 모드에서는 무관
    transferTotalPrice: 999_999_999,   // 무시되어야 함
  });
  expect(result.transferPrice).toBe(100_000_000); // 80M + 15M + 5M
});
```

---

## 11. 위험·회피

| # | 위험 | 영향 | 회피 방법 |
|---|---|---|---|
| R-1 | per_share → total 토글 전환 시 `perShareTransferPrice` stale 값 잔존 | UX 혼란 (계산에는 무시됨) | total 모드 진입 시 `perShareTransferPrice` 필드 숨김 (데이터 보존 — 재토글 시 복원) |
| R-2 | sessionStorage legacy 폼 마이그레이션 누락 → `transferActualInputMode` undefined | normalize default "per_share" 적용으로 자동 복구 → 회귀 0 | normalize `enumField` 강제 확인 |
| R-3 | total 모드인데 `transferTotalPrice` 0 → 엔진 `transferPrice = 0` → 세액 0 silent | 데이터 무결성 | Zod refine + validate 양면 차단 (§8.3 + §8.2) |
| R-4 | 분할 모드에서 사용자가 total 강제 시도 | lot 매칭 데이터 충돌 | UI disabled + Zod refine 양면 차단 |
| R-5 | ⑭ route.ts `buildEngineInput()` 누락 → 다자산 경로 silent stripping | 다자산 합산 계산 시 total 모드 무시됨 | grep 자가 점검 강제 (§7 주석) |
| R-6 | 역산 단가 `총액 ÷ 주식수` 결과를 `useEffect`로 store에 쓰는 시도 | 무한 루프 위험 | display 전용으로만 처리 (JS 지역 변수, store 미러링 금지) |
| R-7 | `transferTotalPrice`가 `body`에서 `perShareTransferPrice`와 동시 전송 → 엔진에서 actualMode 분기 외 값이 혼입 | 예상치 못한 분기 | API 변환에서 활성 모드 값만 body 포함 (§8.4) |

---

## 12. Definition of Done 자가 체크

- [ ] 케이스 매트릭스 표 10개 행 전부 enumerate
- [ ] anchor 5건 (T-TOTAL-1~5) 모두 작성 → Do 진입 전 실패 메시지 확인
- [ ] 14지점 매트릭스 전부 동기화 (⑫⑬⑭ grep 자가 점검)
- [ ] ⑭ route.ts **단건 + `buildEngineInput()` 2곳** 모두 확인
- [ ] API fallback ↔ validation ↔ 사이드바 `"per_share"` 3중 패턴 일치 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` T-TOTAL-1~5 + 기존 회귀 0건
- [ ] 브라우저 수동 확인 5분기:
  - single + actual + per_share (현행 동작)
  - single + actual + total (신규, 역산 참고 표시)
  - single + exchange (무관 회귀)
  - split + actual + per_share (회귀)
  - split + actual + total (차단 UI 확인)
  - Network 탭: `transferActualInputMode` / `transferTotalPrice` 신규 필드 request body 확인

---

## 13. 후속 / 비대상

- 비대상: split 모드 총액 입력 (lot 매칭 의미 충돌)
- 비대상: exchange 모드 총액 직접 입력 (§96① 부동산·채무·현금 분해 요건)
- 비대상: 역산 단가 자동 저장 (표시 전용 — `feedback_useeffect_store_mirror_forbidden`)
- 완료 후: `memory/project_stock_transfer_actual_total_input.md` 신규 작성
