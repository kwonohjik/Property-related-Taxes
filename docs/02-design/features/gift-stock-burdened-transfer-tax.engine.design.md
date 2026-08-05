# 주식 부담부증여 양도소득세 — 엔진 설계

> 작성일: 2026-06-22 · 세목: 증여(gift) ↔ 주식양도(stock-transfer) 연동
> 계획서: `docs/00-pm/gift-stock-burdened-transfer-tax.plan.md` (13단계 자가검토 1차 정정 반영)
> 기준 코드: 메인 repo `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` (실측)
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `lib/tax-engine/types/inheritance-gift-estate.types.ts` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: Design (Do 미착수)~~

---

## Context

증여 마법사에서 상장·비상장 주식의 **부담부증여** 시, 채무인수분(유상양도, 소법 §88①1호)에
대한 **양도소득세를 함께 계산**하는 기능.

현재 한계:
- `StockBurdenedDebtSection.tsx:107`: 양도세 안내 문구만, 계산 없음
- `GiftTaxForm.tsx:165` 오케스트레이션 루프: `form.giftItems`(부동산)만 스캔, `form.stockItems` 제외
- 주식 부담부증여는 §47① 채무 차감만 구현됨

선행: 부동산 부담부증여 양도세(PR#309~#316·#324), `lib/calc/gift-burdened-transfer-api.ts`
독립 엔진: `stock-transfer`(/api/calc/stock-transfer) 재사용 — 부동산 transfer 엔진과 완전 분리.

---

## ★ 케이스 인벤토리 (Do 진입 게이트 — 행≥1)

| # | 케이스 | marketType | 취득모드 | 대주주 | 과세여부 | 안분경로 | anchor 출처 | 상태 |
|---|--------|-----------|---------|--------|---------|---------|------------|------|
| S-01 | 비상장 부담부 + 실지 | unlisted | actual | N/A | 과세 | 클라이언트 B/C 안분 → acquisitionPrice 주입 | 수기산출 §9-1 | ☐ TODO |
| S-02 | 비상장 부담부 + 환산(§165④) | unlisted | estimated | N/A | 과세 | 엔진 burdenedGiftDebtRatio 후처리 (A안) | §9-2 실측 필요 | ☐ TODO |
| S-03 | 상장 대주주 부담부 + 실지 | kospi/kosdaq/konex | actual | true | 과세 §104①11 | 클라이언트 B/C 안분 | §9-3 | ☐ TODO |
| S-04 | 상장 소액주주 부담부 | kospi/kosdaq/konex | actual | false | 과세(장외) | 클라이언트 B/C 안분 | §9-4 | ☐ TODO |
| S-05 | 상장 부담부 + 환산(§176의2②1호) | kospi 등 | estimated | — | 과세 | 양도가(B) 기반 자동 안분 (엔진 내부) | §9-3 변형 | ☐ TODO |
| S-06 | 채무액 ≥ 취득가+경비 | any | any | — | 과세(과세표준 0) | transferIncome 음수 허용(가드無)·taxBase에서 흡수(D4) | 경계값 | ☐ TODO |
| S-07 | 양도세 토글 OFF (채무만) | any | — | — | 미계산 | §47① 차감만, 양도세 0 | 기존 동작 보존 | ☐ TODO |
| S-08 | 부동산+주식 혼재 부담부 | mixed | — | — | 양쪽 합산 | transferTaxResults+stockTransferTaxResults 별도 배열 | 통합 UI | ☐ TODO |

**규칙**: 행≥1 이므로 Do 진입 가능. anchor 실측값은 §Pre-Do anchor 섹션에 기재.

---

## 법령 근거 (KoreanLaw MST 285523·286211·276123 실측)

### 소법 §88①1호 — 부담부증여 양도 의제 (자산 무관 확정)

> "양도란 … 대통령령으로 정하는 **부담부증여 시 수증자가 부담하는 채무액에 해당하는 부분은
> 양도로 보며**…"

자산 종류 제한 없음 → 주식(§88②2호 "주식등")도 부담부증여 채무인수분은 양도 의제. 확정.

### 소령 §159① — 부담부증여 양도차익 산정

**양도가액** = A × B/C
- A = 상증법 §60~66 평가액 (★F9 정정: `computeEffectiveValuation(stockItem, form.giftDate)` — 증여세 엔진과 **동일 클라이언트 순수함수**(`lib/calc/estate-item-valuation.ts:23`)로 form 단계 도출. 단일진실이므로 dual-truth 아님. result 불요 → 오케스트레이션 순서 모순 없음)
- B = 채무액
- C = 증여가액 (단일 자산 시 C=A → 양도가액 = B = 채무인수액)

**취득가액** = A × B/C — 단서: 양도가액을 §61①②⑤·§66 기준시가로 산정한 경우만
취득가액도 기준시가 안분.

**★ 주식 결론**: 주식 평가는 §63(유가증권). §159①1호 A괄호의 §61①②⑤·§66에 **미포함**.
→ 주식 취득가액은 §97①1호 실지/환산가액 그대로 적용. 기준시가 안분 필드 불요.

### 소법 §94①3가목 — 상장 소액주주 부담부증여

- 가목 1) 증권시장 장내거래 비대주주 → 비과세 (§94①3가목1 단서)
- 가목 2) **"증권시장에서의 거래에 의하지 아니하고" 양도** = 장외양도 → **과세**

부담부증여 의제양도는 증권시장 장내거래가 아님 → **소액주주라도 §94①3가목2로 과세**.
이 설계에서 `isOnMarketTransaction: false` 고정 전달.

### 상증법 §63①1호 — 상장주식 평가 (참고)

- 가목: 평가기준일 전후 2개월 종가평균 (4개월 평균)
- §63③: 최대주주 20% 할증

---

## §159 안분 알고리즘 단계별 (계획서 §5-1 (A)안 채택)

### 단계 1: 양도가액 확정

```
단일 자산: C = A(평가액) → 양도가액 = B(채무인수액, assumedDebtForGift)
클라이언트가 transferTotalPrice = assumedDebtForGift 주입
```

### 단계 2: 취득가액 — acquisitionMode별 분기

#### 2-A. actual (실지)

```
클라이언트 계산: acquisitionPrice = actualAcquisitionPrice × (B / C)
                               = 증여자당초취득가 × 채무액 / 평가액

→ buildGiftStockBurdenedTransferBody에서 Math.floor(actualAcquisitionPrice * debtRatio)
→ StockTransferInput.acquisitionMode = "actual"
→ StockTransferInput.perShareAcquisitionPrice = Math.floor(안분액 / shareCount)
   (엔진 STEP3:216 actual분기: acquisitionPrice = perShareAcquisitionPrice × shareCount)
```

**이중 안분 방지**: 클라이언트가 안분한 값을 actual 모드로 주입 → 엔진은 입력값 그대로 사용.
`burdenedGiftDebtRatio` 미전달 (또는 무시).

#### 2-B. estimated + 상장 / 취득후상장 (§176의2②1호)

```
transferPrice = B(채무인수액) 기반 자동 환산
엔진 STEP3:271-272: acquisitionPrice = apply163_9Conversion(transferPrice=B, ...)

→ 자동 안분 O (transferPrice가 이미 B이므로 §159 자동 만족)
→ burdenedGiftDebtRatio 불요
```

실측 근거: `apply163_9Conversion.ts:44`
`Math.floor(safeMultiply(transferPrice, acqStdPerShare) / transferStd)`

#### 2-C. estimated + 비상장 (★ Pre-Do anchor-2로 환류 — 2026-06-22)

```
★ Pre-Do anchor 실측(burdened-gift-stock-pre-do-anchor.test.ts):
  - acquisitionPrice = totalAcquisitionPrice = 양도가(transferPrice) × (취득기준시가/양도기준시가)
    (stock-valuation-unlisted.ts:44 — 양도가 기반 환산, 양도가 선형)
    → transferPrice = B(채무) 주입 시 취득가액도 자동으로 B/C 안분됨(선형성).
    ★ §159 정답: 취득가액 = 전체환산취득가(C×r) × B/C = B×r = 엔진값. 일치.
    ★ 따라서 acquisitionPrice에 burdenedGiftDebtRatio를 곱하면 이중 안분 — 절대 금지!
  - estimatedBase = acquisitionStdPriceTotal = 취득기준시가(§165④ 보충평가) 총액 (양도가 무관)
    → 개산공제(§163⑥4) = estimatedBase × 1%. 부담부 안분 시 estimatedBase만 ×B/C 필요.
    실측: anchor-2 개산공제 5백만(전체 5억×1%, 과대) vs 안분정답 2백만(5억×0.4×1%).

해법: StockTransferInput.burdenedGiftDebtRatio: number | undefined 신규 추가.
     ★ estimatedBase(개산공제 base)에만 적용. acquisitionPrice는 양도가 기반 자동 안분이므로 미적용.
     ★ 삽입점: 비상장 estimated 분기 estimatedBase 대입(:342) 이후 ~ 개산공제 계산(:468) 이전.
       if (burdenedGiftDebtRatio !== undefined && burdenedGiftDebtRatio < 1) {
         // acquisitionPrice는 건드리지 않음 (양도가 기반 자동 안분 — 이중 안분 방지)
         estimatedBase = Math.floor(estimatedBase * burdenedGiftDebtRatio); // 개산공제 base만 안분
       }
```

**미적용 조건**: `acquisitionMode === "actual"` → 클라이언트 안분 값이므로 엔진 비율 무시(애초에 estimatedBase 0).
**이중 안분 방지 규칙(★강화)**: ① actual 모드는 무시. ② estimated 모드에서도 **acquisitionPrice엔 비적용**(양도가 기반 자동 안분). estimatedBase(개산공제)만 안분.

### 단계 3: 개산공제 조정

```
비상장 환산(2-C) 시: estimatedBase도 burdenedGiftDebtRatio × 비율 적용
  → 개산공제 = Math.floor(estimatedBase × 0.01)
상장 환산(2-B) 시: transferPrice=B 기반 환산이므로 estimatedBase도 자동 안분됨
실지(2-A) 시: actualAcquisitionPrice × debtRatio를 per_share로 분할 주입
```

### 단계 4: 엔진 호출 결과

```
finalTax (line:662) + localIncomeTax (line:663) = 총세부담  (D5: 파일 701줄, 라인 갱신)
totalTax 필드 없음 (F2 정정)
securitiesTransactionTax = 정보성, 합산 금지
```

---

## 엔진 input 타입 변경: StockTransferInput 확장

### 신규 필드 1개 추가

```ts
// lib/tax-engine/stock-transfer/types/stock-transfer.types.ts
export type StockTransferInput = {
  // ... 기존 필드 전부 보존 ...

  /**
   * [부담부증여 전용] §159 취득가액 후처리 비율 — B(채무액) / C(증여가액).
   * 엔진이 자체 산출하는 acquisitionPrice(비상장 §165④ 보충평가 estimated 경로)에만 적용.
   * 적용 조건: acquisitionMode === "estimated" && marketType === "unlisted" && value !== undefined
   * 미적용 조건: acquisitionMode === "actual" (클라이언트 안분 완료), 상장 estimated (transferPrice=B 자동)
   * 범위: 0 < burdenedGiftDebtRatio <= 1
   * @default undefined (일반 주식 양도 — 기존 동작 100% 보존)
   */
  burdenedGiftDebtRatio?: number;
};
```

### 적용 지점: stock-transfer-tax.ts STEP3

```
현재 line:337-378 (비상장 estimated 분기) 말미:
  if (input.burdenedGiftDebtRatio !== undefined &&
      input.burdenedGiftDebtRatio > 0 &&
      input.burdenedGiftDebtRatio < 1) {
    acquisitionPrice = Math.floor(acquisitionPrice * input.burdenedGiftDebtRatio);
    if (estimatedBase !== undefined) {
      estimatedBase = Math.floor(estimatedBase * input.burdenedGiftDebtRatio);
    }
  }

※ actual 분기(line:216-223)·상장 estimated 분기(line:421-441)에는 추가 없음.
※ burdenedGiftDebtRatio === undefined 시 기존 동작 100% 보존 → 회귀 0.
```

### Zod schema 추가 (⑨⑫ 동기화)

```ts
// lib/api/stock-transfer-tax-schema.ts
// stockTransferInputSchema 객체 내부 추가:
burdenedGiftDebtRatio: z.number().min(0).max(1).optional(),
```

---

## BurdenedGiftStockTransferInput — 클라이언트 타입

```ts
// components/calc/gift/types.ts (EstateItem 확장)
// burdenedGiftTransferTax? 필드에 사용 — 3-state: undefined=OFF, 객체=ON

interface BurdenedGiftStockTransferInput {
  /** 시장구분 — EstateItem 미보유, 신규 입력 필수 */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  /** 증여자 당초 취득일 (§95 보유기간·§157 대주주 판정) */
  acquisitionDate: Date | string;
  /** 취득가액 산정 방식 */
  acquisitionMode: "actual" | "estimated";
  /** 실지 모드: 증여자 당초취득가 합계 (안분 전) */
  actualAcquisitionPrice?: number;
  /**
   * 상장 대주주 여부 (§104①11 세율 분기).
   * 비상장은 항상 과세, 소액주주 비과세 규정 미적용(F8).
   * undefined = false (소액주주) — 3중 패턴 default 일치.
   */
  isMajorShareholder?: boolean;
}
```

**3-state 규칙**:
- `undefined` = 양도세 토글 OFF (§47① 채무 차감만)
- `{}` 객체 = 양도세 토글 ON (계산 대상)
- `length > 0` derive 금지

---

## buildGiftStockBurdenedTransferBody — 필드 1:1 매핑표 (⑫⑬⑭ 핵심)

신규 함수: `lib/calc/gift-burdened-transfer-api.ts`에 추가

```ts
export function buildGiftStockBurdenedTransferBody(
  stockItem: StockEstateItem,    // 주식 자산 (EstateItem 주식 버전)
  form: FormState,
): Record<string, unknown>
```

| 목적지 StockTransferInput 필드 | 출처 | 변환 |
|-------------------------------|-----|------|
| `marketType` | `bgt.marketType` | 그대로 |
| `transferPriceMode` | — | `"actual"` 고정 |
| `transferActualInputMode` | — | `"total"` 고정 |
| `transferTotalPrice` | `stockItem.assumedDebtForGift` | 채무인수액 = §159 양도가액 |
| `acquisitionMode` | `bgt.acquisitionMode` | `"actual"` 또는 `"estimated"` |
| `perShareAcquisitionPrice` | `Math.floor(안분액 / shareCount)` | actual 모드만. 안분액 = `Math.floor(bgt.actualAcquisitionPrice × debtRatio)` |
| `acquisitionDate` | `bgt.acquisitionDate` | toDate 변환 |
| `transferDate` | 증여일 (form.giftDate 또는 평가기준일) | toDate 변환 |
| `shareCount` | `stockItem.listedStockShares` 또는 비상장 주식수 | 정수 |
| `totalIssuedShares` | `stockItem` 발행주식수 | 정수 |
| `isMajorShareholder` | `bgt.isMajorShareholder ?? false` | boolean |
| `selfShareRatio` | — | `0` (안전 기본값, 대주주 false 시 무관) |
| `selfMarketCap` | — | `0` |
| `isLargestShareholderGroup` | — | `false` |
| `combinedShareRatio` | — | `0` |
| `combinedMarketCap` | — | `0` |
| `priorYearEndDate` | 양도일 직전 사업연도 종료일 (연산) | Date |
| `isSmallMediumEnterprise` | `stockItem.isSmallMediumEnterprise ?? false` | boolean |
| `isMidsizeEnterprise` | — | `false` |
| `isListedSmallShareholder` | — | `false` (부담부는 장외→항상 과세) |
| `isVentureCompany` | — | `false` |
| `isKOTCTrading` | — | `false` |
| `isOnMarketTransaction` | — | **`false` 고정** (부담부 = 장외양도 §94①3가목2) |
| `isQualifyingBlockShareholder` | — | `false` |
| `isHeavyRealEstateForRate` | — | `false` |
| `isHeavyRealEstateForValuation` | — | `false` |
| `acquisitionCause` | — | `"purchase"` (증여자 취득원인 별도 입력 SCOPE OUT Phase 2) |
| `bookLost` | — | `false` |
| `acquiredBeforeListing` | — | `false` (Phase 2 취득후상장 SCOPE OUT) |
| `tradingHaltAtTransfer` | — | `false` |
| `expenseMode` | acquisitionMode 종속 | 환산(estimated)=`"estimated"`(개산공제 §163⑥4 발동) / 실지(actual)=`"actual"`(개산공제 미발동, 실비 미입력 시 expenses 0 — D2). ★expenseMode="estimated"여도 취득이 actual이면 엔진이 개산공제 미산출(usedEstimatedAcquisition false) |
| `filingType` | — | `"preliminary"` |
| `filingDate` | 양도반기 말+2개월 (§105①2호) | Date |
| `isElectronicFiling` | — | `false` |
| `filingViolation` | — | `"none"` |
| `isFraudulent` | — | `false` |
| `isInternationalTransaction` | — | `false` |
| `realEstateGroupBasicDeductionUsed` | — | `0` |
| **`burdenedGiftDebtRatio`** | `stockItem.assumedDebtForGift / valuationAmount` | **신규 — 비상장 estimated 전용** |

**estimated + 비상장**: `burdenedGiftDebtRatio = assumedDebtForGift / valuationAmount` 추가.
비상장 estimated에서만 엔진 후처리. actual 모드에서는 클라이언트가 안분값을 `perShareAcquisitionPrice`에 주입.

**상장 estimated**: `burdenedGiftDebtRatio` 미전달 (transferPrice=B 기반 자동 안분).

---

## 비상장 환산 §165④ 후처리 필요성 — Pre-Do anchor-2 설계

**실측 확인 방법** (anchor 실행 시):

```ts
// 입력: 비상장, 평가액 10억, 채무 4억, 보충평가액(취득시 1주당 600,000원 × 2000주 = 12억)
// burdenedGiftDebtRatio 없이 호출 시:
// acquisitionPrice = 1,200,000,000  ← 12억 (양도가 4억보다 큼 → 양도차익 음수)
// burdenedGiftDebtRatio = 4억/10억 = 0.4 적용 후:
// acquisitionPrice = Math.floor(1,200,000,000 × 0.4) = 480,000,000  ← 4.8억 정확
```

**anchor-2** 실측으로 엔진 후처리(A안) 필요성 확정 → Do 단계에서 구현.

---

## callGiftStockBurdenedTransferAPI — 함수 시그니처

```ts
// lib/calc/gift-burdened-transfer-api.ts에 추가

/**
 * 주식 부담부증여 양도소득세 API 호출
 * POST /api/calc/stock-transfer
 *
 * @param stockItem - 주식 자산 (burdenedGiftTransferTax !== undefined인 것만)
 * @param form - 증여 폼 상태 (증여일·수증자 정보)
 * @param valuationAmount - 상증법 §63 평가액 (증여세 엔진 valuationResults 재사용)
 * @returns StockTransferResult
 */
export async function callGiftStockBurdenedTransferAPI(
  stockItem: StockEstateItem,
  form: FormState,
  valuationAmount: number,
): Promise<StockTransferResult>
```

**⑬ body spread 점검**: fetch body는 `buildGiftStockBurdenedTransferBody` 반환값 spread.
명시 매핑 strip 방지 — 체크리스트:
- `burdenedGiftDebtRatio` 포함 확인
- `isOnMarketTransaction: false` 포함 확인
- `acquisitionDate` (string) → coerceDates가 Date로 변환하는지 확인

---

## 오케스트레이션 변경: GiftTaxForm.tsx

```
기존 루프(line:165):
  form.giftItems.filter(it => it.burdenedGiftTransferTax !== undefined)
  → callGiftBurdenedTransferAPI → transferTaxResults: TransferTaxResult[]

신규 추가:
  const stockBurdenedItems = form.stockItems.filter(
    it => it.burdenedGiftTransferTax !== undefined
  );
  // 직렬 호출 (기존 부동산 패턴 동일)
  for (const item of stockBurdenedItems) {
    const valuation = getStockValuationAmount(item);  // 증여세 엔진 평가액 재사용
    const result = await callGiftStockBurdenedTransferAPI(item, form, valuation);
    stockTransferTaxResults.push(result);
  }
  → stockTransferTaxResults: StockTransferResult[]  ← 별도 state (TransferTaxResult와 다른 타입)
```

---

## 결과 타입 이원화 처리

```ts
// 부동산 총세부담 (기존)
transferTaxResults: TransferTaxResult[]  // result.totalTax

// 주식 총세부담 (신규)
stockTransferTaxResults: StockTransferResult[]  // finalTax + localIncomeTax

// 헬퍼 (GiftTaxResultView.tsx 내부)
function stockTotalTax(r: StockTransferResult): number {
  return r.finalTax + r.localIncomeTax;
}
```

`securitiesTransactionTax`(line:681)는 정보성 — 합산 금지.

---

## 렌더 게이트 확대 (F5)

```ts
// GiftTaxResultView.tsx 현재:
// line:509: transferTaxResults.length > 0
// line:517: transferTaxResults.length > 0

// 변경: 주식 결과도 렌더 트리거에 포함
// line:509: transferTaxResults.length > 0 || stockTransferTaxResults.length > 0
// line:517: transferTaxResults.length > 0 || stockTransferTaxResults.length > 0
// line:295·297(세부담 비교 카드도 동일)
```

---

## 세부담 비교 합산 확대 (F2·F7)

```ts
// computeBurdenedGiftComparison 함수 시그니처 변경 (D1 정정)
// 기존 (실제 — gift-burden-comparison.ts:34-38, 3-인자):
computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
)

// 변경 (4번째 인자 추가):
computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
  stockTransferTaxResults: StockTransferResult[],  // 신규 (4번째)
)
// 내부: burdenedTransferTax = Σ(부동산 totalTax) + Σ(주식 finalTax + localIncomeTax)

// caller 2지점:
// 1. BurdenedGiftComparisonCard.tsx:33 (현재 3-인자 호출 → 4-인자) + props
// 2. GiftTaxResultView (stockTransferTaxResults 전달)
```

---

## 14개 동기화 지점 (Do 체크리스트)

| 지점 | 작업 내용 | TS감지 |
|------|---------|--------|
| ① 폼/EstateItem | `BurdenedGiftStockTransferInput` 타입 신규 + stockItem.burdenedGiftTransferTax 3-state | O |
| ② initial | `createEmptyStockBgt = undefined` (OFF) — store=UI=API 일치 | O |
| ③ normalize | sessionStorage 복원 시 acquisitionDate Date 보존 | O |
| ④ API 변환 | `buildGiftStockBurdenedTransferBody` 신규 (§159 안분 + isOnMarketTransaction=false) | O |
| ⑤ UI 위젯 | `StockBurdenedDebtSection` 양도세 섹션(marketType·취득일·실지/환산·대주주) | O |
| ⑥ 사이드바 | N/A (결과 후 파생, 입력 합계 없음) | — |
| ⑦ 결과 카드 | `StockTransferResultView` 재사용 + GiftTaxResultView prop + 렌더게이트 + 비교합산 | O |
| ⑧ validation | 토글 ON: marketType·acquisitionDate 필수, actual 모드: actualAcquisitionPrice 필수. UI/validate 동기 | O |
| ⑨ Zod enum 메인 | `stockTransferInputSchema`에 `burdenedGiftDebtRatio: z.number().min(0).max(1).optional()` 추가 | X |
| ⑩ Zod 컴패니언 | N/A (주식은 단일 input, addStockRefines 변경 불요) | — |
| ⑪ acqDate fallback | acquisitionDate 필수 — fallback 없음 (자동 안분 금지 정책) | X |
| **⑫ Zod 입력객체** | `stockTransferInputSchema`가 burdenedGiftDebtRatio 포함하는지 grep 자가점검 | X |
| **⑬ body spread** | `callGiftStockBurdenedTransferAPI` fetch body: burdenedGiftDebtRatio·isOnMarketTransaction 누락 없는지 | X |
| **⑭ Route 매핑** | `buildEngineInput(route.ts:137)`: `burdenedGiftDebtRatio: coerced.burdenedGiftDebtRatio as number \| undefined` 추가 + STOCK_DATE_FIELDS 확인 | X |

**⑫⑬⑭ 수동 grep 명령** (Do 시 실행):
```bash
# ⑫ Zod schema에 burdenedGiftDebtRatio 있는지
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/lib/api/stock-transfer-tax-schema.ts

# ⑬ body에 burdenedGiftDebtRatio 있는지
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/lib/calc/gift-burdened-transfer-api.ts

# ⑭ route buildEngineInput에 burdenedGiftDebtRatio 있는지
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/app/api/calc/stock-transfer/route.ts
```

---

## Pre-Do anchor 기대값 (§9 계획서 기반 수기산출)

### anchor-1: 비상장 실지 S-01

```
입력:
  평가액(C) = 1,000,000,000원 (10억)
  채무액(B) = 400,000,000원 (4억)
  debtRatio = B/C = 0.4
  증여자 당초취득가 = 200,000,000원 (2억)
  주식수 = 10,000주, 발행주식 = 50,000주
  비상장, 취득일 = 2020-01-01, 양도일(증여일) = 2025-06-01
  대주주 아님 (isMajorShareholder=false)
  expenseMode = "estimated"

§159 계산:
  양도가액 = 채무액 = 400,000,000
  취득가액 = 200,000,000 × 0.4 = 80,000,000
  acquisitionMode = "actual"
  perShareAcquisitionPrice = 80,000,000 / 10,000 = 8,000원/주

개산공제 (§163⑥4) — ★ D2 정정:
  개산공제(§163⑥4)는 환산취득가(estimated) 모드 전용. actual 모드는 개산공제 0.
  필요경비(expenses) = actual 모드에서 expenseMode="actual"+actualExpenses 입력 시에만.
  본 anchor는 실비 미입력 → expenses = 0.
  ※ anchor 입력의 expenseMode는 actual 모드와 무관(개산공제 미발동) — 매핑표에서 actual은 expenseMode 미설정/actual.

양도차익 = 400,000,000 - 80,000,000 - 0 = 320,000,000  (개산공제·실비 없음)
기본공제 (§103② 그룹2) = 2,500,000
과세표준 = 320,000,000 - 2,500,000 = 317,500,000

세율 (비상장 비대주주 §104①11나목):
  중소 10%, 비중소 20%

→ finalTax + localIncomeTax = "Do 시 stock 엔진 실측 후 원단위 고정"
   (예: 비중소 20% 가정 시 산출세액 ≈ 63,500,000 + 지방소득세 10% — Do 실측 확정)
```

### anchor-2: 비상장 환산 S-02 — 엔진 후처리 필요성 검증

```
입력 (burdenedGiftDebtRatio 미전달 케이스):
  평가액(C) = 1,000,000,000원
  채무액(B) = 400,000,000원
  주식수 = 2,000주, 발행주식 = 10,000주
  비상장 §165④ 보충평가:
    transferYearNetIncomePerShare = 300,000원/주
    transferYearNetAssetPerShare  = 500,000원/주
    가중평균 = (300,000×3 + 500,000×2)/5 = 380,000원/주
    취득기준시가 총액 = 380,000 × 2,000 = 760,000,000원
  양도가(transferPrice) = 400,000,000원

burdenedGiftDebtRatio 없이 호출 시 기대:
  acquisitionPrice = 760,000,000  (보충평가 취득가 전체 — 양도가 4억보다 큼)
  양도차익 = 400,000,000 - 760,000,000 = -360,000,000 (음수 → 버그 확인)

burdenedGiftDebtRatio = 0.4 후처리 후 기대:
  acquisitionPrice = Math.floor(760,000,000 × 0.4) = 304,000,000
  estimatedBase = Math.floor(760,000,000 × 0.4) = 304,000,000
  개산공제 = Math.floor(304,000,000 × 0.01) = 3,040,000
  양도차익 = 400,000,000 - 304,000,000 - 3,040,000 = 92,960,000
  기본공제 = 2,500,000
  과세표준 = 90,460,000
  세율(비상장 비대주주, 중소 가정) = 10%
  산출세액 = Math.floor(90,460,000 × 0.1) = 9,046,000
  finalTax = 9,046,000
  localIncomeTax = Math.floor(9,046,000 × 0.1 / 10) × 10 = 904,600
    (10원 미만 절사)
  총세부담 = 9,046,000 + 904,600 = 9,950,600

→ anchor-2 toBe: finalTax = 9,046,000 / localIncomeTax = 904,600
   (가정: 비중소 20% 시 별도 재산출)
```

### anchor-3: 상장 환산 S-05 — 자동 안분 확인

```
입력:
  kospi 상장, 채무액(B) = 300,000,000원 (양도가액)
  transferDatePriceAvg1Month = 50,000원/주
  acquisitionDatePriceAvg1Month = 30,000원/주
  주식수 = 10,000주
  burdenedGiftDebtRatio 미전달

§176의2②1호 환산:
  acquisitionPrice = transferPrice × (취득기준시가 / 양도기준시가)
                   = 300,000,000 × (30,000 / 50,000) = 180,000,000
  → 자동 안분 O (transferPrice=B 기반)

→ anchor-3 acquisitionPrice toBe: 180,000,000
```

### anchor-4: 상장 소액주주 과세 S-04

```
입력:
  kospi 상장, isMajorShareholder=false, isOnMarketTransaction=false
  채무액(B) = 500,000,000원, actual 취득가 안분 후 = 200,000,000원

§94①3가목2 (장외양도) → 과세
세율(비대주주 장외 중소기업 외) = 20% (§104①11나목)

→ anchor-4: isExempt === false, taxCategory === "listed_off_market_non_major"
   (비과세 아님 확인)
```

---

## Silent fallback / 자동 안분 금지 점검

| 필드 | 위험 | 처리 방침 |
|------|-----|---------|
| `actualAcquisitionPrice` | actual 모드 미입력 | validation ⑧에서 필수 오류 차단 |
| `marketType` | 미선택 | validation ⑧ 필수, UI 강제 선택 |
| `acquisitionDate` | 미입력 | validation ⑧ 필수, route ⑪ fallback 없음 |
| `valuationAmount` (증여세 평가액) | 단일진실 순수함수 | `computeEffectiveValuation(stockItem, form.giftDate)`(estate-item-valuation.ts:23) — 증여세 엔진과 동일 함수로 form 단계 도출(D3 정정, dual-truth 아님) |
| `burdenedGiftDebtRatio` | 자동안분 | actual 모드에서 엔진 무시, estimated+비상장만 적용 |
| `isOnMarketTransaction` | 장내 자동판정 금지 | `false` 고정 (부담부=장외) — 자동판정 금지 |
| `priorYearEndDate` | 자동계산 오류 가능 | 양도일 기준 직전 사업연도 종료일 자동계산 허용 (사업연도 12월 기준) |

---

## SCOPE OUT (Phase 2 이후)

- §114의2 환산 5% 가산세 주식 적용 (PR#316 부동산 참조)
- 복수 주식 자산 동시 부담부 (증여가액 C 복수 분모)
- 취득후상장 (acquiredBeforeListing=true) 환산
- 기타자산 §94①4 (부동산과다보유법인·과점주주)
- 외국주식, 국외전출세
- acquisitionCause 증여자 취득원인 분기 (상속·합병 기산점)

---

## 테스트 약속

테스트 파일: `__tests__/tax-engine/stock-transfer/gift-stock-burdened-transfer.test.ts`

```ts
describe("주식 부담부증여 양도소득세", () => {
  describe("S-01: 비상장 실지 §159 안분", () => {
    it("양도가액 = 채무인수액, 취득가액 = 당초취득가 × 채무비율", () => {
      // anchor-1 기대값 Do 시 실측 후 toBe() 고정
    });
  });

  describe("S-02: 비상장 환산 엔진 후처리", () => {
    it("burdenedGiftDebtRatio 없이 호출 시 acquisitionPrice > transferPrice (버그 확인)", () => {
      // anchor-2a: 후처리 전 음수 양도차익
    });
    it("burdenedGiftDebtRatio=0.4 적용 시 finalTax=9,046,000", () => {
      // anchor-2b: toBe 고정
      expect(result.finalTax).toBe(9046000);
      expect(result.localIncomeTax).toBe(904600);
    });
  });

  describe("S-03: 상장 대주주 부담부 + 실지", () => {
    it("§104①11가목 세율 적용, 장외 과세", () => { /* Do 시 */ });
  });

  describe("S-04: 상장 소액주주 장외 과세", () => {
    it("isExempt=false, taxCategory=listed_off_market_non_major", () => {
      // anchor-4: isOnMarketTransaction=false → 과세
      expect(result.isExempt).toBe(false);
    });
  });

  describe("S-05: 상장 환산 자동 안분", () => {
    it("acquisitionPrice = transferPrice × (acqStd / transferStd)", () => {
      expect(result.acquisitionPrice).toBe(180000000); // anchor-3
    });
  });

  describe("S-06: 채무 ≥ 취득가+경비 — 음수 흡수 (D4 정정)", () => {
    it("transferIncome은 음수 허용(가드 없음, stock-transfer-tax.ts:525-527), 과세표준에서 흡수", () => {
      // ★ D4: 엔진 transferIncome = transferPrice − acquisitionPrice − expenses (음수 가능, max(0) 없음).
      //   음수 흡수는 taxBaseRaw = Math.max(0, transferIncome − basicDeduction)(541행)에서만.
      expect(result.taxBase).toBeGreaterThanOrEqual(0);
      expect(result.calculatedTax).toBeGreaterThanOrEqual(0);
    });
  });

  describe("S-07: 토글 OFF — 계산 없음", () => {
    it("burdenedGiftTransferTax=undefined인 stockItem은 루프 제외", () => {
      // 오케스트레이션 단위 테스트
    });
  });
});

// 회귀: 기존 비부담부 주식 양도 계산 영향 없음
describe("회귀: burdenedGiftDebtRatio=undefined 시 기존 동작 보존", () => {
  it("일반 비상장 estimated: burdenedGiftDebtRatio 미전달 시 기존 결과 동일", () => {
    // 사례 49 anchor 재실행으로 회귀 확인
  });
});
```

**PDF anchor 재검증**: Do 전 `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 실행하여
기존 사례 48·49 anchor 이상 없음 확인.

---

## 엔진 변경 최소 원칙 요약

| 파일 | 변경 규모 | 내용 |
|------|---------|------|
| `types/stock-transfer.types.ts` | +8줄 | `burdenedGiftDebtRatio?: number` 필드 추가 + JSDoc |
| `stock-transfer-tax.ts` STEP3 비상장 estimated 분기 | +6줄 | `burdenedGiftDebtRatio` 후처리 (line:338~380 말미) |
| `lib/api/stock-transfer-tax-schema.ts` | +2줄 | `burdenedGiftDebtRatio: z.number().min(0).max(1).optional()` |
| `app/api/calc/stock-transfer/route.ts` buildEngineInput | +2줄 | `burdenedGiftDebtRatio` 명시 매핑 |
| `lib/calc/gift-burdened-transfer-api.ts` | +~80줄 | `buildGiftStockBurdenedTransferBody` + `callGiftStockBurdenedTransferAPI` |

기존 엔진 로직(사례 48·49, 단기 30%, 대주주 누진, K-OTC 비과세 등) **전혀 변경 없음**.
`burdenedGiftDebtRatio === undefined` 시 if 블록 미진입 → 회귀 0 보장.

---

## 핵심 설계 결정 요약 (5개)

1. **§159 취득가액 3-way 분기**: actual=클라이언트 안분, 상장estimated=transferPrice=B 자동, 비상장estimated=엔진 burdenedGiftDebtRatio 후처리. 이중 안분 방지 규칙 명시.

2. **StockTransferInput.burdenedGiftDebtRatio optional 추가**: 비상장 estimated 경로 전용. undefined 시 기존 동작 100% 보존. 엔진 변경 최소화(+6줄).

3. **상장 소액주주 부담부 = 과세**: `isOnMarketTransaction: false` 고정 전달. F8 정정 확정(§94①3가목2 장외양도).

4. **결과 타입 이원화**: `StockTransferResult`(finalTax+localIncomeTax) vs `TransferTaxResult`(totalTax) 완전 분리. 헬퍼 `stockTotalTax` 추출로 비교합산.

5. **valuationAmount 단일진실(D3 정정)**: `computeEffectiveValuation(stockItem, form.giftDate)` — 증여세 엔진과 동일 클라이언트 순수함수(estate-item-valuation.ts:23)로 form 단계 도출. result 불요(부동산 경로와 동일하게 form-only 호출). 별도 재구현 금지(dual-truth) — 동일 함수 호출이므로 정합.
