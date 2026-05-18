# 양도일 직전 1개월 종가 — 일자별 입력 모드 (Engine Design)

> Feature: `stock-transfer-pre-transfer-daily-input` · Engine 측 변경 · 2026-05-18
> 관련 plan: `docs/00-pm/stock-transfer-pre-transfer-1month-daily-input.plan.md`

## 1. 목표

- 사용자가 `transferDatePriceAvg1Month`(시행령 §163⑨ 분모)를 직접 입력하거나 일자별 종가표로 자동 산정하여 입력하는 두 가지 방식을 선택할 수 있도록 한다.
- 엔진 산식 자체는 변경하지 않고 echo 메타·결과 산식 화면 표시만 보강.

## 2. 데이터 모델 변경

### 2.1 Engine Input

```ts
// lib/tax-engine/stock-transfer/types/stock-transfer.types.ts
interface StockTransferInput {
  // 기존 필드 ...
  transferDatePriceAvg1Month?: number;       // 기존 — §163⑨ 분모 (mirror된 값)

  /** 양도시 기준시가 입력 방식 메타 (산식 영향 없음 — echo 전용) */
  transferStdInputMode?: "direct" | "daily";
}
```

### 2.2 Engine Result (valuationDetail 확장)

★ **수정 (E-29)**: 엔진은 종가 배열을 직접 받지 않으므로 `tradingDays`·`closingSum`은 echo 불가. UI 책임. **2 필드만** valuationDetail에 echo.

```ts
interface StockTransferResult {
  // 기존 필드 ...
  valuationDetail?: {
    // 기존 필드 ...
    finalPerShareValue: number;
    conversionAcqStdPerShare?: number;
    conversionTransferStd?: number;
    conversionUsedFallback?: boolean;

    /** ★ daily 모드 사용 여부 (input.transferStdInputMode echo) */
    transferDailyModeUsed?: boolean;
    /** daily 모드 자동 산정 평균 (= input.transferDatePriceAvg1Month, UI mirror된 값) */
    transferDailyAverage?: number;
    // (제거됨) transferDailyTradingDays·transferDailyClosingSum — 엔진이 모르는 정보.
    // UI가 form.transferPriceClosing 으로부터 직접 산정하여 결과 카드 prop으로 전달.
  };
}
```

### 2.3 산식 (변경 없음)

```
§163⑨ 환산취득가 = 양도가 × (취득시 기준시가 ÷ 양도시 기준시가)
              = transferPrice × (acqStdPerShare ÷ transferDatePriceAvg1Month)
```

→ daily 모드는 UI가 일자별 종가 평균을 산정해 transferDatePriceAvg1Month에 mirror.
→ 엔진은 transferDatePriceAvg1Month 단일 숫자만 사용 (직접 입력과 동일).

## 3. STEP 3 분기 echo 추가

`lib/tax-engine/stock-transfer/stock-transfer-tax.ts` STEP 3 acquiredBeforeListing 분기:

```ts
const { transferStd, usedFallback } = resolveTransferStd(transferPrice, shareCount, input.transferDatePriceAvg1Month);

// daily 모드 메타 echo (산식 영향 없음)
const transferDailyModeUsed = input.transferStdInputMode === "daily";

valuationDetail = {
  method: "post_listing_conversion",
  netAssetFloorApplied: false,
  finalPerShareValue: acqStdPerShare,
  conversionAcqStdPerShare: acqStdPerShare,
  conversionTransferStd: transferStd,
  conversionUsedFallback: usedFallback,
  transferDailyModeUsed,
  transferDailyAverage: transferDailyModeUsed ? (input.transferDatePriceAvg1Month ?? 0) : undefined,
};
```

→ 거래일 N·종가합계는 엔진 미관여. UI가 `calcMonthlyClosingAverage(form.transferPriceDates, form.transferPriceClosing)` 호출 결과를 결과 카드 prop으로 직접 전달 (PostListingDetailCard에 `transferDailyMeta` prop 추가).

## 4. 케이스 인벤토리

| ID | transferStdInputMode | transferDatePriceAvg1Month 결정 | conversionTransferStd echo | 기대 acquisitionPrice |
|---|---|---|---|---|
| **E-1** | "direct" | 사용자 직접 입력 (예: 8,659) | 8,659 | floor(44,750,000 × 5,824 / 8,659) = 30,098,625 |
| **E-2** | "daily" | UI mirror 평균값 (예: 8,659) | 8,659 | 30,098,625 (E-1과 동일 결과) |
| **E-3** | undefined (구버전 호환) | 사용자 직접 입력 | 8,659 | 30,098,625 (default = direct) |
| **E-4** | "direct" | 빈 입력 / 0 | resolveTransferStd fallback = 1주당 양도가 8,950 | floor(44,750,000 × 5,824 / 8,950) = 29,120,000 + usedFallback=true |
| **E-5** | "daily" | UI mirror 평균=0 (빈 표) | fallback = 1주당 양도가 8,950 | 29,120,000 + usedFallback=true (validate 차단 권장) |
| **E-6** | "direct" | acquiredBeforeListing=false (일반 환산) | transferStd = transferDatePriceAvg1Month | 일반 §163⑨ — calcListedValuation 분기 |
| **E-7** | "daily" | acquiredBeforeListing=false | (본 PR 미적용 — 후속 PR) | 일반 환산 분기는 direct 모드만 |

## 5. anchor 명세

| ID | 시나리오 | 검증 |
|---|---|---|
| **TI-13** | daily 모드 + PDF 사례 | engine input.transferStdInputMode="daily", transferDatePriceAvg1Month=8,659(mirror) → acquisitionPrice=30,098,625, valuationDetail.transferDailyModeUsed=true |
| **TI-14** | direct 모드 회귀 보호 | input.transferStdInputMode="direct"(또는 undefined) → 기존 PL-1 결과(30,098,625) 동일 |
| **TI-15** | echo 일관성 | daily 모드 시 valuationDetail.conversionTransferStd === transferDatePriceAvg1Month (mirror 정확성) |

## 6. 호출처 갱신 (3건)

1. `stock-transfer-tax.ts` STEP 3 `acquiredBeforeListing` 분기 — echo 4 필드 추가.
2. `exempt-informational-acquisition.ts` `acquiredBeforeListing` 분기 — 비과세 정보용 echo도 동일.
3. (선택) `stock-transfer-tax.ts` STEP 3 일반 상장 환산 분기 — direct 모드만 지원, transferDailyModeUsed echo는 미적용 (후속 PR).

## 7. 회귀 보호

- 기존 PL-1~5 anchor (취득 후 상장 §165⑤+§163⑨) 모두 통과 — Input.transferStdInputMode가 undefined여도 default direct로 동작.
- 기존 LE-1~8 anchor (일반 상장 환산 §163⑨) 모두 통과 — 본 PR 영향 없음 (호출자 미변경).
- 기존 L48-1~10 (사례 48) 모두 통과 — direct 모드 기본 동작 보존.

## 8. 800줄 정책

- `stock-transfer-tax.ts` 현재 798줄. 본 PR 추가 ~15줄 → 813줄 예상 → **800줄 초과 위험**.
- 대안: STEP 3 acquiredBeforeListing 분기를 sibling 헬퍼로 추출 (`apply-post-listing-conversion.ts` 신규).
  - 시그니처: `applyPostListingConversion(input, transferPrice, shareCount, warnings, appliedRules)` → `{ acquisitionPrice, estimatedBase, postListingDetail, valuationDetail }`
  - 호출자(stock-transfer-tax.ts)는 헬퍼 결과 spread 적용.
  - 200줄 감축 예상 → 800줄 정책 안정 준수.

## 9. Definition of Done (Engine)

- [ ] Input에 `transferStdInputMode` optional 추가 (메타·산식 영향 없음)
- [ ] Result.valuationDetail에 4 echo 필드 추가
- [ ] STEP 3 acquiredBeforeListing 분기에서 echo
- [ ] exempt-informational-acquisition.ts 동일 echo
- [ ] anchor TI-13~15 통과
- [ ] 기존 PL/LE/L48 회귀 0건
- [ ] 800줄 정책 준수 (헬퍼 추출 검토)
- [ ] typecheck 0 errors
