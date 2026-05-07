# 사례 27 — 400/500 계산 오류 + 양도비 입력란 UX 개선

## Context

### 발생 현상 (이미지 27/28/29/30/31)

이전 PDCA에서 S1·S2·S3로 자산 2 누락 버그를 해결했고 사이드바 합계가 1.7B로 정상화되었으나, **계산 단계에서 새로운 400/500 오류**가 발생.

브라우저 콘솔(이미지 31):

```
Failed to load resource ... :3000/api/calc/transfer:1  (400 Bad Request)
[transfer-tax API] fieldErrors: {
  "transferPrice": ["Too small: expected number to be >0"],
  "acquisitionDate": ["Invalid ISO date"]
}
[transfer-tax API] error response: ▶ Object (collapsed)
[transfer-tax API] request body: ▶ Object (collapsed)

Uncaught (in promise) Error: A listener indicated...
Failed to load resource ... :3000/api/calc/transfer:1  (500 Internal Server Error)
[transfer-tax API] error response (no fieldErrors): ▶ Object

<table> cannot contain a nested <tr>. See this log for the ancestor stack trace.
```

사이드바는 양도가액 1.7B / 취득가액 600M / 필요경비 23.2M / 양도소득금액 1,076,800,000으로 정확히 계산됨 → **폼 상태는 정상**. 그러나 API 변환 결과 body의 **top-level `transferPrice = 0`** + **`acquisitionDate` 무효** 두 필드가 Zod 검증에 걸림.

### 양도비 입력란 UX 혼동 (이미지 27 하단 + 이미지 28 하단)

사용자 질문: "양도가액 바로 밑에 있는 양도비용과 각 자산탭의 자본적 지출 밑에 있는 양도비용의 용도 차이는?"

현재 UI에 **양도비 입력란이 두 곳**:

1. **Step1 상단 폼-수준 "총 양도비 (선택)"** (`form.totalTransferExpense`) — 물건 전체 양도 시 1회 발생 비용을 입력하면 시스템이 자산 지분 비율로 자동 안분
2. **각 자산 카드 내 "양도비 (원) — §97① 나목"** (`asset.transferExpense`) — 자산별 직접 입력 (레거시·예외용)

두 입력란이 중복으로 보여 **사용자 혼동 발생**. 사례 27 정답 입력 시에는 #1만 14M 입력하고 #2는 비워두어야 하지만 라벨·hint만으로는 명확하지 않음.

### 두 오류의 분리

- **400 Bad Request (Zod 검증)**: API 변환 단계에서 body의 top-level `transferPrice`·`acquisitionDate`가 0/빈 문자열로 만들어짐. 폼 상태는 정상이지만 변환 코드에서 잘못 sourcing 가능성. **request body의 실제 값을 봐야 root cause 확정 가능** — 현재 `console.error("request body:", body)`가 객체 그대로 찍혀 콘솔에서 collapsed 상태로 표시되어 진단 불가.
- **500 Internal Server Error**: 첫 400 후 가산세 계산 등 후속 호출에서 발생. 동일 폼 데이터 → 같은 transferPrice/acquisitionDate 결함이 원인일 가능성 높음.
- **`<table>` nested `<tr>` 경고**: React 렌더링 경고 — `TransferTaxResultView.tsx:296`의 `<table>` 안에 `<tbody>` 없이 `<Row>`(=`<tr>`)가 직접 배치되어 발생. UX 영향은 미미하지만 콘솔 노이즈 + Strict Mode 경고. 별건 fix.

---

## 수정 계획 (3건)

### D1. 진단 로깅 강화 (1순위 — root cause 확정 선행 조건)

**위치**: `lib/calc/transfer-tax-api.ts:766` 부근

**현재**:
```typescript
console.error("[transfer-tax API] fieldErrors:", JSON.stringify(fieldErrors, null, 2));
console.error("[transfer-tax API] error response:", json);
console.error("[transfer-tax API] request body:", body); // ← 객체 — 콘솔에서 collapsed
```

**변경**:
```typescript
console.error("[transfer-tax API] fieldErrors:", JSON.stringify(fieldErrors, null, 2));
console.error("[transfer-tax API] error response:", json);
// 객체를 JSON 문자열로 출력해 collapsed 상태에서도 즉시 가독, 특히 위반 필드의 실제 값 확인용
console.error(
  "[transfer-tax API] request body (top-level keys with values):",
  JSON.stringify(
    {
      propertyType: body.propertyType,
      transferPrice: body.transferPrice,
      transferDate: body.transferDate,
      acquisitionPrice: body.acquisitionPrice,
      acquisitionDate: body.acquisitionDate,
      acquisitionCause: body.acquisitionCause,
      assetContractDate: body.assetContractDate,
      totalSalePrice: body.totalSalePrice,
      totalPropertyTransferPrice: body.totalPropertyTransferPrice,
      bundledSaleMode: body.bundledSaleMode,
      primaryActualSalePrice: body.primaryActualSalePrice,
      standardPriceAtTransferForApportion: body.standardPriceAtTransferForApportion,
      companionAssetsCount: Array.isArray(body.companionAssets) ? body.companionAssets.length : 0,
    },
    null,
    2,
  ),
);
console.error("[transfer-tax API] full request body:", JSON.stringify(body, null, 2));
```

**효과**: 콘솔에서 collapsed Object를 펼치지 않아도 위반 필드(transferPrice·acquisitionDate)의 실제 송신값이 즉시 보임. 이후 사용자 reproduction 한 번으로 root cause 즉시 식별 가능.

### D2. `<table>` nested `<tr>` 렌더링 경고 수정 (2순위 — UX 노이즈)

**위치**: `components/calc/results/TransferTaxResultView.tsx:296`

**원인**: `<table>` 자식으로 `<Row>`(=`<tr>`) 직접 배치. React/HTML은 `<tbody>`를 자동 삽입하지만 JSX 공백·커멘트가 끼면 경고가 fires.

**변경**:
```tsx
<table className="w-auto text-sm ...">
  <tbody>
    <Row label="양도차익" ... />
    {!result.rentalHousingExceptionDetail?.applied && ... && (
      <Row label="과세 양도차익 (12억 초과분)" ... />
    )}
    {/* 나머지 Row들 */}
  </tbody>
</table>
```

**효과**: 콘솔 경고 사라짐. 렌더링 결과 동일.

### D3. 양도비 입력 UX 명확화 + 자산 카드 내 양도비 비활성화 (3순위 — 사용자 혼동 차단)

**위치**:
- `app/calc/transfer-tax/steps/Step1.tsx` (상단 "총 양도비" 카드 hint)
- `components/calc/transfer/CompanionAssetCard.tsx` (자산 카드 내 양도비 입력란)

**변경 1 — Step1 폼-수준 "총 양도비" hint 강화**:
- 현재: `hint="양도 시 1회 발생하는 부동산 중개수수료·인지대 등..."`
- 추가: "이 값을 입력하면 자산별 양도비란은 자동으로 비활성화됩니다 (자동 안분 적용)."

**변경 2 — 자산 카드 내 양도비 입력란**: `form.totalTransferExpense > 0`일 때 자산 카드 내 양도비 입력란을 **disabled + 자동 안분 표시값**으로 전환:
```tsx
<FieldCard
  label="양도비 (원) — §97① 나목"
  hint={
    formTotalTransferExpense > 0
      ? `자동 안분 ${formatKRW(applyRatio(formTotalTransferExpense, ratio))} (총 양도비 ${formatKRW(formTotalTransferExpense)} × 지분 ${num}/${den})`
      : "..."
  }
>
  <CurrencyInput
    value={
      formTotalTransferExpense > 0
        ? String(applyRatio(formTotalTransferExpense, ratio))
        : asset.transferExpense
    }
    onChange={asset.transferExpense}
    disabled={formTotalTransferExpense > 0}
  />
</FieldCard>
```

**효과**: 사용자가 폼-수준 총 양도비를 입력하면 자산 카드의 양도비란이 회색으로 비활성화되며 "자동 안분된 금액"이 표시됨. 두 곳에 동시 입력해 이중 합산되는 혼동 차단.

### D4. 400 root cause 수정 (D1 진단 후 결정)

D1 로깅 강화 후 사용자가 다시 reproduce하면 request body의 정확한 값이 보임. 가능성 높은 원인:

| 가설 | 증상 | 수정 방향 |
|---|---|---|
| A. `form.contractTotalPrice`가 빈 문자열 | `transferPrice = applyRatio(0, 0.6) = 0` | Step1 폼 마운트/마이그레이션 시점에 contractTotalPrice가 누락. `migrateLegacyForm` 또는 `singleMode` 토글 핸들러 점검 |
| B. `primary.acquisitionDate`가 빈 문자열 | `acquisitionDate = ""` → "Invalid ISO date" | 상속 모드에서 `onAcquisitionDateChange`가 발화하지 않음. 또는 normalizeAsset에서 reset됨 |
| C. `primary` (`assets[0]`)가 잘못된 자산 | 기본 빈 자산이 0번 슬롯에 잘못 삽입 | `updateAssets` 또는 `setHasBundledAssets` 토글 시 stale state |
| D. parseAmount/getOwnershipRatio 엣지 | "1700000000" → 0 변환 실패 | 입력 raw 형식 점검 |

D1 후 **가장 가능성 높은 원인을 1건 단정 → 수정 → anchor 추가**.

---

## 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/calc/transfer-tax-api.ts` | 진단 로깅 강화 (D1) — request body의 top-level 키·값을 JSON.stringify로 출력 (~25줄) |
| `components/calc/results/TransferTaxResultView.tsx` | `<table>`에 `<tbody>` 래퍼 추가 (D2) — 1줄 추가 |
| `app/calc/transfer-tax/steps/Step1.tsx` | "총 양도비" hint 보강 (D3) — 1줄 |
| `components/calc/transfer/CompanionAssetCard.tsx` | 자산 카드 내 양도비 입력란 자동 안분 표시 + disabled (D3) — ~15줄 |
| (D4 후속) 진단 결과에 따라 추가 |

## 재사용 자산

- `applyRatio`, `getOwnershipRatio` (`lib/calc/transfer-tax-api-helpers.ts`) — 자산 카드 내 자동 안분 표시용
- `formatKRW`, `parseAmount` (`components/calc/inputs/CurrencyInput.tsx`)
- `<tbody>` JSX 패턴 — 공용 패턴 따름

## 변경하지 않는 영역

- 엔진 (`transfer-tax.ts`): 사례 27 anchor 22개 통과 중 — 엔진은 무관
- API Zod 스키마 (`transfer-tax-schema.ts`): 검증 자체는 정상. 송신값이 문제
- `bundledOk` dispatch (S1): 정상 동작 (합산 모드 진입은 이미 확인됨)

## 검증 (End-to-End)

1. **D1·D2·D3 적용 후 회귀**:
   ```bash
   npx tsc --noEmit
   npx vitest run __tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts
   ```

2. **D1 후 사용자 reproduction**:
   - 사례 27 정확 입력 → 계산 클릭 → 콘솔에서 "request body (top-level keys)" JSON 확인 → `transferPrice`·`acquisitionDate` 값 확인
   - 실제 송신값이 이미지 31의 가설 중 어느 것에 해당하는지 1줄로 보고

3. **D4 후 anchor**:
   - root cause 수정 + `__tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts`에 R-11 anchor 추가 (callTransferTaxAPI 변환 결과 검증)

4. **D2 검증**: 콘솔에서 `<table> cannot contain a nested <tr>` 경고 사라짐

5. **D3 검증**:
   - Step1 "총 양도비" 입력 시 자산 1·자산 2 카드 내 양도비란이 회색 + "자동 안분 8,400,000 / 5,600,000" 표시
   - 총 양도비를 비우면 자산 카드 양도비란 다시 활성화

## 후속 작업 (별도 PR — 본 PDCA 범위 밖)

- D4 root cause 수정이 패턴 결함이면 normalize/migration 전반 점검
- 양도비 입력란 단일화(폼-수준만 유지·자산-수준 폐지) 검토 — 단독 양도 사용자가 자산 카드만 보더라도 직관적인지 사용자 피드백 필요
