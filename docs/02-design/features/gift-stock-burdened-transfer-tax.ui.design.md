# 주식 부담부증여 양도소득세 — UI 설계

> 작성일: 2026-06-22 · 세목: 증여(gift) ↔ 주식양도(stock-transfer) 연동
> 계획서: `docs/00-pm/gift-stock-burdened-transfer-tax.plan.md`
> 엔진 설계: `docs/02-design/features/gift-stock-burdened-transfer-tax.engine.design.md`
> 기준 코드: 메인 repo + worktree `feat/gift-stock-burdened-transfer` (slot 4, DEV 3004 / E2E 3104)
> 상태: Design (Do 미착수)

---

## 0. 3대 정책 사전 점검

| 정책 | 적용 여부 | 세부 |
|------|----------|------|
| useEffect store 미러링 금지 | 준수 | marketType·acquisitionMode 변경은 onChange 직결. cross-field 동기화 없음. |
| 자동 안분 fallback 금지 | 준수 | marketType·acquisitionDate·actualAcquisitionPrice 미입력 = validateStep ⑧ 차단. 침묵 0-base 없음. |
| validation 8번째 동기화 강제 | 준수 | 토글 ON 필수 3종 + 실지 모드 조건부 1종 → validateStep 동기화 §3.4 명세. |

---

## 1. 현황 분석 (실측)

### 1.1 StockBurdenedDebtSection.tsx (현재, 33~114행)

현재 노출 필드: `assumedDebtForGift`(§47①) + `burdenedGiftDebtConfirmed`(§47③ 표시 토글)만.

아래 안내 문구가 107~110행에 정보성으로 존재:
```
"채무 인수분은 증여자의 유상양도에 해당하여 주식 양도소득세가 별도로 발생할 수 있습니다."
```

신규 추가 대상: § 47① 섹션 아래에 "양도소득세 함께 계산" ToggleCard(amber tone, 3-state optional).

### 1.2 GiftTaxForm.tsx 오케스트레이션 (현재)

- 165행: `form.giftItems.filter(burdenedGiftTransferTax !== undefined)` 루프만 존재.
- `form.stockItems` 루프 없음 → 신규 추가 대상.
- state 현황: `transferTaxResults: TransferTaxResult[]` (53행), `simpleGiftResult` (56행).
- 신규 상태: `stockTransferTaxResults: StockTransferResult[]` 추가 필요.

### 1.3 GiftTaxResultView.tsx (현재)

- 509행: `{transferTaxResults.length > 0 && ...}` — 부동산 전용 렌더 게이트.
- 517행: `simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError` — 비교 카드 게이트.
- 295행: `if (transferTaxResults.length > 0) s.add("burdened-transfer-tax")` — 출력 선택.
- 297행: `if (simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError)` — 비교 카드.
- Props 인터페이스(141~190행): `transferTaxResults?: TransferTaxResult[]`, `simpleGiftResult?: GiftTaxResult`. `stockTransferTaxResults` 없음 → 신규 추가.

### 1.4 BurdenedGiftComparisonCard.tsx (현재, 33행)

3-인자 호출: `computeBurdenedGiftComparison(simpleGiftResult, giftResult, transferTaxResults)`.
4-인자로 확대 필요(엔진 설계 D1 정정).

### 1.5 gift-burden-comparison.ts (현재, 34~38행)

`burdenedTransferTax = Σ(t.totalTax)` — TransferTaxResult.totalTax(부동산 전용).
StockTransferResult에는 `totalTax` 필드 없음(F2 확정). 주식 총세부담 = `finalTax + localIncomeTax`.

### 1.6 validateStep (gift-tax-form-shared.tsx, 258행~)

현재 부담부증여 검증 블록(279~390행)은 `form.giftItems`(부동산)의 `burdenedGiftTransferTax` 체크. 주식 `form.stockItems` 검증 없음 → 신규 추가.

### 1.7 gift-print-sections.ts (현재)

```ts
| "burdened-transfer-tax"      // 45행
| "burdened-gift-comparison"  // 46행
```
신규 ID: `"burdened-stock-transfer-tax"` 추가 필요.

---

## 2. 신규 FormData 타입 (① 폼 상태)

엔진 설계서와 동일. EstateItem.burdenedGiftTransferTax 필드에 주식 변형 타입 사용.

```ts
// 위치: 기존 estate.types 또는 components/calc/gift/types.ts
// 부동산 BurdenedGiftTransferTaxInput과 구분하는 별도 인터페이스

interface BurdenedGiftStockTransferInput {
  /** 시장구분 — EstateItem.category(listed_stock/unlisted_stock)와 별개.
   *  kospi/kosdaq/konex 중 어느 시장인지 구체화 + unlisted 포함.
   *  EstateItem에 기존 시장 필드 없으므로 신규 입력 강제 (validation ⑧ 필수) */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";

  /** 증여자 당초 취득일 (§95 보유기간·§157 대주주 판정) */
  acquisitionDate: Date | string;

  /** 취득가액 산정 방식 */
  acquisitionMode: "actual" | "estimated";

  /** 실지 모드: 증여자 당초취득가 합계 (안분 前 전체 금액).
   *  클라이언트가 B/C 안분 후 엔진에 주입 (자동 안분 fallback 금지). */
  actualAcquisitionPrice?: number;

  /** 상장 대주주 여부 (§104①11 세율 분기).
   *  비상장은 항상 과세. 소액주주 비과세는 부담부(장외) 미적용(F8).
   *  undefined = false(소액주주) — store·UI·API 3중 default 일치 */
  isMajorShareholder?: boolean;
}
```

3-state 규칙:
- `undefined` = 양도세 토글 OFF (§47① 채무 차감만, 기존 동작)
- `{}` 객체 = 양도세 토글 ON (계산 대상)
- `length > 0` derive 금지 (feedback_three_state_optional_mode_toggle)

---

## 3. ② initial / ③ normalize

### 3.1 initial (②)

```ts
// gift-tax-form-shared.tsx INITIAL_FORM → stockItems 내 각 EstateItem
// burdenedGiftTransferTax 필드: undefined (OFF 상태)
// → createEmpty 함수 별도 불요; EstateItem factory에서 undefined로 생성됨
```

StockItemEditor 또는 자산 모달에서 새 주식 자산 생성 시 `burdenedGiftTransferTax: undefined` — 이미 기본.

### 3.2 normalize (③)

sessionStorage 복원 시 `acquisitionDate`가 JSON string으로 도달. 기존 `normalizeRestoredFormDates`(`components/calc/inheritance/normalize-restored-form-dates.ts`) 확장 대상.

```ts
// EstateItem.burdenedGiftTransferTax가 객체이고 acquisitionDate가 string이면
// → 보존(toDate는 API 변환 ④에서 수행; normalize는 타입 호환만 유지)
// 추가 필요: stockItems 내 burdenedGiftTransferTax?.acquisitionDate 재직렬화 방어
```

---

## 4. 14개 동기화 지점 전수표

| # | 지점 | 파일 | 작업 내용 | TS 감지 |
|---|-----|------|---------|--------|
| ① | 폼/EstateItem 타입 | `lib/tax-engine/types/inheritance-gift.types.ts` 또는 `gift-types.ts` | `BurdenedGiftStockTransferInput` 인터페이스 신규 + `EstateItem.burdenedGiftTransferTax`에 union 확장 | O |
| ② | initial value | `components/calc/gift-tax-form-shared.tsx` INITIAL_FORM | stockItems 내 burdenedGiftTransferTax: undefined 기본값 보장 | O |
| ③ | normalize | `components/calc/inheritance/normalize-restored-form-dates.ts` | stockItems[].burdenedGiftTransferTax?.acquisitionDate string 방어 | O |
| ④ | API 변환 | `lib/calc/gift-burdened-transfer-api.ts` | `buildGiftStockBurdenedTransferBody` 신규 + `callGiftStockBurdenedTransferAPI` 신규 | O |
| ⑤ | UI 위젯 | `components/calc/gift/StockBurdenedDebtSection.tsx` | 양도세 토글 섹션 추가 (§3.3 위젯 스케치) | O |
| ⑥ | 사이드바 합계 | N/A | 결과 후 파생 — 입력 중 합계 표시 없음 | — |
| ⑦ | 결과 카드 | `GiftTaxResultView.tsx` + `BurdenedTransferTaxResultCard` 확장 or 신규 `BurdenedStockTransferTaxResultCard` + `BurdenedGiftComparisonCard` | 주식 결과 카드 렌더 + 비교 합산 확대 + 렌더 게이트 확대 | O |
| ⑧ | validation | `components/calc/gift-tax-form-shared.tsx` validateStep | 토글 ON 시 marketType·acquisitionDate 필수; actual 모드 시 actualAcquisitionPrice 필수 — UI/validate 동기 | O |
| ⑨ | Zod enum 메인 | `lib/api/stock-transfer-tax-schema.ts` | `burdenedGiftDebtRatio: z.number().min(0).max(1).optional()` 추가 | X |
| ⑩ | Zod 컴패니언 | N/A | 주식 단일 input, addStockRefines 변경 불요 | — |
| ⑪ | acqDate fallback | `app/api/calc/stock-transfer/route.ts` | acquisitionDate fallback 없음 (자동 안분 금지) — STOCK_DATE_FIELDS 확인만 | X |
| ⑫ | Zod 입력 객체 정의 | `lib/api/stock-transfer-tax-schema.ts` | buildGiftStockBurdenedTransferBody 결과가 stockTransferInputSchema 1:1 통과 확인 (grep 자가점검) | X |
| ⑬ | body spread | `lib/calc/gift-burdened-transfer-api.ts` | callGiftStockBurdenedTransferAPI fetch body에 burdenedGiftDebtRatio·isOnMarketTransaction 누락 없는지 | X |
| ⑭ | Route 매핑 | `app/api/calc/stock-transfer/route.ts` buildEngineInput | `burdenedGiftDebtRatio: coerced.burdenedGiftDebtRatio as number | undefined` 추가 | X |

⑫⑬⑭ 자가 점검 grep (Do 시 실행):
```bash
# ⑫
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/lib/api/stock-transfer-tax-schema.ts
# ⑬
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/lib/calc/gift-burdened-transfer-api.ts
# ⑭
grep "burdenedGiftDebtRatio" /Users/mynote/workspace/Property-related-Taxes/app/api/calc/stock-transfer/route.ts
```

---

## 5. ⑤ UI 입력 위젯 — StockBurdenedDebtSection 확장

### 5.1 위젯 배치 원칙

계산 로직 순서 = UI 표시 순서 (feedback_ui_order_follows_logic):
1. §47① 채무인수액 (기존, 기존 섹션 상단)
2. §47③ 입증 토글 (기존, hasDebt 조건부)
3. §47③ 안내 문구 (기존)
4. [신규] 양도소득세 함께 계산 토글 (hasDebt 조건부 — 채무 > 0 일 때만 활성)

### 5.2 ToggleCard 진입 조건

```
hasDebt = (item.assumedDebtForGift ?? 0) > 0
hasStockBurdenedTax = item.burdenedGiftTransferTax !== undefined

[신규 ToggleCard]
  checked = hasStockBurdenedTax
  비활성 조건: !hasDebt → disabledReason = "채무인수액을 먼저 입력하세요."
  tone = "amber"
  3-state: undefined=OFF / 객체=ON (feedback_three_state_optional_mode_toggle)
```

OFF 시 `onCheckedChange(false)`:
```ts
set({ burdenedGiftTransferTax: undefined });
```

ON 시 `onCheckedChange(true)`:
```ts
set({ burdenedGiftTransferTax: {
  marketType: undefined,        // 미선택 초기 (RadioCardGroup value="" 허용)
  acquisitionDate: "",
  acquisitionMode: undefined,   // 미선택 초기
  actualAcquisitionPrice: undefined,
  isMajorShareholder: undefined,
} as BurdenedGiftStockTransferInput });
// ★ marketType: undefined 허용 — validation이 필수 차단, fallback 자동 안분 금지
```

### 5.3 ASCII 위젯 스케치

```
┌─ §47① 채무인수액 섹션 (기존) ─────────────────────────────────┐
│  [CurrencyInput] 수증자 인수 채무액 (§47①)            [§47] │
│  [ToggleCard/chip] §47③ 입증 가능  (hasDebt 조건부)          │
│  [안내 문구 amber box]  §47③ 주의 …  (hasDebt 조건부)        │
│                                                               │
│  ┌─ [ToggleCard amber] 양도소득세 함께 계산 ─────────────── │ │
│  │  [hasDebt=false → disabled 회색 오버레이 + 안내]          │ │
│  │                                                          │ │
│  │  ① 시장 구분 ─────────────────────────────────────────  │ │
│  │  [RadioCardGroup amber inline columns=2]                │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐    │ │
│  │  │ KOSPI   │ │ KOSDAQ  │ │ KONEX   │ │ 비상장   │    │ │
│  │  │ 유가증권 │ │ 코스닥  │ │ 코넥스  │ │(unlisted)│    │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────┘    │ │
│  │  testId: stock-bg-market-kospi / -kosdaq / -konex /   │ │
│  │          -unlisted                                      │ │
│  │                                                         │ │
│  │  ② 증여자 취득일 ─────────────────────────────────────  │ │
│  │  [DateInput] §95 보유기간·§157 대주주 판정 기준         │ │
│  │  testId: stock-bg-acquisition-date                     │ │
│  │                                                         │ │
│  │  ③ 취득가액 산정 방식 ─────────────────────────────────  │ │
│  │  [RadioCardGroup amber inline columns=2]               │ │
│  │  ┌──────────────────────┐ ┌───────────────────────┐   │ │
│  │  │ 실지취득가액           │ │ 환산취득가액            │   │ │
│  │  │ (증여자 실제 취득가)   │ │ (§176의2·§165④ 환산)  │   │ │
│  │  └──────────────────────┘ └───────────────────────┘   │ │
│  │  testId: stock-bg-acq-mode-actual / -estimated         │ │
│  │                                                         │ │
│  │  ④ [실지 모드일 때만] 증여자 취득가 합계 ──────────────   │ │
│  │  [FieldCard amber] 증여자 당초 취득가 합계 (안분 前)    │ │
│  │  [CurrencyInput]                                        │ │
│  │  hint: "증여자가 주식을 취득할 때 실제 지불한 전체 금액.  │ │
│  │        채무비율(채무액/평가액)로 자동 안분됩니다."        │ │
│  │  testId: stock-bg-actual-price                         │ │
│  │                                                         │ │
│  │  ⑤ [상장(kospi/kosdaq/konex)일 때만] 대주주 여부 ──────  │ │
│  │  [ToggleCard amber size="sm"]                           │ │
│  │  title: "대주주 (§157 시가총액 50억 이상 또는 지분율)"    │ │
│  │  description: "§104①11가목 누진세율 적용. 소액주주도      │ │
│  │    부담부증여(장외양도)는 §94①3가목2로 과세됨."           │ │
│  │  checked: item.burdenedGiftTransferTax               │ │
│  │           ?.isMajorShareholder ?? false                │ │
│  │  testId: stock-bg-major-shareholder                    │ │
│  └─────────────────────────────────────────────────────── ┘ │
└───────────────────────────────────────────────────────────────┘
```

### 5.4 조건부 렌더 규칙

| 조건 | 노출 필드 |
|------|---------|
| 항상(토글 ON 시) | ① 시장 구분 RadioCardGroup |
| 항상(토글 ON 시) | ② 증여자 취득일 DateInput |
| 항상(토글 ON 시) | ③ 취득가액 산정 방식 RadioCardGroup |
| acquisitionMode === "actual" | ④ 증여자 취득가 합계 CurrencyInput |
| marketType in ["kospi","kosdaq","konex"] | ⑤ 대주주 여부 ToggleCard |
| marketType === "unlisted" | ⑤ 미노출 (비상장은 항상 과세, 소액주주 구분 불필요) |

### 5.5 상세 구현 지침

**RadioCardGroup name 설정 주의** (E2E 함정 — PR#127, project_gift_stock_burdened_debt.md):
- `name` prop은 해당 주식 자산 id 포함: `name={\`stock-bg-market-${item.id}\`}`
- 동일 페이지에 복수 주식 자산 존재 시 name 충돌 방지
- 테스트에서 `getByRole("radio", { name: "KOSPI 유가증권" })` 오매칭 위험 → `data-testid` 셀렉터 우선

**testId 규칙**: `stock-bg-{필드명}-{item.id}` 패턴. E2E에서 `page.getByTestId("stock-bg-market-kospi")` 대신 `page.locator('[data-testid="stock-bg-market-kospi"]')` 사용.

**isMajorShareholder 3중 패턴**:
- store default: `undefined`
- UI display fallback: `?? false`
- API 변환: `bgt.isMajorShareholder ?? false`
- validate: `undefined` 허용 (false로 처리)

**acquisitionMode 미선택 시**: `undefined` 상태로 유지. validation이 필수 차단. RadioCardGroup `value={bgt.acquisitionMode ?? ""}` 로 빈값 허용.

---

## 6. ④ API 변환 — buildGiftStockBurdenedTransferBody

`lib/calc/gift-burdened-transfer-api.ts` 하단에 추가 (기존 부동산 함수와 동일 파일).

### 6.1 함수 시그니처

```ts
export function buildGiftStockBurdenedTransferBody(
  stockItem: EstateItem,  // burdenedGiftTransferTax !== undefined 검증 후 호출
  form: FormState,
  valuationAmount: number,  // computeEffectiveValuation(stockItem, form.giftDate) 결과
): Record<string, unknown>

export async function callGiftStockBurdenedTransferAPI(
  stockItem: EstateItem,
  form: FormState,
  valuationAmount: number,
): Promise<StockTransferResult>
// POST /api/calc/stock-transfer
```

### 6.2 §159 안분 알고리즘 (클라이언트)

```
bgt = stockItem.burdenedGiftTransferTax  // BurdenedGiftStockTransferInput

양도가액 = assumedDebtForGift              // 단일 자산: C=A → 양도가액=B
debtRatio = assumedDebtForGift / valuationAmount  // = B/C

실지(actual) 모드:
  안분취득가 = Math.floor(bgt.actualAcquisitionPrice × debtRatio)
  shareCount = stockItem.listedStockShares (상장) or 비상장 주식수
  perShareAcquisitionPrice = Math.floor(안분취득가 / shareCount)
  → 엔진: acquisitionMode="actual", perShareAcquisitionPrice 주입

환산 + 상장(§176의2②1호):
  burdenedGiftDebtRatio 미전달
  → 엔진: transferPrice=B 기반 자동 안분

환산 + 비상장(§165④ 보충평가):
  burdenedGiftDebtRatio = debtRatio
  → 엔진 STEP3 후처리 (acquisitionPrice × ratio)
```

### 6.3 필드 1:1 매핑 요약 (엔진 설계서 전체 표 참조)

| 엔진 필드 | 클라이언트 출처 | 주의 |
|---------|--------------|------|
| `marketType` | `bgt.marketType` | 그대로 |
| `transferTotalPrice` | `stockItem.assumedDebtForGift` | = §159 양도가액 |
| `acquisitionMode` | `bgt.acquisitionMode` | "actual" 또는 "estimated" |
| `perShareAcquisitionPrice` | `Math.floor(안분액/shareCount)` | actual 모드만 |
| `acquisitionDate` | `bgt.acquisitionDate` | toDate 변환 필수 |
| `isMajorShareholder` | `bgt.isMajorShareholder ?? false` | |
| `isOnMarketTransaction` | `false` 고정 | 부담부=장외양도 §94①3가목2 |
| `burdenedGiftDebtRatio` | `assumedDebtForGift / valuationAmount` | 비상장 estimated만 |
| `expenseMode` | acquisitionMode 종속 | estimated → "estimated" / actual → "actual" |

valuationAmount 출처: `computeEffectiveValuation(stockItem, form.giftDate)` (`lib/calc/estate-item-valuation.ts:23`) — form 단계 순수함수, result 불요, dual-truth 아님.

---

## 7. 오케스트레이션 변경 — GiftTaxForm.tsx

### 7.1 신규 상태

```ts
// GiftTaxForm.tsx — useState 추가 (53~56행 영역)
const [stockTransferTaxResults, setStockTransferTaxResults] =
  useState<StockTransferResult[]>([]);
```

### 7.2 계산 루프 추가 (기존 부동산 루프 직후)

```
기존 부동산 루프(165행):
  form.giftItems.filter(it => it.burdenedGiftTransferTax !== undefined)
  → callGiftBurdenedTransferAPI → transferTaxResults

신규 주식 루프 (165행 아래, 부동산 루프 완료 후):
  const stockBurdenedItems = form.stockItems.filter(
    it => it.burdenedGiftTransferTax !== undefined
  );
  if (stockBurdenedItems.length > 0) {
    const stockResults: StockTransferResult[] = [];
    const stockErrors: string[] = [];
    for (const item of stockBurdenedItems) {
      const valuationAmount = computeEffectiveValuation(item, form.giftDate);
      const result = await callGiftStockBurdenedTransferAPI(
        item, form, valuationAmount
      );
      stockResults.push(result);
    }
    setStockTransferTaxResults(stockResults);
    // 에러 처리: 기존 부동산 패턴과 동일 (setTransferTaxError 확장 또는 별도 state)
  } else {
    setStockTransferTaxResults([]);
  }
```

### 7.3 handleReset 추가

```ts
setStockTransferTaxResults([]);
```

### 7.4 GiftTaxResultView 전달

```tsx
<GiftTaxResultView
  ...
  transferTaxResults={transferTaxResults}
  stockTransferTaxResults={stockTransferTaxResults}  // 신규
  ...
/>
```

---

## 8. ⑦ 결과 카드 — GiftTaxResultView 변경

### 8.1 Props 인터페이스 확장

```ts
// GiftTaxResultView.tsx Props(141~190행) 에 추가:
/** 주식 부담부증여 양도소득세 결과 — burdenedGiftTransferTax ON 주식 자산 순서 */
stockTransferTaxResults?: StockTransferResult[];
```

함수 시그니처:
```ts
export function GiftTaxResultView({
  ...
  stockTransferTaxResults = [],
}: Props)
```

### 8.2 availablePrintIds useMemo 확대 (295·297행)

```ts
// 295행 (기존):
if (transferTaxResults.length > 0) s.add("burdened-transfer-tax");
// 신규 추가:
if (stockTransferTaxResults.length > 0) s.add("burdened-stock-transfer-tax");

// 297행 (기존):
if (simpleGiftResult != null && transferTaxResults.length > 0 && !transferTaxError)
// 변경:
if (simpleGiftResult != null &&
    (transferTaxResults.length > 0 || stockTransferTaxResults.length > 0) &&
    !transferTaxError)
  s.add("burdened-gift-comparison");
```

### 8.3 렌더 게이트 확대 (509·517행)

```tsx
{/* 부동산 부담부 양도소득세 — 기존 게이트 유지 */}
{transferTaxResults.length > 0 && (
  <PrintSection id="burdened-transfer-tax" selectedIds={selectedPrintIds}>
    <BurdenedTransferTaxResultCard transferTaxResults={transferTaxResults} />
  </PrintSection>
)}

{/* 주식 부담부 양도소득세 — 신규 */}
{stockTransferTaxResults.length > 0 && (
  <PrintSection id="burdened-stock-transfer-tax" selectedIds={selectedPrintIds}>
    <BurdenedStockTransferTaxResultCard
      stockTransferTaxResults={stockTransferTaxResults}
    />
  </PrintSection>
)}

{/* 세부담 비교 카드 — 게이트 확대 (517행) */}
{simpleGiftResult != null &&
  (transferTaxResults.length > 0 || stockTransferTaxResults.length > 0) &&
  !transferTaxError && (
    <PrintSection id="burdened-gift-comparison" selectedIds={selectedPrintIds}>
      <BurdenedGiftComparisonCard
        simpleGiftResult={simpleGiftResult}
        giftResult={result}
        transferTaxResults={transferTaxResults}
        stockTransferTaxResults={stockTransferTaxResults}  // 신규 4번째 인자
        hasUncoveredDebtAsset={...}
      />
    </PrintSection>
  )}
```

### 8.4 BurdenedStockTransferTaxResultCard (신규 컴포넌트)

위치: `components/calc/results/BurdenedStockTransferTaxResultCard.tsx`

**재사용 원칙 (F10)**: `StockTransferTaxResultView`는 주식양도세 마법사 전용 Props(
`shareCount`, `filingViolation`, `isFraudulent` 등 복수 form 의존 필드)가 많아 직접 재사용 어려움. 대신:

- 산식 헬퍼 `fmt`, `ResultRow`, `ProgressiveTaxBreakdown` 등(`StockTransferTaxResultViewHelpers.tsx`) import 재사용
- Shell은 `BurdenedTransferTaxResultCard.tsx` 패턴 동형으로 신규 작성 (경량 산식 카드)
- 800줄 이하 유지

```tsx
/**
 * BurdenedStockTransferTaxResultCard — 주식 부담부증여 양도소득세 결과 카드 (⑦)
 *
 * StockTransferResult 배열을 받아 자산별 결과를 표시.
 * BurdenedTransferTaxResultCard(부동산)과 동형 패턴.
 *
 * 결과 산식 한국어 풀어쓰기:
 *   양도가액 = 채무인수액 (소령 §159①: 평가액 × 채무액/증여가액, 단일 자산 C=A → 양도가액=B)
 *   취득가액 = 당초취득가 × (채무액/평가액)  [실지 모드]
 *            = 환산취득가 × (채무액/평가액)  [환산 비상장 모드, 엔진 후처리]
 *            = 전환기준시가 × 취득기준시가/양도기준시가 [환산 상장 모드, 자동 안분]
 *   필요경비 = 개산공제 1%  [환산 모드]
 *   양도소득금액 = 양도가액 − 취득가액 − 필요경비
 *   양도소득 기본공제 = 2,500,000원 (§103② 그룹 2)
 *   과세표준 = 양도소득금액 − 기본공제
 *   산출세액 = 과세표준 × 세율 (§104①11, 비상장 중소 10% / 비중소 20% / 대주주 누진)
 *   지방소득세 = 산출세액 × 10% (10원 미만 절사)
 *   합계 = 산출세액 + 지방소득세
 */
```

산식 표시 필드 목록 (StockTransferResult 필드 기준):
- `transferPrice` — 양도가액 (= 채무인수액)
- `acquisitionPrice` — 취득가액 (안분 후)
- `expenses` — 필요경비
- `transferIncome` — 양도소득금액
- `basicDeduction` — 기본공제
- `taxBase` — 과세표준
- `taxRate` — 세율
- `calculatedTax` — 산출세액
- `finalTax` — 결정세액
- `localIncomeTax` — 지방소득세
- 합계: `finalTax + localIncomeTax`

**"원" 접미사 생략** (feedback_no_won_suffix). 내부 id 노출 금지 (feedback_no_internal_id_in_result).

### 8.5 gift-print-sections.ts 추가

```ts
// lib/print/gift-print-sections.ts — GiftPrintSectionId union에 추가
| "burdened-stock-transfer-tax"

// GIFT_PRINT_SECTIONS 배열에 추가
{ id: "burdened-stock-transfer-tax",
  label: "주식 부담부증여 양도소득세 (증여자)",
  channel: SCREEN }
```

---

## 9. 세부담 비교 합산 확대 (D1)

### 9.1 computeBurdenedGiftComparison 4-인자 확대

```ts
// lib/calc/gift-burden-comparison.ts
export function computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
  stockTransferTaxResults: StockTransferResult[] = [],  // 신규 4번째 (default [])
): BurdenedGiftComparisonResult {
  const simpleGiftTax = simpleGiftResult.finalTax;
  const burdenedGiftTax = giftResult.finalTax;
  // 부동산 합계 (기존)
  const burdenedTransferTax = transferTaxResults.reduce((s, t) => s + t.totalTax, 0)
  // 주식 합계 (신규) — totalTax 필드 없음(F2), finalTax+localIncomeTax
  + stockTransferTaxResults.reduce((s, r) => s + r.finalTax + r.localIncomeTax, 0);
  const burdenedTotal = burdenedGiftTax + burdenedTransferTax;
  const taxBurdenDiff = simpleGiftTax - burdenedTotal;
  return { simpleGiftTax, burdenedGiftTax, burdenedTransferTax, burdenedTotal, taxBurdenDiff };
}
```

### 9.2 caller 2지점 변경

1. `BurdenedGiftComparisonCard.tsx:33` — props에 `stockTransferTaxResults` 추가 + 호출부 4-인자.
2. `GiftTaxResultView.tsx` — `stockTransferTaxResults={stockTransferTaxResults}` 전달.

```ts
// BurdenedGiftComparisonCard Props 인터페이스 추가
stockTransferTaxResults?: StockTransferResult[];
// 호출:
const cmp = computeBurdenedGiftComparison(
  simpleGiftResult, giftResult, transferTaxResults, stockTransferTaxResults ?? []
);
```

---

## 10. ⑧ Validation 동기화 — validateStep

`components/calc/gift-tax-form-shared.tsx` validateStep 함수, step === 1 블록에 추가 (391행 이후, 부동산 부담부 블록 종료 직후).

### 10.1 주식 부담부증여 양도세 검증 블록

```ts
// ─── 주식 부담부증여 양도소득세 검증 (⑧) ───────────────────────
// 자동 안분 fallback 금지: 미입력 = 명시적 오류
const stockBgItems = form.stockItems.filter(
  it => it.burdenedGiftTransferTax !== undefined
);

// MVP: 주식 부담부 다건 동시 차단
if (stockBgItems.length > 1) {
  return "주식 양도소득세 함께 계산은 자산 1건에만 켤 수 있습니다.";
}

if (stockBgItems.length === 1) {
  const stockItem = stockBgItems[0];
  const bgt = stockItem.burdenedGiftTransferTax!;
  const itemLabel = stockItem.name.trim() || "주식 자산";

  // C-S1: 채무인수액 필수
  const assumedDebt = stockItem.assumedDebtForGift ?? 0;
  if (assumedDebt <= 0) {
    return `${itemLabel}: 수증자 인수 채무액을 입력하세요. 채무인수가 있어야 양도소득세가 발생합니다.`;
  }

  // C-S2: 시장 구분 필수
  if (!bgt.marketType) {
    return `${itemLabel}: 시장 구분을 선택하세요. (KOSPI/KOSDAQ/KONEX/비상장)`;
  }

  // C-S3: 취득일 필수 (§95 보유기간·§157 대주주 판정)
  if (!bgt.acquisitionDate) {
    return `${itemLabel}: 증여자 취득일을 입력하세요. (양도소득세 계산 필수)`;
  }

  // C-S4: 취득가액 산정 방식 필수
  if (!bgt.acquisitionMode) {
    return `${itemLabel}: 취득가액 산정방식(실지/환산)을 선택하세요.`;
  }

  // C-S5: 실지 모드 — 증여자 취득가 합계 필수
  if (bgt.acquisitionMode === "actual") {
    if (!bgt.actualAcquisitionPrice || bgt.actualAcquisitionPrice <= 0) {
      return `${itemLabel}: 증여자 당초 취득가 합계를 입력하세요. (실지취득가액 모드 필수)`;
    }
  }
  // 환산 모드: actualAcquisitionPrice 불요 (엔진이 §176의2 또는 §165④ 자동 산출)
}
// ─── end 주식 부담부증여 양도소득세 ───────────────────────────
```

### 10.2 UI/validate 동기화 확인표

| 필드 | UI 필수 여부 | validate 필수 여부 | fallback | 동기 |
|------|------------|-----------------|---------|------|
| `marketType` | 필수 선택 | C-S2 오류 차단 | 없음 | O |
| `acquisitionDate` | 필수 | C-S3 오류 차단 | 없음 (autoFallback 금지) | O |
| `acquisitionMode` | 필수 선택 | C-S4 오류 차단 | 없음 | O |
| `actualAcquisitionPrice` | actual 모드만 필수 | C-S5 actual 모드만 | 없음 | O |
| `isMajorShareholder` | 상장만 노출, 선택 | 불필요 (undefined=false) | `?? false` 3중 | O |

---

## 11. 케이스 매트릭스 (UI 관점)

| # | 케이스 | 노출 입력 필드 | 결과 카드 | 비교 카드 |
|---|--------|------------|---------|---------|
| S-01 | 비상장 실지 | ①②③④ | BurdenedStockTransferTaxResultCard | O |
| S-02 | 비상장 환산 | ①②③ (④없음) | 동상 + §165④ 보충평가 안내 | O |
| S-03 | 상장 대주주 실지 | ①②③④⑤(ON) | 동상 | O |
| S-04 | 상장 소액주주 실지 | ①②③④⑤(OFF) | 동상 (과세, 장외) | O |
| S-05 | 상장 환산 | ①②③⑤ | 동상 | O |
| S-06 | 채무 >= 취득가 | ①②③④⑤ | taxBase=0 산출 카드 | O |
| S-07 | 토글 OFF | 없음 (안내 문구만) | 미렌더 | 미렌더 |
| S-08 | 부동산+주식 혼재 | 각자 독립 섹션 | 양쪽 카드 모두 | 합산 비교 |

---

## 12. E2E 명세

### 12.1 환경

```
worktree: feat/gift-stock-burdened-transfer
DEV 서버: npm run dev 포트 3004
E2E 포트: E2E_PORT=3104 (feedback_e2e_worktree_port_isolation)
실행: E2E_PORT=3104 npx playwright test e2e/gift-stock-burdened-transfer.spec.ts
```

### 12.2 E2E 시나리오

```ts
// e2e/gift-stock-burdened-transfer.spec.ts

describe("S-01: 비상장 주식 부담부증여 + 실지 취득가", () => {
  test("양도세 토글 ON → 필수 입력 → 계산 → 결과 카드 렌더", async () => {
    // 1. 증여 마법사 진입 → Step1 주식 자산 추가 (비상장)
    // 2. 주식 카드에서 §47① 채무인수액 입력
    // 3. "양도소득세 함께 계산" ToggleCard ON
    // 4. 시장 구분: 비상장 선택 (data-testid="stock-bg-market-unlisted")
    // 5. 취득일 입력 (DateInput)
    // 6. 취득가액 방식: 실지 선택 (data-testid="stock-bg-acq-mode-actual")
    // 7. 취득가 합계 입력 (data-testid="stock-bg-actual-price")
    // 8. 계산 버튼 클릭 → 모달 닫기 (backdrop 클릭)
    // 9. 결과: "주식 부담부증여 양도소득세" 카드 노출 확인
    // 10. 비교 카드 노출 확인
  });
});

describe("S-07: 토글 OFF — 계산 미발생", () => {
  test("양도세 토글 OFF 상태에서 계산 시 주식 결과 카드 미노출", async () => {
    // 채무 입력 후 양도세 토글 OFF → 계산 → 결과에 burdened-stock-transfer-tax 미존재
  });
});

describe("S-04: 상장 소액주주 과세 확인", () => {
  test("isMajorShareholder=false + 상장 → 과세 결과 카드 렌더 (비과세 아님)", async () => {
    // 시장: KOSPI, 대주주 토글 OFF, 계산 → 세액 > 0 확인
  });
});
```

### 12.3 E2E 셀렉터 주의

- RadioCardGroup은 `data-testid` 우선 (`getByRole` accessible-name 오매칭 위험)
- 주식 모달 닫기: backdrop 클릭 패턴 (PR#127 함정: `closeStockModal(backdrop)`)
- 계산 버튼 클릭 전 모달이 열려 있으면 backdrop 닫기 후 계산

---

## 13. 결과 카드 산식 표시 예시

```
주식 부담부증여 양도소득세 (소득세법 §88·소령 §159)
────────────────────────────────────────────────────

자산명: OO바이오텍 (비상장)
시장: 비상장  |  취득방식: 실지취득가액

양도가액    400,000,000
  (채무인수액 = 소령 §159① 평가액 × 채무액 / 증여가액)
취득가액  △  80,000,000
  (당초취득가 × 채무비율)
필요경비  △         0
────────────────
양도소득금액   320,000,000
기본공제   △   2,500,000
────────────────
과세표준    317,500,000
세율              20%
산출세액     63,500,000
지방소득세    6,350,000
────────────────────────
합계        69,850,000
```

(숫자는 anchor-1 수기산출 기준 예시. Do 시 실측으로 확정 후 테스트 toBe() 고정.)

---

## 14. 3대 정책 최종 점검

### 14.1 useEffect store 미러링 금지

본 설계 어디에도 `useEffect(() => set({ ... }), [marketType])` 패턴 없음.
- marketType 변경 → isMajorShareholder 섹션 조건부 렌더는 `bgt.marketType` 직접 참조로 파생 (useMemo/조건식). store 미러링 없음.
- acquisitionMode 변경 → actualAcquisitionPrice 섹션 조건부 렌더 동일.

### 14.2 자동 안분 fallback 금지

- `marketType` 미선택 → validation C-S2 오류 (자동 기본값 없음)
- `acquisitionDate` 미입력 → validation C-S3 오류
- `actualAcquisitionPrice` 미입력 (actual 모드) → validation C-S5 오류
- 엔진 `burdenedGiftDebtRatio`는 비상장 estimated에만 적용. actual 모드는 클라이언트 안분값 주입.

### 14.3 validation 8번째 동기화

| UI 동작 | API 변환 | validate ⑧ |
|---------|---------|------------|
| marketType 없이 계산 불가 | 변환 전 validate 차단 | C-S2 동일 차단 |
| acquisitionDate 없이 계산 불가 | `toDate` 호출 → 오류 | C-S3 동일 차단 |
| actual 모드 취득가 없이 계산 불가 | B/C 안분 불가 → 차단 | C-S5 동일 차단 |
| isMajorShareholder 미선택 | `?? false` fallback | validate 통과 (`?? false` 동일) |

---

## 15. 파일 변경 목록 요약 (Do 구현 대상)

| 파일 | 변경 유형 | 주요 내용 |
|------|--------|---------|
| `lib/tax-engine/types/inheritance-gift.types.ts` 또는 gift types | 신규 타입 | `BurdenedGiftStockTransferInput` 인터페이스 |
| `lib/calc/gift-burdened-transfer-api.ts` | 함수 추가 | `buildGiftStockBurdenedTransferBody` + `callGiftStockBurdenedTransferAPI` |
| `lib/calc/gift-burden-comparison.ts` | 함수 확장 | 4번째 인자 `stockTransferTaxResults` |
| `lib/print/gift-print-sections.ts` | 상수 추가 | `"burdened-stock-transfer-tax"` ID |
| `lib/api/stock-transfer-tax-schema.ts` | schema 추가 | `burdenedGiftDebtRatio: z.number().min(0).max(1).optional()` |
| `app/api/calc/stock-transfer/route.ts` | buildEngineInput 추가 | `burdenedGiftDebtRatio` 매핑 |
| `components/calc/gift/StockBurdenedDebtSection.tsx` | 섹션 추가 | 양도세 토글 섹션 (⑤) |
| `components/calc/gift-tax-form-shared.tsx` | validateStep 추가 | 주식 부담부 검증 블록 (C-S1~C-S5) |
| `components/calc/GiftTaxForm.tsx` | 루프 추가 | stockBurdenedItems 루프 + stockTransferTaxResults 상태 |
| `components/calc/results/GiftTaxResultView.tsx` | Props·렌더 확대 | stockTransferTaxResults prop + 렌더 게이트 4지점 |
| `components/calc/results/BurdenedGiftComparisonCard.tsx` | 4-인자 확대 | Props + 호출부 |
| `components/calc/results/BurdenedStockTransferTaxResultCard.tsx` | 신규 컴포넌트 | 주식 결과 카드 (F10 경량 shell) |

---

## 16. Pre-Do Checklist

Do 진입 전 반드시 수행:

- [ ] Pre-Do anchor-1 (S-01 비상장 실지): 수기산출 → stock 엔진 호출 → finalTax toBe() 고정
- [ ] Pre-Do anchor-2 (S-02 비상장 환산): burdenedGiftDebtRatio 없이 음수 양도차익 실측 → 후처리 필요성 확정
- [ ] Pre-Do anchor-3 (S-05 상장 환산): transferPrice=B 기반 자동 안분 acquisitionPrice 실측
- [ ] Pre-Do anchor-4 (S-04 상장 소액주주): isExempt=false 확인 (비과세 아님)
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 기존 회귀 0건 확인 후 Do 진입
