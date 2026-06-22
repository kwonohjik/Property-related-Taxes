# EstateItem 평가액 단일 진실화 — 엔진/평가 경로 설계

> 계획서: [`docs/00-pm/estate-valuation-single-source.plan.md`](../../00-pm/estate-valuation-single-source.plan.md)
> 세목: 증여·상속 공용 평가 · 영역: §60~§66 · 규모: 중(엔진 input/result 타입 불변, 평가 경로 통합 리팩터링)
> 검증: 인용 file:line 실측. 추정 금지.

## 1. 현행 평가 경로 4갈래 (실측)

| 함수 | 파일:line | 시그니처 | §61⑤환산 | 미임대 | §66하한 | 주식 |
|---|---|---|---|---|---|---|
| `evaluateEstateItem` | `property-valuation.ts:454` | `(item)→PropertyValuationResult` | ✅ | ✅ | ✅ | **throw** |
| `evaluateAllEstateItems` | `property-valuation.ts:498` | `(items[])→Result[]` | ✅ | ✅ | ✅ | ✅(라우팅) |
| `resolveEstateItemValue` | `valuation/resolve-estate-item-value.ts:134` | `(item)→number` | ❌ | ❌ | ❌ | ✅ fallback |
| `computeEffectiveValuation` | `lib/calc/estate-item-valuation.ts:23` | `(item, valuationDate?)→number` | ❌ | ❌ | ❌ | ✅ computeStockValuation |
| `property-valuation-preview.tsx` 재구현 | `:17~50`·`:92~133` | inline | ❌ | ❌ | ✅(`Math.max`) | — |

- `evaluateEstateItem`은 주식이면 throw(`:454` 분기) → 주식은 `evaluateAllEstateItems`가 `evaluateStockAsPropertyResult`/`evaluateUnlistedStockV2AsPropertyResult`로 라우팅.
- `evaluateAllEstateItems(items)`는 **valuationDate 인자 없음**(실측 `:498`). 주식 V2는 `i.unlistedStockValuationV2` 자체 날짜 사용(`evaluateUnlistedStockV2AsPropertyResult:601`).
- `computeEffectiveValuation`의 `valuationDate`는 `computeStockValuation(item, valuationDate)`로 전달(주식 V2 evaluationDate fallback). → 위임 시 보존 필수(hybrid 근거).
- 순환 의존 ✅ 없음: `property-valuation.ts`는 `estate-item-valuation.ts`를 import 안 함(실측).

## 2. 설계 — hybrid 위임 (입력/출력 타입 불변) ⚠️ Do 환류

`computeEffectiveValuation` 시그니처·8개 호출처 무변경. **부동산만 엔진 위임**, 나머지는 §60 chain 보존:

> **Do 환류(2026-06-22)**: 초안의 "전 카테고리 evaluateEstateItem 위임"은 financial·무효 category에서
> §60 chain(전 category 공통 우선순위 `marketValue??appraised??standardPrice`)을 깨 기존 테스트 4건 회귀
> (estate-item-valuation 3·estate-group-sum 1). `evaluateEstateItem`은 category별 분기라 financial은
> marketValue만·"real_estate"(무효 테스트 category)는 other(marketValue만)로 처리하기 때문.
> → **부동산만 위임**으로 축소(임대 dual-truth 해소는 그대로 — 임대 부동산은 보충평가라 위임됨).

```ts
// lib/calc/estate-item-valuation.ts
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
// computeStockValuation은 기존 import 유지

export function computeEffectiveValuation(item: EstateItem, valuationDate?: string): number {
  // 부동산: 엔진 위임 (임대료환산·미임대·담보하한·부수토지·§60 우선순위 전부)
  if (item.category === "real_estate_land" || item.category === "real_estate_building" || item.category === "real_estate_apartment") {
    try { return evaluateEstateItem(item).valuatedAmount; } catch { return 0; }
  }
  // 주식: §60 시가 우선 후 §63 보충평가(valuationDate fallback 보존)
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    if (item.marketValue && item.marketValue > 0) return item.marketValue;
    if (item.appraisedValue && item.appraisedValue > 0) return item.appraisedValue;
    if (item.similarSalesValue && item.similarSalesValue > 0) return item.similarSalesValue;
    return computeStockValuation(item, valuationDate);
  }
  if (item.category === "deposit") return item.leaseDeposit ?? 0;
  // cash·financial·기타: §60 명시값 chain (엔진 evaluateCash/Financial=marketValue만과 실무 정합)
  return item.marketValue ?? item.appraisedValue ?? item.similarSalesValue ?? item.standardPrice ?? 0;
}
```

- ✅ 실측: `evaluateEstateItem` switch(`:454`)는 throw가 listed/unlisted_stock만 — 부동산 위임 안전.
- deposit는 `evaluateRentalConversion`(`:358`)이 `leaseDeposit<=0`이면 throw(`:365`) → 위임 대신 직접 `leaseDeposit??0` 처리로 회피.
- `property-valuation-preview.tsx`의 수동 재구현 삭제 → `computeEffectiveValuation` 호출(4번째 경로 소멸).

## 3. resolveEstateItemValue A/B 결정 매트릭스 (Do 전 §66 실측 후 확정)

`resolveEstateItemValue`는 검증(`inheritance-validate`)·공제 제안(`deduction-suggest`)·결과 별지에서 **공제 기초 gross**로 쓰인다.

| 항목 | A안 (엔진 위임) | B안 (부분 반영) | 법적 근거 |
|---|---|---|---|
| §61⑤ 임대료환산·미임대 | 반영 | 반영 | §60 평가액 자체 → 양안 반영 |
| §66 담보하한 | 반영(evaluateEstateItem) | **제외**(gross 유지) | 🔎 §18·§22 공제 기초가 §66 하한 포함하는지 실측 |
| 구현 | 부동산만 `evaluateEstateItem` 위임(주식 fallback 유지) | 임대료환산·미임대만 추가 헬퍼 | — |
| 리스크 | 공제 numeric 변동(§66 포함 시) | 헬퍼 중복(임대료환산 재구현) | — |

> 결정 기준: §66 담보하한이 상속재산가액(공제 기초)에 포함이면 A안, "담보 전 gross"가 공제 기준이면 B안.
> 미확정 시 본 PR에서 `resolveEstateItemValue`는 **무변경 유지**하고 별도 후속(범위 축소)도 가능.

## 4. 케이스 인벤토리 (anchor)

| ID | 입력 | 현행 computeEffectiveValuation | 위임 후(기대) | 검증 포인트 |
|---|---|---|---|---|
| SS-1 | 건물 std 321,300,000 + appurtenant 330,000,000 + 월세 2,000,000 + 보증금 5억 | 651,300,000 | **700,000,000** | 임대료환산 반영 |
| SS-2 | SS-1 + 미임대(720/180/75,600,000) | 651,300,000 | **858,100,000** | 미임대 특례 반영 |
| SS-3 | 임대 부동산 + 채무 7억 (gift-tax-form-validate 채무초과) | 경고 발동(651,300,000) | 경고 해제(700,000,000) | 차단 정합(세액 아님) |
| SS-4 | deposit leaseDeposit 미입력(0) | 0(현행 leaseDeposit??0) | 0(try/catch 가드) | throw 안 함 |
| SS-5 | 상장/비상장 V1·V2 주식 | computeStockValuation | **동일**(회귀) | valuationDate fallback 보존 |
| SS-6 | 시가(marketValue) 입력 부동산 | marketValue | marketValue(동일) | §60 우선순위 회귀 |
| SS-7 | cash·financial·other (marketValue 입력) | marketValue | marketValue(동일) | evaluateCash/Financial/other 위임이 현행 explicit chain과 동등(회귀). ⚠️ financial은 §22 금융재산공제를 평가액에 섞지 않는지 확인 |

## 5. 동기화 지점 (엔진 타입 불변 → 14지점 신규 없음)

엔진 input/result 타입 변경 없음 → 신규 Zod/API/route 없음. 영향은 **평가 경로 내부**:

| 지점 | 파일 | 변경 |
|---|---|---|
| 핵심 | `lib/calc/estate-item-valuation.ts:23` | hybrid 위임 |
| 미리보기 | `property-valuation-preview.tsx` | 재구현 삭제→위임 호출 |
| 검증/공제 | `resolveEstateItemValue` 등 | §3 A/B 결정 |
| 차단 | `gift-tax-form-validate.ts:229` | 위임 자동 반영 + 분기 단순화 |
| 배분 | `handleChipClick.ts:90`·`EstateChipInlineExpand.tsx:123` | 위임 자동(코드 무변경) |

## 6. 회귀 위험

- **주식 평가**(SS-5): hybrid로 보존하지 않으면 valuationDate fallback 소실 → V2 평가 회귀. **최우선 anchor**.
- **공제 numeric**(§3 A안 채택 시): resolveEstateItemValue 변경 → 금융·가업·영농 공제액 변동 → 상속세 전반. 전체 회귀 필수.
- **deposit throw**: try/catch 누락 시 입력 단계 UI 크래시.
- **cash/financial/other 동등성**(SS-7): 위임 후 `evaluateCash`/`evaluateFinancial`/other 산출이 현행
  explicit chain(marketValue)과 동일해야 함. ⚠️ `evaluateFinancial`이 §22 금융재산공제를 **평가액에 섞으면**
  표시값 변동 → Do 전 `evaluateFinancial` 실측(공제는 별도 단계여야 정상). 다르면 financial은 hybrid 분기 추가.
- **성능**: 자산 N건 사이드바 합계 N회 호출(순수 함수, useMemo 유지). 측정 후 필요 시 메모이즈.
