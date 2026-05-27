# 상속세 J-1 — 가업상속공제 raw 평가액 통일 (getValuatedAmount ↔ marketValue) 구현계획

> **Source**: 상속세 잔여 갭 triage 별도 트랙 J-1 ([[project_inheritance_remaining_gaps_triage]]) — `family-business.ts:130` `marketValue ?? 0` ↔ `getValuatedAmount` 5단계 우선순위 이원화.
> **Date**: 2026-05-27
> **실증 완료**: probe로 numeric 갭 확인 — appraisedValue/standardPrice/비상장 V2로 평가한 가업주식이 `deriveFamilyBusinessValue=0` → 자격 충족에도 **가업상속공제 0원 누락**(대조군 marketValue는 정상). 비상장 V2 가업주식이 가장 현실적 트리거(mirror-pattern으로 marketValue 구조적 미충전).
> **정책**: [[feedback_numeric_impact_verify_before_bug_claim]] · [[single-source-engine-helper]] · [[feedback_pre_anchor_verification]] · [[feedback_engine_result_display_drift]]

---

## 1. 법령 근거 + 갭의 본질

### 1.1 §60 평가 우선순위 위반

- 상증법 §60: 상속재산 평가는 **시가** 우선, 시가 산정 곤란 시 **보충적평가**(§61~§66, 부동산 기준시가·비상장주식 §63 등).
- 가업상속공제(§18의2)의 "가업상속재산가액"도 §60 평가액 = `시가(marketValue) → 감정가(appraisedValue) → 기준시가(standardPrice) → 비상장 보충적평가(V2)` 순.
- **현행 `deriveFamilyBusinessValue`는 `marketValue ?? 0`만 읽음** → 시가 미입력(보충적평가만 있는) 가업자산을 **0으로 평가** → §60 보충적평가 무시. **법령 위반 + 공제 누락**.

### 1.2 실증된 갭 (probe)

| 가업자산 평가 경로 | `deriveFamilyBusinessValue`(가업 자동합산) | `getValuatedAmount`(suggest·ResultView) |
|---|---|---|
| marketValue 50억 | 50억 ✅ | 50억 |
| appraisedValue 50억 (시가 없음) | **0** 🔴 | 50억 |
| standardPrice 50억 | **0** 🔴 | 50억 |
| 비상장 V2 평가 | **0** 🔴 (computeStockValuation 미호출) | 정상 |

→ 다운스트림: 자격 전부 충족(`eligible=true`)인데 `autoDerived=0` → **deduction=0** (최대 600억 한도 누락).

> **일반성(C)**: 갭은 **주식에 국한되지 않음** — 공장(real_estate_building)·사업용 토지 등 비주식 가업자산도 시가(marketValue) 없이 기준시가(standardPrice)·감정가(appraisedValue)만 있으면 현재 `deriveFamilyBusinessValue=0`. `resolveEstateItemValue` 통일로 **모든 가업자산 유형이 §60 보충평가까지 정상 반영**(주식은 V2 추가).

### 1.3 발동 조건 (정책 — 조건부 실재)

`inheritance-deductions.ts:679` → `familyBusinessValueOverride: input.familyBusinessValue`. 발동 = ① Phase B 모드 + ② `familyBusinessValue` override **미입력**(→ auto-derive) + ③ 가업자산이 marketValue 외(특히 **비상장 V2** — marketValue 구조적 미충전)로 평가. marketValue 입력 or override 시 무해.

---

## 2. 레이어 분석 (해소의 핵심)

| 함수 | 위치 | 의존 |
|---|---|---|
| `getValuatedAmount` (5단계) | `lib/calc/inheritance-deduction-suggest.ts:70` | `computeStockValuation`(lib/calc) |
| `computeStockValuation` | `lib/calc/stock-valuation.ts:57` | **전부 lib/tax-engine** (evaluateListedStockValue·calcUnlistedStockPerShareValue·resolveUnlistedDisplayMode·evaluateUnlistedStockV2). **lib/calc·component 의존 0** |
| `deriveFamilyBusinessValue` | `lib/tax-engine/deductions/family-business.ts:125` | 순수 엔진 — **lib/calc import 금지(레이어 역전)** |

★ **핵심 발견**: `computeStockValuation`은 lib/calc에 있으나 **내부 의존이 전부 엔진** → 엔진으로 **이동 가능**(레이어 위반 없음). 이동하면 family-business(엔진)가 직접 재사용 가능 → 레이어 역전 회피.

---

## 3. 설계 결정

### D-1. `computeStockValuation`·`resolveUnlistedDisplayMode`·5단계 로직을 엔진으로 이동 (Approach C — single source)

신규 `lib/tax-engine/valuation/resolve-estate-item-value.ts`:
```ts
// ★ computeStockValuation은 resolveUnlistedDisplayMode를 호출(같은 lib/calc 파일) → 이것도 동반 이동(A).
//   resolveUnlistedDisplayMode는 EstateItem 필드 접근만(pure) → 이동 무손실.
export function resolveUnlistedDisplayMode(item: EstateItem): "simple" | "formal" { /* 기존 본문 */ }
export function computeStockValuation(item: EstateItem): number { /* 기존 본문 그대로 */ }

// getValuatedAmount 5단계 로직 이동 (§60 평가 우선순위)
export function resolveEstateItemValue(item: EstateItem): number {
  if (typeof item.marketValue === "number" && item.marketValue > 0) return item.marketValue;
  if (typeof item.appraisedValue === "number" && item.appraisedValue > 0) return item.appraisedValue;
  if (typeof item.standardPrice === "number" && item.standardPrice > 0) return item.standardPrice;
  if (item.category === "listed_stock" || item.category === "unlisted_stock") return computeStockValuation(item);
  return 0;
}
```

### D-2. lib/calc는 re-export (import 사이트 무변경)

- `lib/calc/stock-valuation.ts`: `export { computeStockValuation, resolveUnlistedDisplayMode } from "@/lib/tax-engine/valuation/resolve-estate-item-value"` (기존 본문 **2개** 제거, A). StockValuationForm·EstateCommonAttributesSection 등 import 사이트 무변경([[feedback_800line_split_export_preservation]]).
- `lib/calc/inheritance-deduction-suggest.ts`: `getValuatedAmount`를 `resolveEstateItemValue` 호출 wrapper로(또는 re-export). 기존 export 보존 → InheritanceTaxResultView 무변경.

### D-3. `deriveFamilyBusinessValue` 통일

```ts
// const raw = item.marketValue ?? 0;  ← 제거
const raw = resolveEstateItemValue(item); // §60 평가 우선순위 (시가→감정→기준시가→V2)
// 이후 corporate_stock 사업무관자산 차감(§15⑤2호)은 그대로 — raw는 차감 전 gross
```

### D-4. 이중차감 가드 (corporate 사업무관자산)

`resolveEstateItemValue`는 **gross 평가액**(getValuatedAmount와 동일 — 사업무관자산 차감 안 함). `deriveFamilyBusinessValue`가 그 위에 `calcCorporateStockAdjustedValue`(§15⑤2호) 적용 → 이중차감 없음(현행과 동일 구조, raw 소스만 교체). `getCorporateAdjustedAmount`(suggest 내부)와도 일관.

### D-5. 영농상속공제(§18의3) — 갭 없음 확정 (scope 제외, B)

`calcFarmingDeduction(farmingAssetValue, farming, estateItems)` 코드 확인 결과:
- 값은 **`farmingAssetValue` 단일입력**에서 옴(`safeAssetValue = Math.max(0, farmingAssetValue)`).
- `estateItems`(3번째 인자)는 **`checkFarmingResidenceCompliance`(거주요건 echo) 전용** — raw 평가액 도출 아님.
→ 영농은 marketValue 기반 auto-derive가 **애초에 없음** → J-1 갭 무관. 메모리 triage("영농=farmingAssetValue 단일입력") 일치. **본 PR scope 제외 확정.** farming 변경 0.

### D-6. 회귀 — marketValue tier-1 우선이라 기존 동작 보존

marketValue 있는 자산은 tier-1로 동일 결과. 변경은 marketValue 없는(보충적평가) 자산뿐(0 → 정상). 기존 family-business anchor가 marketValue 사용 시 회귀 0.

---

## 4. 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| S-1 | `lib/tax-engine/valuation/resolve-estate-item-value.ts` | **신규** — resolveUnlistedDisplayMode + computeStockValuation 이동 + resolveEstateItemValue(5단계) |
| S-2 | `lib/calc/stock-valuation.ts` | computeStockValuation·resolveUnlistedDisplayMode 본문 2개 제거 → 엔진 re-export (import 사이트 무변경, A) |
| S-3 | `lib/calc/inheritance-deduction-suggest.ts` | getValuatedAmount → resolveEstateItemValue wrapper/재사용 (단일 진실) |
| S-4 | `lib/tax-engine/deductions/family-business.ts` | `deriveFamilyBusinessValue` raw = resolveEstateItemValue(item). 주석 "별도 트랙" 제거 |
| S-5 | ~~farming~~ | **변경 없음** — 영농은 farmingAssetValue 단일입력, 갭 무관(D-5/B) |
| S-6 | 결과 표시 | autoDerivedValue echo는 기존 detail.autoDerivedValue 자동 반영 — UI 변경 최소(결과카드가 이미 detail 표시) |

> 순환 의존 확인: resolve-estate-item-value → property-valuation-stock + unlisted-orchestrator (역방향 deductions import 없음). family-business → resolve-estate-item-value. 사이클 0.

---

## 5. Pre-Do anchor (RED 우선)

`__tests__/tax-engine/deductions/family-business-raw-valuation-j1.test.ts` (신규):

- **J1-1 (RED→GREEN)**: 가업 corporate_stock·appraisedValue 50억(marketValue 없음) → `deriveFamilyBusinessValue=50억` (현재 0 → RED).
- **J1-2**: standardPrice 50억 → derive=50억.
- **J1-3 (비상장 V2)**: familyBusinessCategory=corporate_stock·category=unlisted_stock·unlistedStockValuationV2(유효) → derive = V2 totalValuation (현재 0 → RED).
- **J1-4 (다운스트림)**: J1-1 자산 + 자격 충족 + override 미입력 → `calcFamilyBusinessDeductionPhase2.deduction=50억` (현재 0).
- **J1-5 (이중차감 가드)**: corporate_stock + corporateTotalAssets 입력 → resolveEstateItemValue gross 위에 §15⑤2호 차감 1회만 (이중차감 0).
- **J1-6 (marketValue 우선 회귀)**: marketValue 30억 + appraisedValue 50억 동시 → derive=30억 (tier-1 우선, 기존 동작).
- **J1-7 (단일 진실)**: `resolveEstateItemValue(item) === getValuatedAmount(item)` 동치 (re-export 후).
- **J1-8 (비주식 가업자산, C)**: real_estate_building(공장)·familyBusinessCategory="business_real_estate"·standardPrice 50억(marketValue 없음) → derive=50억 (현재 0 → RED). 주식 외 유형 일반성 검증.
- **(회귀)**: 기존 family-business(FB-AUTO marketValue)·deduction-suggest·besshi 전체 GREEN. 영농 anchor 무변경(D-5 제외).

---

## 6. Definition of Done

- [ ] J1-1~8 + 회귀 통과 (RED 선확인)
- [ ] marketValue 있는 자산 numeric 0 변동(회귀, [[feedback_numeric_impact_verify_before_bug_claim]])
- [ ] computeStockValuation import 사이트 무변경(re-export grep 확인)
- [ ] resolveEstateItemValue ≡ getValuatedAmount 동치(J1-7)
- [ ] 순환 의존 0 (`npx tsc --noEmit` + madge 또는 import 추적)
- [ ] 800줄 — 신규 resolver ≤150줄
- [ ] §60 평가 우선순위 + §18의2 인용 주석
- [ ] `npm test` 전수 + (UI 영향 시) e2e
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do)

1. Pre-Do 확인 완료: 영농 갭 없음(B, farmingAssetValue 단일입력) + 기존 FB-AUTO anchor가 marketValue 사용(R-6 회귀 안전).
2. J1-1 RED → S-1 신규 resolver(resolveUnlistedDisplayMode+computeStockValuation 이동 + resolveEstateItemValue) → S-2 stock-valuation re-export 2개 → S-3 getValuatedAmount 통일 → S-4 family-business raw 교체 → J1-1~7 GREEN.
3. Check: 순환 의존 점검 + `ui-engine-sync-checker`(결과카드 detail) + 전체 회귀.

---

## 8. 리스크

- **R-1 레이어 역전**: family-business(엔진)가 lib/calc import하면 위반. → computeStockValuation 엔진 이동(D-1)으로 회피. 신규 resolver는 엔진 위치.
- **R-2 순환 의존**: resolver → unlisted-orchestrator. orchestrator가 resolver/deductions import하면 사이클. 확인 결과 역방향 없음 — Pre-Do madge/tsc 재확인.
- **R-3 import 사이트 strip**: computeStockValuation·**resolveUnlistedDisplayMode 2개** 이동 시 re-export 누락하면 StockValuationForm·EstateCommonAttributesSection 깨짐. S-2 re-export 2개 + grep 전수([[feedback_800line_split_export_preservation]]).
- **R-4 이중차감**: resolveEstateItemValue가 gross 반환 보장(corporate 차감 미포함). J1-5로 고정.
- **R-5 V2 평가액 의미**: 비상장 V2 totalValuation은 §63③ 할증 포함값 — 가업상속재산가액으로 적정(§60 평가액). getValuatedAmount와 동일 소스라 일관.
- **R-6 회귀(기존 anchor)**: 기존 family-business anchor가 marketValue 없이 0 기대하면 변경됨 — Pre-Do로 전수 확인 후 진행. (FB-AUTO는 marketValue 사용 확인 → 안전.)
- **R-7 getValuatedAmount 호출처(DR-1)**: getValuatedAmount는 **현재 이미 5단계** → 엔진 이동은 동작 무변경(재배치). `InheritanceTaxResultView` 등 기존 호출처 **영향 0**. 유일한 동작 변경 = `deriveFamilyBusinessValue` 채택. numeric 변화는 가업상속 auto-derive에만 국한 → 회귀 오해 금지.

---

## 9. 후속 PR

- 동일 `marketValue ?? 0` 패턴이 다른 공제(동거주택·금융재산 등)에도 있으면 동일 resolver로 통일(별도 스캔).

---

## 10. 한계

- **§60 시가 판정은 사용자 입력 신뢰** — marketValue/appraised/standard/V2 중 무엇을 채울지는 사용자 책임. resolver는 우선순위만 제공.
- **영농상속공제는 본 PR 무관**(farmingAssetValue 단일입력, 갭 없음 — D-5/B 확정).
