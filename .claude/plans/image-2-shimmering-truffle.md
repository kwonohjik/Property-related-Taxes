# 일괄양도(소득세법 시행령 §166⑥) 동반자산 처리 보완 계획

## Context

현재 KoreanTaxCalc 일괄양도 처리에 두 가지 잘못된 가정이 있습니다.

**잘못된 가정 1 — 양도가액 결정 방식**
- 현재 코드: 동반자산 양도가액은 항상 기준시가로 안분
- 실제 법령(§166⑥): 본문은 "계약서에 자산별로 구분 기재된 경우 그 실제 가액 사용", 단서가 "구분 불분명한 경우 기준시가 비율 안분"
- 즉 안분은 단서이지 본문이 아님. 본문 케이스(실가)가 빠져 있음

**잘못된 가정 2 — 취득원인**
- 현재 코드: 동반자산은 항상 상속 취득(`inheritanceValuationMode` 토글만 존재)
- 실제: 매매·상속·증여 모두 가능
- 매매 시: 실거래가 확인 가능(actual) vs 환산취득가(estimated, 양도가 × 취득시기준시가/양도시기준시가) 분기 필요

이를 보완하기 위해 (1) 계약서 단위로 "실가/안분" 모드를 토글하는 단일 결정 추가, (2) 동반자산별 취득원인(매매/상속/증여) 분기 추가, (3) 동반자산별 보유기간 통산용 날짜(피상속인 취득일·증여자 취득일) 자체 입력 지원으로 6레이어를 보완합니다.

---

## 핵심 결정 사항

| 결정 항목 | 채택안 | 이유 |
|---|---|---|
| 양도가액 모드 적용 단위 | **계약서 단위 단일 토글** (주자산↔동반자산 동기화) | 한 매매계약서가 "구분 기재됨/안 됨" 둘 중 하나. 자산별 모드 분리는 실무와 괴리 |
| 동반자산 날짜 입력 | **자산별 자체 입력** | 동반자산이 다른 사람에게서 증여·상속받은 케이스 정확 처리. 자산별 단기보유 통산 정확도 ↑ |
| UI 파일 분리 | **5개 파일로 적극 분리** | 800줄 한도 준수, 단위 테스트 용이 |
| `fixedAcquisitionPrice` 의미 | **"확정 취득가" 단일 의미로 통일** | 매매 actual / 상속 manual / 증여 신고가액 모두 같은 필드 재사용. 분기는 `acquisitionCause`로 |
| 환산취득가 계산 위치 | **라우트(어댑터)** | 안분 후 결정되어야 정확. 엔진 변경 최소화 |
| Zod discriminatedUnion 도입 | **미사용** (superRefine 유지) | variant 폭발 방지(saleMode 2 × cause 3 = 6) |

---

## 1. 데이터 모델 — `lib/stores/calc-wizard-store.ts`

### 1-A. `TransferFormData` (전체 폼) 신규 필드

| 필드 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `bundledSaleMode` | `"actual" \| "apportioned"` | `"apportioned"` | §166⑥ 본문(actual) vs 단서(apportioned). 계약서 단위 단일 결정 |
| `primaryActualSalePrice` | `string` | `""` | actual 모드 시 주 자산의 계약서상 양도가액 |

### 1-B. `CompanionAssetForm` (L196-225) 신규/변경 필드

| 필드 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `actualSalePrice` | `string` | `""` | actual 모드 시 이 동반자산의 계약서상 양도가액 (apportioned 모드 시 무시) |
| `acquisitionCause` | `"purchase" \| "inheritance" \| "gift"` | `"inheritance"` | 동반자산 취득원인 (기존 동작 호환 위해 상속 기본값) |
| `useEstimatedAcquisition` | `boolean` | `false` | 매매 시 환산취득가 사용 여부 |
| `standardPriceAtAcq` | `string` | `""` | 매매 estimated의 취득시 기준시가 |
| `decedentAcquisitionDate` | `string` | `""` | 상속 시 피상속인 취득일 (자산별 단기보유 통산용) |
| `donorAcquisitionDate` | `string` | `""` | 증여 시 증여자 취득일 |
| `acquisitionDate` | `string` | `""` | 동반자산의 본인 취득일 (양도일은 주자산과 동일) |

### 1-C. 필드 의미 일원화
기존 `fixedAcquisitionPrice`를 모드별 확정 취득가 단일 필드로 재사용:
- 매매 actual → `fixedAcquisitionPrice` = 실거래가
- 매매 estimated → `fixedAcquisitionPrice` = `""` (라우트가 환산)
- 상속 manual → `fixedAcquisitionPrice` = 직접 입력
- 상속 auto → `fixedAcquisitionPrice` = `""` (라우트가 보충적평가)
- 증여 → `fixedAcquisitionPrice` = 신고가액

### 1-D. 마이그레이션
`merge` 함수(L391-399)가 `defaultFormData`로 누락 필드를 자동 채움 → 기존 sessionStorage 데이터 자동 호환. 신규 필드 기본값만 정의하면 끝.

---

## 2. UI — 5개 파일 적극 분리

### 2-A. 분리 전략

```
components/calc/transfer/
├── CompanionAssetsSection.tsx       # 외각: 리스트/추가/삭제. ~150줄 목표
├── CompanionAssetCard.tsx           # 자산 1건 카드 라우터. ~150줄
├── CompanionSaleModeBlock.tsx       # 양도가액 모드 토글 + 입력. ~120줄 (Step1에서도 재사용)
├── CompanionAcqPurchaseBlock.tsx    # 매매(actual/estimated) + 본인 취득일. ~150줄
├── CompanionAcqInheritanceBlock.tsx # 상속(auto/manual) + 본인·피상속인 취득일. ~180줄
└── CompanionAcqGiftBlock.tsx        # 증여(신고가액) + 본인·증여자 취득일. ~120줄
```

### 2-B. 카드 내부 분기 구조 (`CompanionAssetCard.tsx`)

```
┌─ 자산 종류 (housing/land/building) ──────┐  (기존 유지)
├─ 자산 명칭 ────────────────────────────┤  (기존 유지)
├─ [bundledSaleMode === "actual"] ────────┤
│  └─ 계약서상 양도가액 입력 (actualSalePrice)
├─ [bundledSaleMode === "apportioned"] ───┤
│  └─ 양도시 기준시가 (standardPriceAtTransfer)
├─ 취득 원인 [매매 | 상속 | 증여] 토글 ───┤  ← 신규
│  ├ 매매 → CompanionAcqPurchaseBlock
│  ├ 상속 → CompanionAcqInheritanceBlock (현재 L181-288 추출 + 피상속인 취득일 신설)
│  └ 증여 → CompanionAcqGiftBlock
├─ 직접 귀속 필요경비 ────────────────────┤  (기존 유지)
└─ 감면(자경) ─────────────────────────┤  (기존 유지)
```

### 2-C. Step1 변경 — `app/calc/transfer-tax/steps/Step1.tsx` (L107-119)

```tsx
{form.companionAssets.length > 0 && (
  <div className="space-y-4">
    {/* 양도가액 모드 토글 (계약서 단위 단일 결정) */}
    <BundledSaleModeToggle
      value={form.bundledSaleMode}
      onChange={(mode) => onChange({ bundledSaleMode: mode })}
    />

    <CurrencyInput
      label="총 양도가액 (주된 자산 + 동반자산 합계, 원)"
      value={form.transferPrice}
      onChange={(v) => onChange({ transferPrice: v })}
      required
    />

    {form.bundledSaleMode === "actual" ? (
      <CurrencyInput
        label="주된 자산의 계약서상 양도가액 (원)"
        value={form.primaryActualSalePrice}
        onChange={(v) => onChange({ primaryActualSalePrice: v })}
        required
        hint="계약서에 구분 기재된 주 자산 가액 (§166⑥ 본문)"
      />
    ) : (
      <CurrencyInput
        label="주된 자산의 양도시 기준시가 (원)"
        value={form.standardPriceAtTransfer}
        onChange={(v) => onChange({ standardPriceAtTransfer: v })}
        required
        hint="안분 비율 분모 (§166⑥ 단서)"
      />
    )}

    <CompanionAssetsSection
      assets={form.companionAssets}
      onChange={(assets) => onChange({ companionAssets: assets })}
      bundledSaleMode={form.bundledSaleMode}  // ← 카드에 전파
    />
  </div>
)}
```

`BundledSaleModeToggle`은 `CompanionSaleModeBlock.tsx`에서 export.

### 2-D. `makeDefaultAsset()` 갱신
신규 필드 7개 기본값 추가. `Step1.tsx` L66-86 인라인 default도 동기화 (또는 `makeDefaultAsset`을 export 해서 재사용 — 권장).

---

## 3. 엔진 — `lib/tax-engine/bundled-sale-apportionment.ts`

### 3-A. `BundledAssetInput` 타입 확장 (`types/bundled-sale.types.ts` L21-52)

```ts
export interface BundledAssetInput {
  // ... 기존 필드 ...
  /**
   * 계약서에 구분 기재된 실제 양도가액 (원, 선택).
   * §166⑥ 본문 — 지정 시 이 자산은 안분 대상에서 제외되고
   * 이 값이 그대로 allocatedSalePrice로 사용된다.
   */
  fixedSalePrice?: number;
}
```

### 3-B. `apportionBundledSale()` Step 2 재편 (L94-110)

```
Step 2-a. fixed/variable 분리
  - fixedSet  = assets.filter(a => a.fixedSalePrice !== undefined)
  - variableSet = assets.filter(a => a.fixedSalePrice === undefined)
  - sumFixed = Σ(fixedSet.fixedSalePrice)
  - residual = totalSalePrice - sumFixed

Step 2-b. 검증
  - residual < 0 → throw "구분 기재된 양도가액 합이 총 양도가액 초과"
  - variableSet.length === 0 && residual > 0 → throw "잔여가 있으나 안분 대상 자산 없음"

Step 2-c. variableSet 안분
  - 분모 = Σ(variableSet.standardPriceAtTransfer)
  - 분모 === 0 && residual > 0 → throw "안분 분모 0"
  - 기존 말단 잔여값 보정 로직(L99)을 variableSet 말단에만 적용

Step 2-d. 입력 순서 보존하여 allocatedSales[] 재조립
```

`residualAbsorbedBy`는 variableSet의 말단 자산 id로 변경. variableSet 비면 `null`.

### 3-C. 매매 estimated 처리 → 라우트 어댑터 (엔진 변경 없음)

안분 후 결정되어야 정확하므로 엔진은 그대로 두고 라우트에서 사후 환산. 단, `BundledApportionedAsset`에 `usedEstimatedAcquisition?: boolean`, `saleMode?: "actual" | "apportioned"` 추가해 결과 표시에 활용.

### 3-D. `toBundledAsset()` 헬퍼 (L219-239)
`fixedSalePrice` 옵션 파라미터 추가.

---

## 4. 스키마 — `lib/api/transfer-tax-schema.ts`

### 4-A. `companionAssetSchema` (L231-256) 확장

```ts
const companionAssetSchema = z.object({
  // ... 기존 ...
  fixedSalePrice: z.number().int().positive().optional(),
  acquisitionCause: z.enum(["purchase", "inheritance", "gift"]).default("inheritance"),
  useEstimatedAcquisition: z.boolean().optional(),
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  acquisitionDate: z.string().date().optional(),
  decedentAcquisitionDate: z.string().date().optional(),
  donorAcquisitionDate: z.string().date().optional(),
});
```

### 4-B. `propertyBaseShape` (L408-458) 확장

```ts
bundledSaleMode: z.enum(["actual", "apportioned"]).default("apportioned"),
primaryActualSalePrice: z.number().int().positive().optional(),
```

### 4-C. `propertySchema.superRefine` (L469-526) 추가 검증

```ts
// (1) bundledSaleMode 단일 결정 검증
if (data.bundledSaleMode === "actual") {
  // primary actual 가액 필수
  if (!data.primaryActualSalePrice) ctx.addIssue({...});
  // 모든 컴패니언이 fixedSalePrice 가져야 함 (계약서 단위 단일 결정)
  for (const c of companions) {
    if (c.fixedSalePrice === undefined)
      ctx.addIssue({ message: "actual 모드에서는 모든 자산이 계약서상 양도가액 필요" });
  }
  // 합계 = totalSalePrice
  const sum = data.primaryActualSalePrice
    + companions.reduce((s, c) => s + (c.fixedSalePrice ?? 0), 0);
  if (sum !== data.totalSalePrice)
    ctx.addIssue({ message: "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않음" });
} else {
  // apportioned: 모든 자산이 standardPriceAtTransfer 필요
  for (const c of companions) {
    if (!c.standardPriceAtTransfer || c.standardPriceAtTransfer <= 0)
      ctx.addIssue({ message: "안분 모드에서는 양도시 기준시가 필수" });
  }
}

// (2) acquisitionCause별 검증
for (const c of companions) {
  if (c.acquisitionCause === "purchase") {
    if (c.useEstimatedAcquisition) {
      if (!c.standardPriceAtAcquisition) ctx.addIssue({...});
      if (!c.standardPriceAtTransfer) ctx.addIssue({...});
    } else {
      if (!c.fixedAcquisitionPrice) ctx.addIssue({ message: "매매(실가) 시 취득가액 필수" });
    }
    if (!c.acquisitionDate) ctx.addIssue({ message: "매매 자산은 취득일 필수" });
  } else if (c.acquisitionCause === "gift") {
    if (!c.fixedAcquisitionPrice) ctx.addIssue({ message: "증여 자산은 신고가액 필수" });
    if (!c.donorAcquisitionDate) ctx.addIssue({ message: "증여 자산은 증여자 취득일 필수" });
    if (!c.acquisitionDate) ctx.addIssue({ message: "증여 자산은 증여일 필수" });
  } else if (c.acquisitionCause === "inheritance") {
    if (!c.decedentAcquisitionDate) ctx.addIssue({...});
    if (!c.acquisitionDate) ctx.addIssue({ message: "상속 자산은 상속개시일 필수" });
    // 기존 inheritanceValuation 검증 로직 그대로
  }
}
```

---

## 5. 라우트/어댑터 — `app/api/calc/transfer/route.ts` (L259-413)

### 5-A. `BundledAssetInput` 조립 (L297-329) 변경

```ts
// 주 자산
const primaryAsset: BundledAssetInput = {
  assetId: "primary",
  // ... 기존 ...
  fixedSalePrice:
    data.bundledSaleMode === "actual" ? data.primaryActualSalePrice : undefined,
};

// 컴패니언별
const companionFixedAcq = companions.map((c) => {
  if (c.acquisitionCause === "inheritance" && c.inheritanceValuation) {
    return calculateInheritanceAcquisitionPrice({...}).acquisitionPrice;
  }
  return c.fixedAcquisitionPrice; // 매매(actual)/상속(manual)/증여 공통
});

const bundleAssets: BundledAssetInput[] = [
  primaryAsset,
  ...companions.map((c, i) => ({
    // ... 기존 ...
    fixedAcquisitionPrice: companionFixedAcq[i],
    fixedSalePrice: c.fixedSalePrice, // ★ 신규
  })),
];
```

### 5-B. 안분 후 환산취득가 사후처리 (신설)

```ts
const apportionment = apportionBundledSale({...});

// 매매 estimated 컴패니언: 안분 결과로 환산
const adjustedAcq = new Map<string, number>();
companions.forEach((c) => {
  if (c.acquisitionCause === "purchase" && c.useEstimatedAcquisition) {
    const allocSale = apportionment.apportioned.find(a => a.assetId === c.assetId)?.allocatedSalePrice ?? 0;
    const acqEstimated = calculateEstimatedAcquisitionPrice(
      allocSale,
      c.standardPriceAtAcquisition!,
      c.standardPriceAtTransfer,
    );
    adjustedAcq.set(c.assetId, acqEstimated);
  }
});
```

### 5-C. `TransferTaxItemInput` 매핑 (L338-391) 변경

```ts
const items: TransferTaxItemInput[] = apportionment.apportioned.map((a, idx) => {
  if (a.assetId === "primary") { /* 기존 그대로 */ }

  const c = companions[idx - 1];
  const acquisitionPrice = adjustedAcq.get(c.assetId) ?? a.allocatedAcquisitionPrice;

  return {
    propertyType: c.assetKind,
    transferPrice: a.allocatedSalePrice,
    transferDate, // 양도일은 주자산과 동일
    acquisitionPrice,
    acquisitionDate: new Date(c.acquisitionDate!),  // ★ 자산별
    expenses: a.allocatedExpenses,
    useEstimatedAcquisition: c.acquisitionCause === "purchase" && (c.useEstimatedAcquisition ?? false),
    standardPriceAtAcquisition: c.standardPriceAtAcquisition,
    standardPriceAtTransfer: c.standardPriceAtTransfer,
    acquisitionCause: c.acquisitionCause,           // ★ 신규
    decedentAcquisitionDate:                          // ★ 자산별
      c.acquisitionCause === "inheritance" && c.decedentAcquisitionDate
        ? new Date(c.decedentAcquisitionDate) : undefined,
    donorAcquisitionDate:                             // ★ 자산별
      c.acquisitionCause === "gift" && c.donorAcquisitionDate
        ? new Date(c.donorAcquisitionDate) : undefined,
  };
});
```

### 5-D. `lib/calc/transfer-tax-api.ts` `buildCompanionAssetPayload()` (L23-53)

신규 필드 직렬화:
```ts
return {
  // 기존 ...
  fixedSalePrice: form.bundledSaleMode === "actual"
    ? parseAmount(asset.actualSalePrice) : undefined,
  acquisitionCause: asset.acquisitionCause,
  useEstimatedAcquisition:
    asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
  standardPriceAtAcquisition:
    asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition
      ? parseAmount(asset.standardPriceAtAcq) : undefined,
  fixedAcquisitionPrice:
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition)
    || asset.acquisitionCause === "gift"
    || (asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "manual")
      ? parseAmount(asset.fixedAcquisitionPrice) : undefined,
  acquisitionDate: asset.acquisitionDate || undefined,
  decedentAcquisitionDate:
    asset.acquisitionCause === "inheritance" ? asset.decedentAcquisitionDate || undefined : undefined,
  donorAcquisitionDate:
    asset.acquisitionCause === "gift" ? asset.donorAcquisitionDate || undefined : undefined,
};
```

L304-323 `body` 조립부에 `bundledSaleMode`, `primaryActualSalePrice` 추가.

### 5-E. `lib/calc/transfer-tax-validate.ts` (L8-103) Step 0 강화

```ts
if (isBundled) {
  if (!form.transferPrice || parseAmount(form.transferPrice) <= 0)
    return "총 양도가액을 입력하세요.";

  if (form.bundledSaleMode === "actual") {
    if (!form.primaryActualSalePrice || parseAmount(form.primaryActualSalePrice) <= 0)
      return "주된 자산의 계약서상 양도가액을 입력하세요.";
  } else {
    if (!form.standardPriceAtTransfer || parseAmount(form.standardPriceAtTransfer) <= 0)
      return "주된 자산의 양도시 기준시가를 입력하세요.";
  }

  for (let i = 0; i < form.companionAssets.length; i++) {
    const a = form.companionAssets[i];
    if (form.bundledSaleMode === "actual") {
      if (!a.actualSalePrice || parseAmount(a.actualSalePrice) <= 0)
        return `동반자산 ${i + 1}: 계약서상 양도가액을 입력하세요.`;
    } else {
      if (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0)
        return `동반자산 ${i + 1}: 양도시 기준시가를 입력하세요.`;
    }

    // 취득원인별
    if (!a.acquisitionDate) return `동반자산 ${i + 1}: 취득일을 입력하세요.`;
    if (a.acquisitionCause === "purchase") {
      if (a.useEstimatedAcquisition) {
        if (!a.standardPriceAtAcq || parseAmount(a.standardPriceAtAcq) <= 0)
          return `동반자산 ${i + 1}: 취득시 기준시가를 입력하세요.`;
      } else {
        if (!a.fixedAcquisitionPrice || parseAmount(a.fixedAcquisitionPrice) <= 0)
          return `동반자산 ${i + 1}: 취득가액을 입력하세요.`;
      }
    } else if (a.acquisitionCause === "gift") {
      if (!a.fixedAcquisitionPrice || parseAmount(a.fixedAcquisitionPrice) <= 0)
        return `동반자산 ${i + 1}: 증여 신고가액을 입력하세요.`;
      if (!a.donorAcquisitionDate)
        return `동반자산 ${i + 1}: 증여자 취득일을 입력하세요.`;
    } else if (a.acquisitionCause === "inheritance") {
      if (!a.decedentAcquisitionDate)
        return `동반자산 ${i + 1}: 피상속인 취득일을 입력하세요.`;
    }
  }

  // actual 합계 = totalSalePrice 검증
  if (form.bundledSaleMode === "actual") {
    const sum = parseAmount(form.primaryActualSalePrice)
      + form.companionAssets.reduce((s, a) => s + parseAmount(a.actualSalePrice), 0);
    if (sum !== parseAmount(form.transferPrice))
      return "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다.";
  }
}
```

---

## 6. 테스트

### 6-A. 엔진 — `__tests__/tax-engine/bundled-sale-apportionment.test.ts`

```
describe("§166⑥ 본문 — fixedSalePrice (계약서 구분 기재)") {
  1. "모두 actual: 안분 분모 0이어도 OK, 합계 = totalSalePrice"
  2. "actual 합 > totalSalePrice → throw"
  3. "주 자산만 actual + 컴패니언 모두 apportioned는 단일 결정 위반 → 라우트에서 거부"
     (엔진은 혼합도 처리하지만 사용자 정책상 단일 결정 강제)
  4. "주+컴패니언 모두 actual: 안분 단계 우회"
  5. "주+컴패니언 모두 apportioned: 기존 동작 회귀 확인"
  6. "residualAbsorbedBy: variable의 말단, 모두 fixed면 null"
}
```

### 6-B. 라우트 — `__tests__/api/transfer.route.bundled.test.ts`

```
describe("동반자산 취득원인 분기") {
  1. "매매(actual): companionAssets[0].acquisitionCause='purchase' + fixedAcquisitionPrice
       → allocatedAcquisitionPrice = fixedAcquisitionPrice"
  2. "매매(estimated): allocatedSalePrice 기반 환산취득가 적용"
  3. "증여: fixedAcquisitionPrice = 신고가액 그대로 + donorAcquisitionDate 단기보유 통산"
  4. "혼합: 주=상속, 컴패니언1=매매(actual), 컴패니언2=증여"
}

describe("§166⑥ 본문 — actual 모드 E2E") {
  1. "주+컴패니언 모두 actual: 모든 자산이 정확한 계약서 가액으로 계산"
  2. "actual 합 ≠ totalSalePrice → 400 fieldErrors"
  3. "actual 모드인데 컴패니언 fixedSalePrice 누락 → 400"
}
```

### 6-C. UI 회귀

신규 분리 컴포넌트마다 최소 1건:
- `CompanionSaleModeBlock`: 토글 시 actualSalePrice/standardPriceAtTransfer 입력 전환
- `CompanionAcqPurchaseBlock`: estimated 토글 시 standardPriceAtAcq 표시
- `CompanionAcqGiftBlock`: 신고가액 + 증여자 취득일 입력
- `CompanionAcqInheritanceBlock`: auto/manual 분기 + 피상속인 취득일

### 6-D. 회귀 방지
기존 PDF p387~391 케이스(상속+상속, 모두 apportioned)는 기본값(`bundledSaleMode="apportioned"`, `acquisitionCause="inheritance"`)으로 그대로 통과해야 함. 핵심 안전망.

---

## 7. 작업 순서 (Dependencies)

```
[Phase 1: 타입·스키마 백본]                          (병렬 가능)
├─ 1-1. types/bundled-sale.types.ts: BundledAssetInput.fixedSalePrice + 결과 표시 필드 추가
├─ 1-2. lib/stores/calc-wizard-store.ts:
│       - TransferFormData(bundledSaleMode, primaryActualSalePrice) 추가
│       - CompanionAssetForm 7개 필드 추가
│       - defaultFormData·makeDefaultAsset 갱신
└─ 1-3. lib/api/transfer-tax-schema.ts:
         - companionAssetSchema·propertyBaseShape 확장
         - superRefine에 단일 모드 강제 + actual 합계 검증 + cause별 검증

[Phase 2: 엔진]                                       (Phase 1 완료 후)
└─ 2-1. lib/tax-engine/bundled-sale-apportionment.ts:
         - Step 2 분리 로직(fixed/variable)
         - residualAbsorbedBy null 허용
         - 합계 검증 유지

[Phase 3: 엔진 단위 테스트]                          (Phase 2와 병행)
└─ 3-1. __tests__/tax-engine/bundled-sale-apportionment.test.ts: 6-A 케이스 + 회귀

[Phase 4: 라우트 어댑터]                              (Phase 1·2 완료 후)
├─ 4-1. app/api/calc/transfer/route.ts L297-329: BundledAssetInput 조립 분기
├─ 4-2. app/api/calc/transfer/route.ts: 안분 후 환산취득가 사후처리
└─ 4-3. app/api/calc/transfer/route.ts L338-391:
         - TransferTaxItemInput 매핑 cause·자산별 날짜 반영

[Phase 5: 라우트 테스트]                              (Phase 4 완료 후)
└─ 5-1. __tests__/api/transfer.route.bundled.test.ts: 6-B 케이스

[Phase 6: API 어댑터·검증]                           (Phase 1 완료 후, Phase 4와 병행)
├─ 6-1. lib/calc/transfer-tax-api.ts: buildCompanionAssetPayload + body 조립
└─ 6-2. lib/calc/transfer-tax-validate.ts: Step 0 isBundled 분기 강화

[Phase 7: UI 분리·확장]                              (Phase 1 완료 후, Phase 4·6과 병행 가능)
├─ 7-1. CompanionSaleModeBlock.tsx 신설 (Step1+카드 공유)
├─ 7-2. CompanionAcqPurchaseBlock.tsx 신설
├─ 7-3. CompanionAcqInheritanceBlock.tsx 신설 (현재 L181-288 추출 + 피상속인 취득일)
├─ 7-4. CompanionAcqGiftBlock.tsx 신설
├─ 7-5. CompanionAssetCard.tsx 신설 (카드 라우터)
├─ 7-6. CompanionAssetsSection.tsx 슬림화 (외각만)
└─ 7-7. app/calc/transfer-tax/steps/Step1.tsx:
         - bundledSaleMode 토글 + primaryActualSalePrice 입력
         - makeDefaultAsset 재사용

[Phase 8: 통합 검증]                                  (모두 완료 후)
├─ 8-1. npx tsc --noEmit
├─ 8-2. npm test (전체 회귀)
└─ 8-3. 수동 E2E (브라우저)
```

**Critical path**: 1-2 → 1-3 → 4-1 → 5-1. UI(Phase 7)는 1-2 완료 후 병렬 가능.

---

## 8. 핵심 수정 파일

| 파일 | 변경 유형 |
|---|---|
| `lib/stores/calc-wizard-store.ts` | 필드 추가 (TransferFormData + CompanionAssetForm) |
| `lib/api/transfer-tax-schema.ts` | 스키마 확장 + superRefine 검증 |
| `lib/tax-engine/types/bundled-sale.types.ts` | `fixedSalePrice` 추가 |
| `lib/tax-engine/bundled-sale-apportionment.ts` | Step 2 fixed/variable 분리 |
| `app/api/calc/transfer/route.ts` | 어댑터 분기 + 환산 사후처리 |
| `lib/calc/transfer-tax-api.ts` | 페이로드 빌더 |
| `lib/calc/transfer-tax-validate.ts` | Step 0 검증 강화 |
| `app/calc/transfer-tax/steps/Step1.tsx` | 모드 토글 + primaryActualSalePrice |
| `components/calc/transfer/CompanionAssetsSection.tsx` | 슬림화 (외각만) |
| `components/calc/transfer/CompanionAssetCard.tsx` | **신규** (카드 라우터) |
| `components/calc/transfer/CompanionSaleModeBlock.tsx` | **신규** |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | **신규** |
| `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | **신규** (기존 L181-288 추출) |
| `components/calc/transfer/CompanionAcqGiftBlock.tsx` | **신규** |
| `__tests__/tax-engine/bundled-sale-apportionment.test.ts` | 케이스 추가 |
| `__tests__/api/transfer.route.bundled.test.ts` | 케이스 추가 |

---

## 9. 검증 방법

### 9-A. 자동
```bash
npx tsc --noEmit                                                    # 타입 체크
npx vitest run __tests__/tax-engine/bundled-sale-apportionment.test.ts
npx vitest run __tests__/api/transfer.route.bundled.test.ts
npm test                                                            # 전체 회귀
```

### 9-B. 수동 E2E (브라우저)

**시나리오 1 — actual 모드 정상**
1. `/calc/transfer-tax` 진입
2. Step1: 일괄양도 토글 ON → 양도가액 모드 "실가" 선택
3. 총양도가액 = 300,000,000 / 주자산 가액 = 200,000,000 / 동반1(주택, 매매 actual) = 70,000,000 / 동반2(농지, 상속) = 30,000,000
4. 합계 일치 → Step 통과, 결과 화면에서 자산별 양도가액 정확 표시

**시나리오 2 — actual 합계 불일치 오류**
1. 위 시나리오에서 동반2 가액을 25,000,000으로 변경
2. → "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다." 메시지

**시나리오 3 — apportioned 회귀**
1. 양도가액 모드 "안분" 선택
2. 총양도가액 + 자산별 기준시가 입력 → 기존 동작 그대로 안분

**시나리오 4 — 매매 estimated 동반자산**
1. 동반자산 1 = 매매, 환산취득가 사용 ON
2. 취득시 기준시가 입력 → 환산취득가 자동 계산

**시나리오 5 — 증여 동반자산**
1. 동반자산 1 = 증여, 신고가액·증여자 취득일 입력
2. 단기보유 통산 정확 적용 확인

### 9-C. 회귀 방지
기존 PDF p387~391 시나리오(상속+상속, 모두 apportioned) 통과 여부 확인 — `defaultFormData`만으로 자동 처리되어야 함.

---

## 10. 잠재적 리스크

| 항목 | 대응 |
|---|---|
| 모든 자산이 actual인 케이스에서 분모가 0이어도 OK여야 함 | 엔진 Step 2-c에서 `variableSet.length === 0`이면 분모 검증 스킵 |
| 동반자산 자산별 양도일이 다른 케이스 | 본 패치 v1에서는 양도일을 주자산과 동일 가정 (한 매매계약). 다른 양도일은 별도 패치 |
| `inheritanceValuation` 자동평가 시점에 자산별 acquisitionDate 필요 | 라우트에서 `c.acquisitionDate`를 `inheritanceDate`로 매핑 |
| 결과 화면 자산별 표시 (옵션) | `BundledApportionedAsset`에 `saleMode`, `usedEstimatedAcquisition` 추가하여 결과 카드에서 배지 표시 권장 |
