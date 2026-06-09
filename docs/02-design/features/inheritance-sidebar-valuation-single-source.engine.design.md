# 엔진 설계 — 사이드바 합계 평가 단일 소스화 (주식 V1 누락 수정)

> 계획서: `docs/01-plan/inheritance-sidebar-stock-presumed-sum.plan.md`
> 성격: 밸류에이션 로직 dual-truth 해소. UI 위젯 변경 없음(사이드바 표시 구조 불변, 값만 정정).

## 1. 목표 / 비목표

**목표**: 사이드바 `estimateAssetValue`(B)를 엔진 단일 소스 `computeEffectiveValuation`(A)로 위임해 **비상장 V1·상장 §63 변형·deposit·similarSales** 누락 해소. A에 V2 evaluationDate fallback용 optional `valuationDate` 내장.

**비목표**: §66 securedClaim MAX 동작 변경(scope 제외), `TotalEstimatedValue`(C) 변경, §15 추정 산식 변경, 칩·결과뷰 평가액 변경.

## 2. 케이스 인벤토리 (자산 × 현재 사이드바 vs 목표)

| # | 자산/모드 | 평가 소스 필드 | 현재 B(`estimateAssetValue`) | A(`computeEffectiveValuation`) | 목표(위임 후) |
|---|---|---|---|---|---|
| C1 | 부동산(시가) | marketValue | ✓ | ✓ | ✓ 불변 |
| C2 | 부동산(기준시가) | standardPrice | ✓ | ✓ | ✓ 불변 |
| C3 | 매매사례가액 | similarSalesValue | **✗ 0** | ✓ | ✓ **정정** |
| C4 | 예금/전세보증금 | deposit→leaseDeposit | **✗ 0**(deposit 분기 없음) | ✓ | ✓ **정정** |
| C5 | 금융(잔액·시가) | marketValue | ✓ | ✓ | ✓ 불변 |
| C6 | 상장주식(단순) | listedStockAvgPrice×Shares | ✓(plain) | ✓(§63) | ✓ §63 변형 정정 |
| C7 | 상장(취득후상장·증자 §63) | listed* + 변형 | **✗(plain만)** | ✓ `computeStockValuation:68-87` | ✓ **정정** |
| C8 | **비상장 V1** | unlistedStockData | **✗ 0** | ✓ `:105-112` | ✓ **핵심 정정** |
| C9 | 비상장 V2 | unlistedStockValuationV2 | ✓(evaluationDate inject) | ✓(단 evaluationDate 미입력 시 0) | ✓ valuationDate 주입 유지 |
| C10 | 추정상속 §15 | presumedItems | `sumPresumedItems`(별경로) | — | probe로 (a)/(b)/(c) 판정 |

## 3. 시그니처 변경

### 3.1 `computeEffectiveValuation` (A) — optional valuationDate 추가
```ts
// lib/calc/estate-item-valuation.ts
export function computeEffectiveValuation(
  item: EstateItem,
  valuationDate?: string,   // 신규 — V2 evaluationDate fallback용. 미전달 시 현행 동작 불변
): number {
  if (item.category === "deposit") return item.leaseDeposit ?? 0;
  const explicit = item.marketValue ?? item.appraisedValue ?? item.similarSalesValue ?? item.standardPrice;
  if (explicit !== undefined && explicit !== null) return explicit;
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    return computeStockValuation(item, valuationDate);   // valuationDate 전달
  }
  return 0;
}
```

### 3.2 `computeStockValuation` — optional valuationDate (V2 evaluationDate fallback 내장)
```ts
// lib/tax-engine/valuation/resolve-estate-item-value.ts
export function computeStockValuation(item: EstateItem, valuationDate?: string): number {
  // ... listed (불변) ...
  // unlisted formal V2:
  if (activeMode === "formal" && item.unlistedStockValuationV2) {
    let v2 = item.unlistedStockValuationV2;
    if (!v2.evaluationDate && valuationDate) {        // B의 :80-86 로직 이관
      const vd = new Date(valuationDate);
      if (!isNaN(vd.getTime())) v2 = { ...v2, evaluationDate: vd };
    }
    // evaluateUnlistedStockV2(v2) ...
  }
  // unlisted V1 (불변) ...
}
```
> 무인자 호출(기존 칩·결과뷰)은 valuationDate=undefined → V2 evaluationDate 주입 안 함 = **현행 동작 불변**.

### 3.3 `estimateAssetValue` (B) — 위임으로 축소
```ts
// lib/stores/inheritance-summary.ts
function estimateAssetValue(item: EstateItem, valuationDate?: string): number {
  return computeEffectiveValuation(item, valuationDate);   // 전체 본문 대체
}
```
> `sumEstateItemsValuation`(사이드바 + 주식 그룹 헤더 공용)이 호출 → 일괄 정정.
> **import 정리**: `computeEffectiveValuation` 추가. 위임 후 미사용은 **`evaluateUnlistedStockV2`만**(estimateAssetValue 본문에서만 쓰임). `resolveActiveUnlistedValuation`은 `sumEstateItemsValuation`의 pre-map(`:131`)에서 계속 사용 → **유지**. (CLAUDE.md ESLint --fix 함정: 신규 import는 한 라인 한 named.)

## 4. Pre-Do probe (필수 — Do 전 실측)

- **P-1 (주식 V1 RED)**: `unlistedStockData` 완전 1건 → `sumEstateItemsValuation([v1])` 현재 0 확인 → 위임 후 `perShareFinalValue×ownedShares` 반영.
- **P-2 (presumed 판정)**: 사용자 시나리오 presumed 입력 → `computeInheritanceSummary().presumedAdded` 값 확인:
  - (a) 임계 미발동 → 0 (정상, 코드 불변)
  - (b) 발동 → 순액(§15) 반영(정상, UI 설명만 검토)
  - (c) 0인데 발동해야 함 / 배선 끊김 → 버그(수정)
- probe로 V1 RED·presumed 분류 확정 후 Do 진입.

### ✅ probe 실행 결과 (2026-06-09)
- **P-1 RED 확정**: 비상장 V1 → `sumEstateItemsValuation` = **0**(버그) vs `computeStockValuation` = **459,980,000**(정상). → 위임 수정 후 **사이드바 = 459,980,000**(일치).
- **P-2 확정 — presumed 코드 버그 아님**: 임계 미발동(1년 1억<2억, 2년합<5억) → `presumedAdded` **0**(정상 §15). 임계 발동(1년 3억) → `presumedAdded` **240,000,000** = totalEstate 정상 합산. → **presumed 코드 변경 없음**(분류 (a) 임계 미발동 또는 (b) 순액 인식차).

## 5. 동기화 지점 (UI 한정)

| # | 지점 | 변경 |
|---|---|---|
| ⑥ 사이드바 합계 selector | `computeInheritanceSummary`→`estimateAssetValue` | **본 작업**(위임) |
| ① 폼 상태 | — | 무변경 |
| ⑤ UI 위젯 | InheritanceSidebar 표시 구조 | 무변경(값만 정정) |
| ⑦ 결과 카드 | 엔진 result | 무변경 |
| ⑧ Validation | — | 무변경 |

→ 표시 구조·계약 불변, **평가 합산값만 정정**.

## 6. 테스트 설계

### 6.1 신규 anchor
- A-1: 비상장 V1 1건 → `sumEstateItemsValuation` = `perShareFinalValue×ownedShares` (현재 0 → 정정).
- A-2: 상장 취득후상장/증자(§63 변형) → 사이드바 = `computeStockValuation` 동일.
- A-3: V2 evaluationDate 미입력 + valuationDate 전달 → 반영(R-1).
- A-4: deposit(leaseDeposit만)·similarSalesValue → 사이드바 반영(현재 0, R-5).
- A-5: `computeEffectiveValuation(item)` 무인자 호출(칩 경로) 동작 불변(회귀 가드).
- A-6: presumed 임계 발동/미발동 → presumedAdded 정확(P-2 결과 반영).

### 6.2 회귀
- `__tests__/tax-engine/inheritance/inheritance-summary.test.ts` — totalEstate anchor `7,030,000,000` **불변 확정**: fixture의 stock 항목(`estate_listed_h`·`estate_unlisted_m`)은 **category "other" + marketValue**(150M·500M)라 explicit path → 위임 전후 동일(V1 `unlistedStockData` 미사용). **이 fixture는 V1 경로를 검증하지 않음** → A-1(V1)은 별도 fixture 필요.
- 칩·결과뷰 평가액 anchor 불변(§66 MAX·blast radius 0).
- 전체 `npm test` + E2E `inheritance-unlisted-stock-gross-estate`(V1/V2 사이드바 반영).

## 7. Out of scope (명시)
- §66 securedClaim MAX 사이드바↔하단 괴리(별도 결정).
- `TotalEstimatedValue`(C) — 비주식·§66 MAX 보유, 미변경.

## 8. DoD
- [ ] 비상장 V1 사이드바·주식 그룹 헤더 반영.
- [ ] §63 변형·V2(valuationDate)·deposit·similarSales 사이드바=엔진 일치.
- [ ] 무인자 A 호출(칩·결과뷰) 동작 불변·§66 MAX 불변.
- [ ] presumed probe 분류 후 정확 반영.
- [ ] `tsc` 0 + inheritance-summary.test + 전체 npm test + E2E.
