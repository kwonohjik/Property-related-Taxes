# 계획서 — 상속세 사이드바 "합계 미리보기" 주식·추정상속 누락 수정

> 상태: Plan · 작성일 2026-06-09 · 대상: 상속세 마법사 좌측 사이드바 총상속재산 합계
> 증상: 좌측 "합계 미리보기"의 총상속재산에 **주식(특히 비상장 간편 V1)·추정상속재산이 반영되지 않음**

## 1. 배경 / 문제

좌측 사이드바(`InheritanceSidebar`)의 **총상속재산**이 입력한 주식·추정상속재산을 누락. 근본 원인은 **자산 평가액을 도출하는 함수가 3벌로 분기(triple dual-truth)** 되어 각자 커버 범위가 다르기 때문 (메모리 `feedback_ui_engine_dual_truth_avoidance` 위반).

| # | 함수 | 위치 | 받는 자산 | 커버 범위 | 누락 |
|---|---|---|---|---|---|
| A | `computeEffectiveValuation` → `computeStockValuation` (엔진·UI 칩·결과뷰 소스) | `lib/calc/estate-item-valuation.ts:23` · `lib/tax-engine/valuation/resolve-estate-item-value.ts:67` | item 1건 | 부동산·예금·금융·상장(§63 변형)·비상장 **V1**·비상장 V2 | **§66 securedClaim MAX 부재**(확정 — `estate-item-valuation.ts` Math.max 없음) |
| B | **`estimateAssetValue`** (사이드바 + 주식 그룹 헤더) | `lib/stores/inheritance-summary.ts:76` | estateItems + **stockItems** + (그룹헤더) | V2·marketValue·standardPrice·appraised·상장(plain avg×shares) | **비상장 V1(`unlistedStockData`)=0**, deposit(leaseDeposit), similarSalesValue, §66 MAX, 상장 §63 변형 |
| C | `TotalEstimatedValue` (하단 "재산 합계 (예상)") | `components/calc/property-valuation-preview.tsx:87` | **estateItems만**(비주식, `PropertyValuationForm:491`·`Step1Estate:56`) | 부동산·예금·금융·§66 MAX | (주식은 받지 않음 — 설계상 정상) |

→ **확정 버그(주식 누락)**: 사이드바 합산 `sumEstateItemsValuation(stockItems)`(`inheritance-summary.ts:126,153`)→`estimateAssetValue`에 **비상장 V1 분기가 없어 0 반환**. 동일 함수가 `Step1Estate.tsx:28` 주식 그룹 헤더 `stockTotal`에도 사용 → 그룹 헤더도 V1 0. 엔진 `computeStockValuation:105-112`(`result.perShareFinalValue × ownedShares`)은 V1 처리 → 엔진↔사이드바 불일치.

→ **C는 주식 누락 원인 아님**: `TotalEstimatedValue`는 `form.estateItems`(비주식)만 받음. 주식은 `StockValuationForm`(별도, `Step1Estate:73`)이 담당. C의 "주식 미처리"는 설계상 정상.

→ **부차 dual-truth(§66 MAX)**: B(사이드바)는 §66 securedClaim MAX 미적용, C(하단 비주식)·A는? — **A도 §66 MAX 부재**(확정). C만 §66 MAX 보유. 따라서 부동산 고담보(저당+임대보증금 > 평가액) 케이스에서 **사이드바(B) < 하단(C)** 괴리. 사용자 보고(주식·추정)와 별개이나 진정한 단일 소스화 시 함께 해소 필요.

## 2. 실측 근거 (file:line)

- 사이드바 합산 진입: `InheritanceSidebar.tsx:34-37` → `computeInheritanceSummary(form, result)`.
- form 배선 정상: `InheritanceTaxForm.tsx:607` `<InheritanceSidebar form={{ ...form, valuationDate: form.deathDate || undefined }} />` — `form.stockItems`·`form.presumedItems` spread 전달(누락 아님).
- 합산: `inheritance-summary.ts:151-153` `estateValueRaw = sumEstateItemsValuation(estateItems) + sumEstateItemsValuation(stockItems)`.
- `estimateAssetValue`(`:76-109`): V2(`:78-94`)·marketValue/standardPrice/appraised(`:97-99`)·상장 avg×shares(`:100-107`). **`unlistedStockData`(V1) 분기 부재** → V1 주식 0.
- 엔진 단일 소스 `computeStockValuation`(`resolve-estate-item-value.ts:67`): 상장 §63 변형(`:68-87`)·V2(`:93-100`)·**V1 `calcUnlistedStockPerShareValue × ownedShares`(`:105-112`)**.

## 3. 추정상속재산(§15) — 코드상 합산됨 (Pre-Do probe로 확정 필요)

- `computeInheritanceSummary:156` `presumedAdded = sumPresumedItems(form.presumedItems)` → `:198` `totalEstate = estateValueRaw + presumedAdded`. **추정상속은 totalEstate에 가산됨**.
- `evaluatePresumedItem`(`presumed-inheritance.ts:68`): §15 임계(1년 ≥2억 또는 2년 합 ≥5억) **발동 시에만** `addedAmount = max(0, (1년+2년) − 사용처확인 − Min(처분액×20%, 2억))` 가산. 미발동 시 0.
- 따라서 "추정상속 누락" 가능성:
  - (a) **임계 미발동** → addedAmount 0 (정상 동작, 버그 아님)
  - (b) **순액(§15) vs 사용자가 기대한 총액 인식 차이** (정상이나 UI 설명 부족)
  - (c) **실제 배선/평가 버그** (예: presumedItems가 사이드바 form에 비어 도달)
- **Pre-Do 필수**: 사용자 시나리오(주식+추정 동시 입력)를 anchor로 재현해 (a)/(b)/(c) 중 무엇인지 확정 후 대응. 추정 금지.

## 4. 목표 / 비목표

**목표**
- 사이드바 총상속재산이 **비상장 V1 포함 모든 주식**을 반영.
- 추정상속재산이 §15 규정대로 정확히 반영(probe로 확정한 결과에 따라 코드 수정 or UI 설명).
- dual-truth 해소 — 사이드바·하단·칩·엔진이 **단일 평가 소스** 공유.

**비목표**
- §15 추정 산식 변경(임계·20% 차감은 법정 — 유지).
- 엔진 input/result·API·결과뷰 계산 변경.

## 5. 설계 (옵션)

### 5.1 옵션 A (권장) — 단일 소스 위임 (dual-truth 근본 해소)

**`estimateAssetValue`(B)를 `computeEffectiveValuation`(A)로 위임**. §66 MAX는 건드리지 않음(scope 제외 — §5.3).

- B(`sumEstateItemsValuation`이 호출, 사이드바 + 주식 그룹 헤더 공용)를 `computeEffectiveValuation(item, valuationDate)`로 교체.
- **(필수) V2 evaluationDate fallback**: A는 `valuationDate` 미수령 → V2 evaluationDate 미입력 시 0 위험(현재 B `:80-86`이 주입). `computeStockValuation`/`computeEffectiveValuation`에 **optional `valuationDate` 파라미터 추가**해 V2 evaluationDate fallback 주입을 A에 내장.
- **동작 변경(개선)**: 위임 시 사이드바가 **비상장 V1·상장 §63 변형·deposit(leaseDeposit)·similarSalesValue**를 모두 반영(현재 B는 이들 0). 모두 과소계상 정정 방향 — 의도된 개선.
- **§66 MAX 불변**: A·B 모두 §66 MAX 미보유 → 위임해도 사이드바 §66 동작 변화 없음(중립). 칩·결과뷰(A 사용처)도 평가액 불변 → blast radius 최소.
- C(`TotalEstimatedValue`)는 **손대지 않음**: §66 MAX 보유·비주식 전용. 위임 시 §66 MAX 소실 회귀 위험 → 제외.
- 효과: 사이드바·주식 그룹 헤더 ↔ 엔진 단일 소스 일치(주식 V1 등 해소). A 자체 변경은 valuationDate 파라미터 추가뿐(기존 호출 무인자 → 동작 불변).

### 5.2 옵션 B (최소) — `estimateAssetValue`에 V1 분기 추가

`estimateAssetValue`에 `computeStockValuation:105-112`과 동일한 V1 분기 추가:
```
if (item.category === "unlisted_stock" && item.unlistedStockData) {
  const d = item.unlistedStockData;
  if (d.totalShares > 0 && d.ownedShares > 0) {
    const r = calcUnlistedStockPerShareValue(d, d.isRealEstateHeavy ?? false);
    return r.perShareFinalValue * d.ownedShares;
  }
}
```
- 장점: 변경 최소·회귀 위험 낮음(stock 카테고리 한정). 단점: dual-truth 유지(상장 §63 변형·deposit·similarSales 사이드바 누락 미해결).

### 5.3 §66 securedClaim MAX 사이드바↔하단 괴리 — 본 작업 scope 제외

B(사이드바)는 §66 MAX 미적용, C(하단 비주식)만 적용 → 부동산 고담보 케이스에서 사이드바 < 하단. **사용자 보고(주식·추정)와 무관**하고, A에 §66 MAX 추가 시 칩·결과뷰 평가액까지 상승(blast radius 큼). → **별도 결정 사안으로 분리**, 본 작업에서 사이드바 §66 동작 변경하지 않음.

**권장: 옵션 A**(B→A 위임, §66 MAX 불포함). 옵션 B는 최소 패치 대안.

## 6. 리스크 & 대응

| ID | 리스크 | 대응 |
|---|---|---|
| R-1 | A에 `valuationDate` 미추가 시 V2 evaluationDate fallback 소실 → V2 주식 0 회귀 | `computeEffectiveValuation`/`computeStockValuation`에 optional valuationDate 추가, V2 inject. anchor: evaluationDate 미입력 V2 |
| R-2 | A를 §66 MAX 포함으로 바꾸면 칩·결과뷰·HeirAllocation effectiveValuation 전파(미보고 동작 변경) | §66 MAX는 A에 넣지 않음(§5.3 scope 제외). B 위임은 §66 중립 |
| R-3 | B 위임이 사이드바·주식 그룹 헤더(`Step1Estate.tsx:28`) 동시 영향 | 둘 다 `sumEstateItemsValuation`→`estimateAssetValue` 경유 → 단일 교체로 일괄 정정(드리프트 0). C는 별도(미변경) |
| R-4 | 추정상속이 실제로는 정상(임계 미발동)인데 코드 수정 시도 → 오수정 | §3 Pre-Do probe로 (a)/(b)/(c) 확정 전 presumed 코드 변경 금지 |
| R-5 | B→A 위임 시 deposit·similarSales 사이드바 반영 추가(동작 변경) | 과소계상 정정 방향 — 의도된 개선. anchor로 deposit·similarSales 반영 확인 |
| R-6 | `valuationDate` 파라미터 추가가 기존 무인자 호출(칩 등) 동작 변경 | optional + 기본 미주입 → 무인자 호출 동작 불변. tsc로 시그니처 호환 확인 |

## 7. 테스트 계획

- **Pre-Do anchor (필수, §3·§5 확정용)**:
  - P-1: 비상장 V1(`unlistedStockData` 완전) 1건만 → `sumEstateItemsValuation` > 0 기대 → **현재 RED(0)** 확인.
  - P-2: 추정상속 임계 발동 1건 → `computeInheritanceSummary().presumedAdded` > 0 (GREEN 예상 — presumed 정상 입증) / 임계 미발동 → 0(정상).
  - P-3: A의 §66 securedClaim MAX·valuationDate 처리 실측(옵션 A 통합 범위 확정).
- **수정 후 anchor**:
  - 비상장 V1 주식 → 사이드바 totalEstate 반영.
  - 상장 §63 변형(취득후상장·증자) → 사이드바 = 엔진 일치.
  - V2 evaluationDate 미입력 + valuationDate 주입 → 반영(R-1).
  - 하단 `TotalEstimatedValue`에 주식 반영(옵션 A 시).
  - 회귀: 부동산·예금·금융·§66 MAX 기존 anchor 불변.
- 회귀: `npx vitest run __tests__/tax-engine/inheritance/inheritance-summary.test.ts` + 전체 `npm test`.
- E2E: 비상장 V1 주식 + 추정상속 입력 → 사이드바 총상속재산 증가 확인(`inheritance-unlisted-stock-gross-estate` 계열 확장).

## 8. 작업 단계 (Do)

1. **Pre-Do probe** P-1·P-2 실행 → 주식 V1 사이드바 RED(0) 확정 + presumed (a)/(b)/(c) 판정.
2. `computeEffectiveValuation`/`computeStockValuation`에 optional `valuationDate` 추가(V2 evaluationDate fallback 내장, 무인자 호출 동작 불변).
3. `estimateAssetValue` → `computeEffectiveValuation(item, valuationDate)` 위임으로 교체(옵션 A). 또는 옵션 B(V1 분기만 추가).
4. presumed: probe 결과 (c)면 배선 수정, (a)/(b)면 코드 불변(필요 시 UI 설명 보강).
5. anchor(§7) + 회귀(`inheritance-summary.test` + 전체) + E2E.
6. 브라우저/E2E로 사이드바 총상속재산·주식 그룹 헤더에 주식 V1 반영 확인.
   - **C(`TotalEstimatedValue`)·§66 MAX는 미변경**(scope 제외 §5.3).

## 9. 완료 기준 (DoD)

- [ ] 비상장 V1 주식이 사이드바 총상속재산·주식 그룹 헤더에 반영.
- [ ] 상장 §63 변형·V2(evaluationDate fallback 포함)·deposit·similarSales 사이드바 = 엔진 일치.
- [ ] 추정상속: probe로 (a)/(b)/(c) 확정 후 정확 반영(§15 순액 규정 준수).
- [ ] 사이드바·주식 그룹 헤더·엔진 **단일 평가 소스**(B→A 위임, dual-truth 해소).
- [ ] §66 MAX·C(`TotalEstimatedValue`)·칩·결과뷰 **불변**(scope 제외, blast radius 0).
- [ ] `valuationDate` optional 추가가 기존 무인자 호출 동작 불변(tsc 0).
- [ ] `inheritance-summary.test` + 전체 `npm test` 통과.
- [ ] 브라우저/E2E 확인 또는 미수행 명시.
