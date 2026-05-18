# 주식 양도소득세 — 양도가액 합계 직접 입력 모드 UI 설계 문서

> 작성일: 2026-05-18
> 기반 계획서: `docs/00-pm/stock-transfer-actual-total-input.plan.md` v2
> 담당: stock-transfer-tax-ui-senior
> 엔진 설계 참조: `docs/02-design/features/stock-transfer-actual-total-input.engine.design.md` (엔진 시니어 작성 예정)

---

## 1. 사용자 시나리오 (3종)

### S-1. per_share 입력 (현행 회귀 — 변경 없음)

비상장 주식을 1주당 50,000원에 5,000주 양도한 사용자가 Step2 양도가액 섹션에 진입.

- 양도가액 방식: "실가" 선택됨
- **서브 입력 방식**: "1주당 단가" (default) 선택 상태
- 기존 CurrencyInput에 "50,000" 입력
- 화면 하단 emerald 박스에 `50,000 × 5,000주 = 250,000,000` 합계 미리보기 표시
- 사이드바 양도가액: 250,000,000 즉시 반영

### S-2. total 입력 (신규)

계약서에 총액 250,000,001원으로만 기재된 비상장 양수도 건을 입력하려는 사용자.

- 양도가액 방식: "실가" 선택
- **서브 입력 방식**: "합계 직접 입력" 클릭
- 양도가액 합계 CurrencyInput에 "250,000,001" 입력
- 화면 하단 slate 박스에 역산 단가 `250,000,001 ÷ 5,000주 = 50,000.0002 (정확히 떨어지지 않음 — 총액 그대로 사용)` 표시
- 사이드바 양도가액: 250,000,001 즉시 반영
- 결과 화면 CalculationStep 산식: "양도가액 합계 직접 입력 = 250,000,001 (참고: 1주당 50,000.0002원)"

### S-3. 분할 모드 진입 시 total 옵션 차단

Step1에서 lotsMode를 "split"으로 설정한 후 Step2 진입.

- 서브 입력 방식 라디오에서 "합계 직접 입력" 옵션이 **disabled** 상태로 표시
- disabled 옵션 description: `"분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"`
- 사용자가 클릭해도 반응 없음 (option 자체 disabled — 별도 토스트 불필요)
- 기존 "양도가액·취득가액은 Step1의 lot 입력에서 자동 산출됩니다" 안내 배너 유지

---

## 2. UI 명세 — Step2 양도가액 섹션 신규 구조

### 2.1 전체 트리

```
① 양도가액
└ FieldCard label="양도가액 방식"
  └ RadioCardGroup name="transferPriceMode" tone="emerald" layout="inline"
      ├ option: value="actual"   label="실가"
      └ option: value="exchange" label="교환 (PR-2)"

  [transferPriceMode === "actual"]
  └ FieldCard label="입력 방식"                       ← 신규 (inline 서브 라디오)
    └ RadioCardGroup name="transferActualInputMode" tone="emerald" layout="inline"
        ├ option: value="per_share" label="1주당 단가"
        │           description="1주당 양도가액 × 주식수"
        └ option: value="total"    label="합계 직접 입력"
                    description="양도가액 총액을 원 단위로 직접 입력"
                    [lotsMode === "split"] disabled=true
                      disabledReason="분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"

  [transferActualInputMode === "per_share" (or default)]
  ├ CurrencyInput label="1주당 양도가액" required disabled={isSplitMode}
  │   hint={isSplitMode ? "분할 모드에서는 매도 lot에서 자동 산출됩니다 (Step1 참조)" : "실제 거래 가격 (원)"}
  └ [transferTotal > 0] emerald 박스: "양도가액 합계: X × Y주 = Z" (현행 유지)

  [transferActualInputMode === "total"]
  ├ CurrencyInput label="양도가액 합계" required
  │   hint="계약서·등기부 등에 기재된 총 양도대금 (원)"
  │   placeholder 없음 (숫자 예시 금지)
  └ [역산 단가 표시] slate 박스: 분기 표시 (§2.3)

  [transferPriceMode === "exchange"] — 무변경 (현행 유지)
```

### 2.2 RadioCardGroup 옵션 명세 (신규 서브 라디오)

```tsx
<FieldCard label="입력 방식">
  <RadioCardGroup
    name="transferActualInputMode"
    value={transferActualInputMode}
    onChange={(v) => onChange({ transferActualInputMode: v as "per_share" | "total" })}
    tone="emerald"
    layout="inline"
    options={[
      {
        value: "per_share",
        label: "1주당 단가",
        description: "1주당 양도가액 × 주식수",
      },
      {
        value: "total",
        label: "합계 직접 입력",
        description: isSplitMode
          ? "분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"
          : "양도가액 총액을 원 단위로 직접 입력",
        disabled: isSplitMode,
      },
    ]}
  />
</FieldCard>
```

**tone 근거**: 양도시점 정보 → emerald (계획서 §5.2 / CLAUDE.md tone 매핑 준수)

**layout**: "inline" — 2개 옵션이라 가로 나열이 자연스러움. 기존 양도가액 방식 라디오와 동일 레이아웃.

### 2.3 역산 단가 표시 박스 (total 모드)

1주당 단가가 정확히 떨어지는 경우와 그렇지 않은 경우를 tone으로 구분:

```
[정확히 떨어지는 경우 — 소수점 4자리 이하 0]
bg-emerald-50/60 border border-emerald-200 text-emerald-700
"참고: 1주당 단가 = 50,000 (250,000,000 ÷ 5,000주)"

[정확히 떨어지지 않는 경우]
bg-slate-50/60 border border-slate-200 text-slate-600
"참고: 1주당 단가 = 50,000.0002 (250,000,001 ÷ 5,000주) — 정확히 떨어지지 않음. 총액 그대로 사용합니다."
```

**계산 방식**: `useMemo` 사용. `parseAmount(form.transferTotalPrice) / parseInt(form.shareCount || "0", 10)`. shareCount = 0이면 표시 안 함.

**정확히 떨어짐 판정**: 소수점 4자리(`.toFixed(4)`) 표현이 `.0000`으로 끝나는 경우.

**표시 전용**: 이 값은 절대 폼 필드로 미러링하지 않음 (`feedback_useeffect_store_mirror_forbidden` 정책).

### 2.4 파일 내 추가 위치 및 줄 수 예상

| 위치 | 변경 내용 | 예상 줄 수 |
|---|---|---|
| `Step2.tsx:36-39` — 변수 선언 블록 | `transferActualInputMode` 파생 변수 추가 | +2줄 |
| `Step2.tsx:41-47` — transferTotal useMemo | 분기 없음 (per_share 모드 전용으로 조건부 계산) | ±0줄 |
| `Step2.tsx:42-47` — useMemo 직후 | `reversedPerShare` useMemo 신규 추가 | +8줄 |
| `Step2.tsx:91-111` — 실가 actual 블록 내부 | 서브 라디오 + 분기 CurrencyInput 2개 | +35줄 |
| **합계** | | **+45줄** (800줄 정책 여유 확인 필요) |

**800줄 정책 점검**: 현재 Step2.tsx 줄 수를 Do 단계 시작 전 grep으로 확인 후, 초과 예상 시 `ActualTransferPriceBlock.tsx` 분리.

---

## 3. 케이스 인벤토리 표

| ID | lotsMode | transferPriceMode | transferActualInputMode | 표시 위젯 | 사이드바 양도가액 | 비고 |
|---|---|---|---|---|---|---|
| U-1 | single | actual | per_share (default) | 1주당 CurrencyInput + emerald 합계 박스 | `perShare × count` | 현행 회귀 |
| U-2 | single | actual | total | 합계 CurrencyInput + slate 역산 단가 박스 | `transferTotalPrice` | 신규 |
| U-3 | split | actual | per_share (강제) | total 옵션 disabled + reason 표시 | lot 합계 (현행) | 분할 모드 차단 |
| U-4 | single | exchange | (서브 라디오 미노출) | 부동산·채무·현금 3필드 | property+debt+cash | 무관 — 무변경 |
| U-5 | single | actual | (legacy sessionStorage — undefined) | normalize → "per_share" 자동 fallback | `perShare × count` | sessionStorage 마이그 |
| U-6 | split | actual | total (UI 차단 후 Zod 방어선) | UI disabled + Zod refine 이중 차단 | — | 방어 케이스 |

---

## 4. 14지점 동기화 매트릭스 (UI 책임 ①②③⑤⑥)

### ① FormData 타입 — `lib/stores/calc-wizard-stock-store.ts:113` 부근

변경 전:
```ts
// ── 양도가액 ──
transferPriceMode: "actual" | "exchange";
perShareTransferPrice: string;
exchangePropertyValue: string;
exchangeDebtRelief: string;
exchangeCash: string;
```

변경 후 (2필드 추가):
```ts
// ── 양도가액 ──
transferPriceMode: "actual" | "exchange";
transferActualInputMode: "per_share" | "total";  // 신규: 3중 패턴 default "per_share"
transferTotalPrice: string;                       // 신규: 원 (raw string)
perShareTransferPrice: string;
exchangePropertyValue: string;
exchangeDebtRelief: string;
exchangeCash: string;
```

**삽입 위치**: `transferPriceMode` 정의 직후 (L113~L114 사이).

### ② INITIAL_FORM_DATA — `createInitialStockFormData():210` 부근

변경 전:
```ts
transferPriceMode: "actual",         // 3중 패턴 default
perShareTransferPrice: "",
```

변경 후:
```ts
transferPriceMode: "actual",          // 3중 패턴 default
transferActualInputMode: "per_share", // 3중 패턴 default ← 신규
transferTotalPrice: "",               //                  ← 신규
perShareTransferPrice: "",
```

**삽입 위치**: `transferPriceMode: "actual"` 다음 라인.

### ③ normalize — `normalizeStockFormData():319` 부근

변경 전:
```ts
transferPriceMode: enumField("transferPriceMode", ["actual", "exchange"], defaults.transferPriceMode),
perShareTransferPrice: strField("perShareTransferPrice"),
```

변경 후:
```ts
transferPriceMode: enumField("transferPriceMode", ["actual", "exchange"], defaults.transferPriceMode),
transferActualInputMode: enumField("transferActualInputMode", ["per_share", "total"], "per_share"), // 신규
transferTotalPrice: strField("transferTotalPrice"),  // 신규
perShareTransferPrice: strField("perShareTransferPrice"),
```

**정책 준수**: `enumField("transferActualInputMode", ["per_share", "total"], "per_share")` — legacy 폼에 필드가 없으면 자동으로 "per_share" default 적용. 별도 마이그레이션 스크립트 불필요.

### ④ API 변환 — `lib/calc/stock-transfer-tax-api.ts:97-110` (엔진 시니어 담당)

UI 시니어 참조용 설계:

```ts
// ── 양도가액 ──
body.transferPriceMode = transferPriceMode;        // 3중 패턴 default: "actual"
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
  // exchange — 무변경 (기존 L104~109)
}
```

**이중 stripping 방지**: total 모드 시 `perShareTransferPrice`를 body에 포함하지 않고, per_share 모드 시 `transferTotalPrice`를 body에 포함하지 않아 cross-mode silent overwrite를 원천 차단.

### ⑤ UI 위젯 — `app/calc/stock-transfer-tax/steps/Step2.tsx:91-111`

구현 코드 (실 구현 시 이 코드 기준):

```tsx
// Step2.tsx — 변수 선언 블록 (L36~39 확장)
const transferActualInputMode = form.transferActualInputMode || "per_share"; // 3중 패턴 default

// useMemo — 역산 단가 (total 모드)
const reversedPerShare = useMemo(() => {
  const total = parseAmount(form.transferTotalPrice);
  const count = parseInt(form.shareCount || "0", 10);
  if (total <= 0 || count <= 0) return null;
  const perShare = total / count;
  const isExact = parseFloat(perShare.toFixed(4)) === Math.floor(perShare);
  return { perShare, isExact, total, count };
}, [form.transferTotalPrice, form.shareCount]);

// JSX — 실가 actual 블록 내부 (L92~111 교체)
{transferPriceMode === "actual" && (
  <div className="space-y-3">
    {/* 서브 입력 방식 (신규) */}
    <FieldCard label="입력 방식">
      <RadioCardGroup
        name="transferActualInputMode"
        value={transferActualInputMode}
        onChange={(v) => onChange({ transferActualInputMode: v as "per_share" | "total" })}
        tone="emerald"
        layout="inline"
        options={[
          {
            value: "per_share",
            label: "1주당 단가",
            description: "1주당 양도가액 × 주식수",
          },
          {
            value: "total",
            label: "합계 직접 입력",
            description: isSplitMode
              ? "분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"
              : "양도가액 총액을 원 단위로 직접 입력",
            disabled: isSplitMode,
          },
        ]}
      />
    </FieldCard>

    {/* per_share 분기 (현행 유지) */}
    {transferActualInputMode === "per_share" && (
      <>
        <CurrencyInput
          label="1주당 양도가액"
          required
          disabled={isSplitMode}
          hint={isSplitMode ? "분할 모드에서는 매도 lot에서 자동 산출됩니다 (Step1 참조)" : "실제 거래 가격 (원)"}
          value={form.perShareTransferPrice}
          onChange={(v) => onChange({ perShareTransferPrice: v })}
        />
        {transferTotal && (
          <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
            양도가액 합계: {parseAmount(form.perShareTransferPrice).toLocaleString()} ×{" "}
            {parseInt(form.shareCount || "0", 10).toLocaleString()}주 ={" "}
            <strong>{transferTotal.toLocaleString()}</strong>
          </div>
        )}
      </>
    )}

    {/* total 분기 (신규) */}
    {transferActualInputMode === "total" && (
      <>
        <CurrencyInput
          label="양도가액 합계"
          required
          hint="계약서·등기부 등에 기재된 총 양도대금 (원)"
          value={form.transferTotalPrice}
          onChange={(v) => onChange({ transferTotalPrice: v })}
        />
        {reversedPerShare && (
          reversedPerShare.isExact ? (
            <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
              참고: 1주당 단가 = {reversedPerShare.perShare.toLocaleString()}{" "}
              ({reversedPerShare.total.toLocaleString()} ÷ {reversedPerShare.count.toLocaleString()}주)
            </div>
          ) : (
            <div className="rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-600">
              참고: 1주당 단가 = {reversedPerShare.perShare.toFixed(4)}{" "}
              ({reversedPerShare.total.toLocaleString()} ÷ {reversedPerShare.count.toLocaleString()}주){" "}
              — 정확히 떨어지지 않음. 총액 그대로 사용합니다.
            </div>
          )
        )}
      </>
    )}
  </div>
)}
```

**placeholder 없음**: 숫자 예시 금지 정책(`components/calc/CLAUDE.md`) 준수.

**분할 모드에서 서브 라디오 노출 여부**: 서브 라디오는 `transferPriceMode === "actual"` 조건 안에 항상 노출. 단, "합계 직접 입력" 옵션만 `disabled={isSplitMode}`. 사용자가 per_share와 total을 구별할 수 있도록 UI 가시성 유지.

### ⑥ 사이드바 합계 — `components/calc/stock-transfer/StockSidebar.tsx:47-60`

단일 진실(single 분기) 확장. 현행 L47~60 교체:

```ts
} else {
  // single 모드 — transferActualInputMode 분기 추가 (신규)
  const actualMode = formData.transferActualInputMode || "per_share"; // 3중 패턴 default
  let transferPrice: number | null = null;
  if (actualMode === "total") {
    const total = parseAmount(formData.transferTotalPrice);
    transferPrice = total > 0 ? total : null;
  } else {
    const perShare = parseAmount(formData.perShareTransferPrice);
    const count = parseInt(formData.shareCount || "0", 10);
    transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
  }
  const exchangeTotal =
    parseAmount(formData.exchangePropertyValue) +
    parseAmount(formData.exchangeDebtRelief) +
    parseAmount(formData.exchangeCash);
  effectiveTransferPrice =
    (formData.transferPriceMode || "actual") === "exchange"
      ? (exchangeTotal > 0 ? exchangeTotal : null)
      : transferPrice;
}
```

**변수명 일관성**: 계획서 §5.3 그대로. `||` 연산자로 3중 패턴 default 통일 (`?? "per_share"` 혼용 금지).

### ⑦ 결과 카드 산식 — **UI 측 변경 있음 (v2 정정)**

⚠️ v1 오류 정정: 현행 `StockTransferTaxResultView`는 `CalculationStep` push 없이 `ResultRow`로 값만 노출. **UI 측 신규 작업 3건**:

**(a) `TransferPriceFormulaCard` 신규 컴포넌트** — `StockTransferTaxResultView.tsx` 본문 내 inline 함수로 추가 (별도 파일 분리 불요, ~25줄):

```tsx
function TransferPriceFormulaCard({
  result,
  shareCount,
  transferActualInputMode,
  perShareTransferPrice,
}: {
  result: StockTransferResult;
  shareCount: number;
  transferActualInputMode: "per_share" | "total";
  perShareTransferPrice: number;
}) {
  // exchange 모드 또는 split 모드(lot 합계)는 표시 안 함
  if (result.transferPriceBreakdown) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-sm">
      <p className="font-semibold text-emerald-800 mb-1">양도가액 산식 (§96① 실지거래가액)</p>
      {transferActualInputMode === "total" ? (
        <>
          <p className="text-emerald-900">양도가액 합계 직접 입력 = <strong>{fmt(result.transferPrice)}</strong></p>
          {shareCount > 0 && (() => {
            const reverse = result.transferPrice / shareCount;
            const exact = result.transferPrice % shareCount === 0;
            return (
              <p className="text-xs text-emerald-700 mt-1">
                참고: 역산 1주당 단가 = {exact ? reverse.toLocaleString() : reverse.toFixed(4)}
                {!exact && " (정확히 떨어지지 않음 — 계산에 미사용)"}
              </p>
            );
          })()}
        </>
      ) : (
        <p className="text-emerald-900">
          1주당 양도가액 {perShareTransferPrice.toLocaleString()} × {shareCount.toLocaleString()}주
          = <strong>{fmt(result.transferPrice)}</strong>
        </p>
      )}
    </div>
  );
}
```

**(b) `StockTransferTaxResultViewProps` 확장** (L25~32):
```ts
interface StockTransferTaxResultViewProps {
  result: StockTransferResult;
  shareCount: number;
  isFraudulent?: boolean;
  isInternationalTransaction?: boolean;
  transferActualInputMode?: "per_share" | "total";  // 신규 default "per_share"
  perShareTransferPrice?: number;                    // 신규 default 0 (역산 표시용)
}
```

함수 시그니처(L95)·destructure에 2 prop 추가 + default 처리:
```ts
export function StockTransferTaxResultView({
  result, shareCount, isFraudulent, isInternationalTransaction,
  transferActualInputMode = "per_share",
  perShareTransferPrice = 0,
}: StockTransferTaxResultViewProps) {
```

**(c) 본문 + 비과세 분기에 카드 삽입**:
- 비과세 화면(L109~): `<PdfActions />` 직후 또는 분류 배지 직후
- 일반 화면: `<EstimatedValuationBreakdown>` (L192) 바로 위
```tsx
<TransferPriceFormulaCard
  result={result}
  shareCount={shareCount}
  transferActualInputMode={transferActualInputMode}
  perShareTransferPrice={perShareTransferPrice}
/>
```

**(d) `Step4.tsx` prop wiring** (L71~76):
```tsx
<StockTransferTaxResultView
  result={result}
  shareCount={shareCount}
  isFraudulent={form.isFraudulent}
  isInternationalTransaction={form.isInternationalTransaction}
  transferActualInputMode={form.transferActualInputMode || "per_share"}
  perShareTransferPrice={parseAmount(form.perShareTransferPrice)}
/>
```

`parseAmount`는 `@/components/calc/inputs/CurrencyInput`에서 import.

### ⑧ Validation — `lib/calc/stock-transfer-tax-validate.ts:308-313` (엔진 시니어 담당)

UI 시니어 확인용 설계. `validateStep2` single 모드 양도가액 블록:

```ts
if (transferPriceMode === "actual") {
  const actualMode = form.transferActualInputMode || "per_share"; // 3중 패턴 동일 default
  if (actualMode === "total") {
    if (isEmpty(form.transferTotalPrice) || parseI(form.transferTotalPrice) <= 0) {
      errors.push({ field: "transferTotalPrice", message: "양도가액 합계를 입력하세요", severity: "error" });
    }
  } else {
    if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
      errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
    }
  }
}
```

**3중 패턴 동기화 확인**: UI display fallback (`|| "per_share"`) = API 변환 fallback (`|| "per_share"`) = validate fallback (`|| "per_share"`) 완전 일치. UI 통과 ↔ validate 차단 모순 없음.

### ⑨ Zod enum 신규 — `lib/api/stock-transfer-tax-schema.ts:34` 부근 (엔진 시니어 담당)

```ts
export const transferActualInputModeSchema = z.enum(["per_share", "total"]);
```

### ⑩ Zod enum 컴패니언 — 해당 없음

`transferActualInputMode`는 자산-수준 분리 스키마 아님 (폼-전역). `addStockRefines`의 split 게이트 안에 차단 로직 추가로 대체.

### ⑪ acquisitionDate fallback — 해당 없음

양도가액 입력 방식 변경은 acquisitionDate와 무관.

### ⑫ Zod 입력 객체 정의 — `lib/api/stock-transfer-tax-schema.ts:128-133` (엔진 시니어 담당)

```ts
// 양도가액 블록 확장
transferPriceMode: transferPriceModeSchema,
transferActualInputMode: transferActualInputModeSchema.optional(), // default "per_share"
perShareTransferPrice: z.number().min(0).optional(),
transferTotalPrice: z.number().int().min(0).optional(),
// ... 기존 exchange 필드 유지
```

`addStockRefines` superRefine 2건 추가:
1. split 게이트 안 — total 옵션 차단
2. single 게이트 — total 모드 + 합계 0 차단

### ⑬ API body spread — `lib/calc/stock-transfer-tax-api.ts` (엔진 시니어 담당)

`body.transferActualInputMode` + `body.transferTotalPrice` 명시 spread (§4 설계 참조).
TypeScript 미감지 위험 — Do 단계 grep 자가 점검 필수.

### ⑭ Route handler 엔진 매핑 — `app/api/calc/stock-transfer/route.ts` (엔진 시니어 담당)

**2곳 모두** 추가 필요:
- 단건 POST 핸들러 L121~125 부근
- 다자산 합산 `buildEngineInput()` L200~204 부근

한 곳 누락 시 다자산 경로 silent stripping 발생.

---

## 5. 분할 모드 차단 상세

### 5.1 UI 레이어

`RadioCardGroup` option의 `disabled` prop 활용. 기존 패턴 참조:

```tsx
// Step2.tsx:178~196 — acquisitionMode 분할 모드 disabled 패턴 (참조)
{
  value: "estimated",
  label: "환산취득가",
  description: isListed ? "..." : "...",
  disabled: isSplitMode,
},
```

총액 옵션도 동일 패턴:
```tsx
{
  value: "total",
  label: "합계 직접 입력",
  description: isSplitMode
    ? "분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"
    : "양도가액 총액을 원 단위로 직접 입력",
  disabled: isSplitMode,
},
```

disabled 옵션에 사용자가 클릭하면 RadioCardGroup이 내부적으로 반응 차단. 별도 Toast 불필요.

### 5.2 Validation 레이어 (⑧)

분할 모드 lot 검증 블록(L290~307)은 `transferActualInputMode`와 무관 (lot 단위 검증). 분할 모드에서는 서브 입력 방식 검증 자체를 skip.

### 5.3 Zod 레이어 (⑫ — 방어선)

`addStockRefines` 분할 게이트 안에 차단:
```ts
if (data.lotsMode === "split" && data.transferActualInputMode === "total") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["transferActualInputMode"],
    message: "분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
  });
}
```

---

## 6. 역산 단가 표시 상세 명세

### 6.1 표시 조건

- `form.transferTotalPrice`가 비어있지 않고 parseAmount > 0
- `form.shareCount`가 비어있지 않고 parseInt > 0
- 두 조건 모두 충족 시 박스 노출

### 6.2 정확도 판정 (v2 정정)

```ts
const perShare = total / count;
const isExact = total % count === 0;  // ★ 정수 나눗셈 잔돈 0일 때만 정확
```

⚠️ v1 오류 정정: `toFixed(4).endsWith(".0000")`는 `50000.00001 × 5000 = 250000000.05` 같은 케이스에서 false positive(`toFixed(4)="50000.0000"` → "정확"으로 오판). `total % count === 0`이 부동소수 무관 정확.

### 6.3 표시 형식

| 경우 | tone | 문구 |
|---|---|---|
| 정확히 떨어짐 | emerald | `참고: 1주당 단가 = {N} ({total} ÷ {count}주)` |
| 정확히 안 떨어짐 | slate | `참고: 1주당 단가 = {N.4자리} ({total} ÷ {count}주) — 정확히 떨어지지 않음. 총액 그대로 사용합니다.` |
| shareCount 미입력 | (숨김) | 박스 미노출 |

### 6.4 엔진 계산 무관 (표시 전용)

역산 단가는 어떤 폼 필드에도 저장·미러링하지 않음. `useEffect → store set()` 절대 금지 (`feedback_useeffect_store_mirror_forbidden` 정책).

---

## 7. 모드 전환 시 stale 값 처리

### 7.1 total → per_share 전환

- `transferTotalPrice` 필드는 **hide만, reset 금지**
- 재토글 시 기존 입력값 복원
- 사이드바 계산은 즉시 `perShareTransferPrice × shareCount` 기준으로 전환

### 7.2 per_share → total 전환

- `perShareTransferPrice` 필드는 **hide만, reset 금지**
- 재토글 시 기존 입력값 복원
- Validation: total 모드 진입 직후 `transferTotalPrice` 미입력 상태 → Step2 통과 불가 (⑧ 정책)

### 7.3 stale 값이 엔진에 도달하지 않도록

API 변환(④)에서 모드 기준으로 한쪽 값만 body에 포함 (§4 설계). 미사용 모드의 값은 body에 포함되지 않아 엔진 분기 혼선 없음.

---

## 8. `feedback_store_default_vs_ui_display_fallback` 정책 준수

신규 필드 `transferActualInputMode`의 3중 일관성 보장:

| Layer | 적용 방식 | 값 |
|---|---|---|
| Factory default (②) | `createInitialStockFormData()` | `"per_share"` |
| normalize (③) | `enumField("transferActualInputMode", ["per_share", "total"], "per_share")` | `"per_share"` |
| UI display (⑤) | `const transferActualInputMode = form.transferActualInputMode \|\| "per_share"` | `"per_share"` |
| API 변환 (④) | `const actualMode = form.transferActualInputMode \|\| "per_share"` | `"per_share"` |
| validate (⑧) | `const actualMode = form.transferActualInputMode \|\| "per_share"` | `"per_share"` |

**5 layer 모두 `"per_share"`로 일치** — store 실값이 `""` 또는 `undefined`로 유지되어 활성 조건 분기·validate 침묵 차단되는 사고 예방.

`transferTotalPrice`는 string 필드 — factory default `""`, normalize `strField("transferTotalPrice")` → `""`. UI display fallback 없음 (CurrencyInput의 빈 문자열 표시 그대로 사용).

---

## 9. 위험·회피 (계획서 §11 인용 + UI 측 추가)

| 위험 | 영향 | 회피 |
|---|---|---|
| per_share → total 토글 시 stale `perShareTransferPrice` 잔존 | UX 혼란 (단, 엔진 분기로 무시됨) | total 모드 진입 시 perShareTransferPrice 필드 숨김(데이터 보존). API 변환에서 한쪽 값만 body 전송 |
| sessionStorage legacy 폼 마이그레이션 누락 → `transferActualInputMode` undefined | 회귀 0 위험 | normalize `enumField` default 강제 (undefined → "per_share" 자동) |
| Zod refine 누락 시 total 모드인데 `transferTotalPrice` 0 → 엔진 transferPrice=0 → 세액 0 | 데이터 무결성 침해 | ⑧ validate + ⑫ Zod refine 양면 차단 |
| 분할 모드 사용자가 total 옵션 강제 시도 | 데이터 충돌 | UI disabled (RadioCardGroup 내부 차단) + ⑧ validate + ⑫ Zod refine 3중 차단 |
| disabled 상태의 total 옵션 클릭 시 시각 피드백 부재 | UX: 왜 안 되는지 모름 | `description`에 이유 문구 명시 (`"분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"`). 클릭 자체가 막히므로 Toast 불필요 |
| 역산 단가를 useEffect로 store에 미러링 | 무한 루프 (Maximum update depth exceeded) | `useMemo` 표시 전용 계산만. store write 절대 금지 |
| 총액 입력 시 `perShareTransferPrice` 잔존값이 validate를 통과할 수 있음 | validate 로직 모순 | ⑧ validate를 actualMode 분기로 교체 — total 모드 시 perShareTransferPrice 검증 skip |

---

## 10. 테스트 anchor (계획서 §9 인용)

| ID | 설명 | 검증 포인트 |
|---|---|---|
| T-TOTAL-1 | 단순 total 모드 | `transferTotalPrice = 250,000,000` → `result.transferPrice === 250,000,000` |
| T-TOTAL-2 | per_share와 결과 동일 | A(per_share, 50,000×5,000) / B(total, 250,000,000) 산출세액 동일 |
| T-TOTAL-3 | 정확히 안 떨어지는 1원 차이 | `transferTotalPrice = 250,000,001` → `result.transferPrice === 250,000,001` |
| T-TOTAL-4 | split + total 조합 차단 | validate errors에 transferActualInputMode split 미지원 포함 |
| T-TOTAL-5 | exchange 모드는 actualInputMode 무시 | `transferPriceMode="exchange"` → exchangeTotal 기준 |

UI 단위 테스트 (vitest + RTL):
- per_share 모드에서 "합계 직접 입력" 선택 시 CurrencyInput 전환 확인
- 역산 단가 박스가 shareCount 입력 전에는 노출되지 않음 확인
- 분할 모드에서 "합계 직접 입력" 옵션이 disabled 속성을 가짐 확인

---

## 11. Do 단계 작업 순서 (UI 시니어 전담) — v2 정정

1. Step2.tsx 현재 줄 수 grep (현행 269줄) → 800줄 정책 여유 확인
2. `lib/stores/calc-wizard-stock-store.ts` — ①②③ 동기화 (타입 추가 → initial 추가 → normalize 추가)
3. `StockSidebar.tsx` — ⑥ single 분기 교체 (L47~60)
4. `Step2.tsx` — ⑤ UI 위젯 구현 (변수 선언 + useMemo + JSX)
5. **`StockTransferTaxResultView.tsx` — ⑦ 신규** (v2 추가):
   - Props 인터페이스에 `transferActualInputMode` + `perShareTransferPrice` 2 추가
   - 함수 시그니처 destructure에 default 처리
   - `TransferPriceFormulaCard` inline 함수 정의 (~25줄)
   - 일반 화면(L192 `EstimatedValuationBreakdown` 위) + 비과세 화면 2곳 카드 삽입
6. **`Step4.tsx` — ⑦ prop wiring 신규** (v2 추가): `StockTransferTaxResultView` 호출부에 2 prop 전달
7. `npx tsc --noEmit` 0건 확인
8. 브라우저 수동 확인 (5분기: U-1 ~ U-3 + U-4 + U-5)
9. `ui-engine-sync-checker` 호출 → 14지점 누락 0 확인

**엔진 시니어 선행 완료 확인 필요**: ④⑧⑨⑫⑬⑭ — UI 시니어 작업 시작 전 엔진 타입 변경 완료 여부 확인. (⑦은 UI 단독 작업)

---

## 12. Definition of Done 자가 체크 (UI 담당)

- [ ] `StockTransferFormData` 타입에 `transferActualInputMode`, `transferTotalPrice` 2필드 추가 (①)
- [ ] `createInitialStockFormData()` 에 2필드 default 추가 (②)
- [ ] `normalizeStockFormData()` 에 2필드 normalize 추가 (③)
- [ ] `StockSidebar.tsx` single 분기 total 모드 분기 추가 (⑥)
- [ ] `Step2.tsx` 서브 라디오 + 두 CurrencyInput 분기 + useMemo 역산 단가 구현 (⑤)
- [ ] `StockTransferTaxResultView.tsx` Props 확장 + `TransferPriceFormulaCard` 신규 + 2곳 삽입 (⑦)
- [ ] `Step4.tsx` 호출부에 `transferActualInputMode` + `perShareTransferPrice` 2 prop wiring (⑦)
- [ ] 3중 패턴 5 layer 모두 `"per_share"` default 일치 확인 (feedback_store_default_vs_ui_display_fallback)
- [ ] useEffect → store 미러링 없음 확인 (feedback_useeffect_store_mirror_forbidden)
- [ ] 역산 단가 표시 — `useMemo` 표시 전용, store write 없음
- [ ] 분할 모드 disabled + reason 문구 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 확인: U-1~U-3 + exchange + split+per_share 5분기 + Network 탭 body 신규 필드 확인
- [ ] 800줄 정책 준수 (`Step2.tsx` 줄 수 확인)
