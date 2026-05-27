# 가업상속공제 raw 평가액 통일 (J-1) — 엔진 설계

> **Plan**: `docs/00-pm/inheritance-family-business-raw-valuation-unification-j1.plan.md`
> **UI**: `inheritance-family-business-raw-valuation-unification-j1.ui.design.md` (경량 — 신규 위젯 0)
> **유형**: 평가액 도출 단일화 + 레이어 정리 리팩터(엔진 이동). 신규 평가방법 아님.
> **실증**: probe로 갭 확인(appraised/standard/V2 가업자산 → derive=0, 공제 누락). [[feedback_numeric_impact_verify_before_bug_claim]]

## Context

가업상속공제(§18의2) auto-derive(`deriveFamilyBusinessValue`)가 raw 평가액을 `item.marketValue ?? 0`로만 읽어, 시가 없이 감정가·기준시가·비상장 V2로 평가된 가업자산을 **0**으로 산입 → §60 보충평가 무시 + 공제 누락(최대 600억). `getValuatedAmount`(5단계 §60 우선순위)와 이원화.

**해소 = 단일 진실 + 레이어 정리**: `getValuatedAmount`의 5단계 로직과 의존 함수(`computeStockValuation`·`resolveUnlistedDisplayMode`)를 **엔진으로 이동**(이들 내부 의존이 전부 엔진이라 무손실) → 순수 엔진 `family-business`가 직접 재사용(lib/calc import 역전 회피). lib/calc은 re-export로 import 사이트 보존.

**★ 일반성**: 갭·수정은 주식뿐 아니라 **모든 가업자산 유형**(공장·사업용 토지 등 standardPrice/appraisedValue만 있는 자산) 적용.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 | anchor | 테스트 | 상태 |
|---|---------|------|--------|--------|------|
| 1 | corporate_stock·appraisedValue 50억(시가 없음) → derive=50억 | §60·§18의2 | floor 50억 | J1-1 | ☐ TODO |
| 2 | standardPrice 50억 → derive=50억 | §60③ 보충평가 | 50억 | J1-2 | ☐ TODO |
| 3 | 비상장 V2 평가 → derive=V2 totalValuation(computeStockValuation) | §63·§54 | === computeStockValuation | J1-3 | ☐ TODO |
| 4 | 다운스트림: appraised 50억 + 자격충족 + override 미입력 → deduction=50억 | §18의2 | 50억(현 0) | J1-4 | ☐ TODO |
| 5 | corporate_stock + corporateTotalAssets → §15⑤2호 차감 1회만(이중차감 0) | §15⑤2호 | 차감 1회 | J1-5 | ☐ TODO |
| 6 | marketValue 30억 + appraisedValue 50억 → derive=30억(tier-1 우선) | §60 시가우선 | 30억 | J1-6 | ☐ TODO |
| 7 | resolveEstateItemValue ≡ getValuatedAmount 동치 | (단일 진실) | === | J1-7 | ☐ TODO |
| 8 | 비주식(공장 business_real_estate)·standardPrice 50억 → derive=50억 | §60③ | 50억(현 0) | J1-8 | ☐ TODO |
| 9 | 회귀 — FB-AUTO(marketValue)·deduction-suggest·besshi GREEN | — | 전체 회귀 | (회귀) | ☐ TODO |

**규칙**: 행≥1 충족. J1-1 RED 선확인([[feedback_pre_anchor_verification]]). 회귀(9)는 marketValue 기존 anchor·import 사이트 보존 검증.

---

## 법령 근거

```
법 §60②③: 시가 우선(매매·감정·수용·공매가 포함), 시가 곤란 시 §61~§66 보충적평가(기준시가·§63 비상장 등).
법 §18의2: 가업상속재산가액 = §60 평가액 (시가→보충평가).
영 §15⑤2호: 법인주식 가업상속재산 = 주식가액 × (총자산 − 사업무관자산)/총자산. (raw 위에 적용)
```

§60 우선순위 ↔ resolveEstateItemValue 5단계: marketValue(시가) → appraisedValue(감정가, 시가 간주) → standardPrice(기준시가 보충평가) → 주식 computeStockValuation(상장 시세·비상장 §63) → 0.

---

## 엔진 input / result 타입

**타입 변경 0** — `EstateItem`·`FamilyBusinessInheritanceInput`·`FamilyBusinessDeductionDetail` 기존 필드 재사용. `deriveFamilyBusinessValue` 시그니처 무변경(raw 소스만 내부 교체). result `detail.autoDerivedValue`가 통일된 값 자동 echo.

---

## 계산 알고리즘 (단계별)

### S-1 신규 `lib/tax-engine/valuation/resolve-estate-item-value.ts` (≤150줄)

```ts
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluateListedStockValue, calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";

export function resolveUnlistedDisplayMode(item: EstateItem): "simple" | "formal" { /* 이동 */ }
export function computeStockValuation(item: EstateItem): number { /* 이동 — resolveUnlistedDisplayMode 호출 */ }

export function resolveEstateItemValue(item: EstateItem): number { /* 5단계 §60 우선순위 */ }
```

### S-2 lib/calc re-export
```ts
// lib/calc/stock-valuation.ts (본문 2개 제거)
export { computeStockValuation, resolveUnlistedDisplayMode } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
// lib/calc/inheritance-deduction-suggest.ts — getValuatedAmount = resolveEstateItemValue 재사용
```

### S-4 family-business
```ts
// const raw = item.marketValue ?? 0;  →
const raw = resolveEstateItemValue(item); // gross (§15⑤2호 차감 전)
```

**하류 무변경**: §15⑤2호 corporate 차감·캡·200% 가드·breakdown 모두 그대로. raw 소스만 교체.

---

## Silent fallback / 자동 안분 후보 식별

- **marketValue tier-1 우선** — 기존 동작 보존(회귀 0). 변경은 시가 없는 자산뿐(0 → §60 보충평가).
- **resolveEstateItemValue = gross** — corporate 사업무관자산 차감 미포함(이중차감 0, D-4). family-business가 위에 §15⑤2호 1회 적용.
- **자동 보정 아님** — §60 법정 평가 우선순위 구현. 빈값 임의 채움 없음(불완전 입력은 0 유지).
- **레이어**: 엔진 이동으로 family-business→lib/calc 역전 회피. 순환 0(resolver→orchestrator, 역방향 deductions import 없음).
- **★ getValuatedAmount 동작 무변경(DR-1, 회귀 오해 방지)**: getValuatedAmount는 **현재 이미 5단계 로직**. 본 PR의 엔진 이동은 **재배치(동작 동일, J1-7 동치)** 일 뿐 → 기존 호출처(`InheritanceTaxResultView`의 금융재산 등 eligibleAssets sum: 82·88행)는 **영향 0**. **유일한 동작 변경 = `deriveFamilyBusinessValue`가 marketValue-only→5단계 채택**. 즉 numeric 변화는 가업상속 auto-derive 경로에만 국한.

---

## 테스트 약속

- 케이스 9행 → J1-1~8 + 회귀. J1-1 RED 선확인.
- J1-1·2·6·8 원단위 `toBe()`. J1-3 `=== computeStockValuation(item)`(상대). J1-7 동치 `===`.
- J1-5 이중차감 가드: corporateTotalAssets 입력 시 §15⑤2호 1회만.
- 회귀: FB-AUTO(marketValue) 불변 + import 사이트(StockValuationForm·EstateCommonAttributesSection) 무변경. madge/tsc 순환 0.

---

## UI 통합 위임

- UI 명세는 `inheritance-family-business-raw-valuation-unification-j1.ui.design.md` (경량).
- **신규 UI 위젯·폼·Zod 0** — 결과카드 `detail.autoDerivedValue`·breakdown이 통일값 자동 반영(엔진 echo).
- 영향 점검: 가업상속공제 결과카드가 autoDerivedValue/breakdown 표시 시 값만 정정(0→정상). 표시 구조 무변경.
- import 사이트 re-export 보존이 UI측 핵심(StockValuationForm·EstateCommonAttributesSection가 computeStockValuation·resolveUnlistedDisplayMode 사용).
