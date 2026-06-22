# EstateItem 평가액 단일 진실화 — 임대료환산·미임대·담보하한 dual-truth 해소 계획서

> 작성일: 2026-06-22 · 세목: 증여세 + 상속세 공용 평가 · 영역: 부동산 평가(§60~§66)
> 출처: [[project_gift_rental_vacancy_portion]] §9 Scope Out 후속. 미임대(§61⑤) 구현 중 발견한 선존 dual-truth.
> 검증 원칙: 인용 file:line·법령 실측. 미확인은 "🔎 확인 필요" 표기(추정 금지).

---

## 0. 핵심 결론

EstateItem 평가액을 산출하는 경로가 **4갈래**로 갈라져 있고, 엔진 권위값(`evaluateEstateItem`)만
§61⑤ 임대료환산·미임대 특례·§66 담보하한을 반영한다. 나머지 3경로는 이를 **누락**해 동일 자산이
화면 위치마다 다른 값을 낸다. **세액은 엔진값으로 계산되므로 numeric 버그는 아니고**(§1 실측), 입력 단계
표시(사이드바·칩·테이블·미리보기)·차단(채무초과 경고)·협의분할 배분의 **정합이 어긋나는 dual-truth**가 문제.

| 경로 | 위치 | §60 우선순위 | 부수토지(경로B) | §61⑤ 임대료환산 | 미임대 특례 | §66 담보하한 |
|---|---|---|---|---|---|---|
| **엔진 권위값** `evaluateEstateItem`/`evaluateAllEstateItems` | `property-valuation.ts:454` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `resolveEstateItemValue` | `valuation/resolve-estate-item-value.ts:134` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `computeEffectiveValuation` | `lib/calc/estate-item-valuation.ts:23` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `property-valuation-preview.tsx` 자체 재구현 | `:17~50`·`:92~133` | ✅(수동) | ✅ | ❌ | ❌ | ✅(`Math.max` :46·:118) |

> 검증: `calcRentalConversionValue`/`calcVacantPortionStandardPrice`/`applyCollateralFloor`는
> `property-valuation.ts` 내부에서만 호출(엔진 4 평가함수 경유). 나머지 3경로는 grep 0건 — dual-truth 확정.

### 해소 방향 — 엔진 단일 위임 (`feedback_ui_engine_dual_truth_avoidance`)

UI·검증·미리보기가 평가 로직을 **자체 재구현하지 않고** 엔진(`evaluateEstateItem`)에 위임한다.
`computeEffectiveValuation`을 **hybrid 위임**(주식은 기존 `computeStockValuation` 경로 유지 — valuationDate
fallback 보존, 부동산·deposit만 `evaluateEstateItem`)으로 재구현하면 **8개 호출처가 자동 정합**(single-source).

---

## 1. 영향도 Tier — ⚠️ 실측 정정(2026-06-22): 세액 numeric 버그 아님

> **실측으로 numeric 영향 재평가**(`feedback_numeric_impact_verify_before_bug_claim`): 부담부증여 **양도세 세액**에
> dual-truth가 투입된다는 초안 주장은 **인용 오류로 철회**한다. `gift-burdened-transfer-api.ts:360`
> `computeEffectiveValuation`은 **주식**(`buildGiftStockBurdenedTransferBody`) 경로이고, 주식은 임대료환산
> 무관(`computeStockValuation`). **부동산 부담부증여**(`buildGiftBurdenedTransferBody:71`)는
> `computeEffectiveValuation`을 **사용하지 않고** 사용자 직접 입력 양도가액(`bgt`)을 쓴다 → **임대료환산
> dual-truth가 세액에 투입되지 않음**. 따라서 본 작업은 **표시·차단 정합 리팩터링**이지 세액 버그 수정이 아니다.

### 🟡 Tier A — 차단/배분 정합 (사용자 조정 가능, 세액 직접 아님)

| 지점 | 파일 | 영향 |
|---|---|---|
| 부담부증여 채무초과 경고 | `components/calc/gift-tax-form-validate.ts:229` (부동산=`computeEffectiveValuation`, 주식=`evaluateAllEstateItems` 분기) | 임대 부동산에서 평가액 과소 → 정상 거래에 잘못된 "채무>평가액" 경고 또는 누락(차단 정확도, 세액 아님) |
| 협의분할 초기 배분액 | `estate-card/handleChipClick.ts:90` · `EstateChipInlineExpand.tsx:123` | 임대 부동산 협의분할 자동 배분 합계가 엔진 평가액과 불일치 → `validateEstateItemAllocations` 차단 가능(사용자 수동 조정으로 회피) |
| 공제 제안 배지 | `lib/calc/inheritance-deduction-suggest.ts:71` `getValuatedAmount`=`resolveEstateItemValue` | 임대 부동산이 금융·가업·영농 공제 대상일 때 제안값 과소(드묾·제안 배지라 API서 재계산). 임대료환산은 §60 평가액이므로 반영이 법적 정합 |

### 🟢 Tier B — 표시 UX (최종 세액 무영향, result 도착 전만)

| 지점 | 파일 |
|---|---|
| 상속 사이드바 합계 | `lib/stores/inheritance-summary.ts:101` → `InheritanceSidebar.tsx:34` (result=null 시만 렌더) |
| 증여 Step 접기 헤더 합계 | `gift-tax-form-shared.tsx:339` `sumEstateItemsValuation` |
| 자산 칩 라벨 | `estate-card/chip-config.ts:125` |
| 테이블 평가액 열 | `EstateItemTableView.tsx:62` · `StockItemTableView.tsx:91` |
| 평가 미리보기 | `property-valuation-preview.tsx` (EstimatedValuePreview·TotalEstimatedValue) |

> result 도착 후 결과 화면은 모두 `result.valuationResults[].valuatedAmount`(엔진) 사용 — 결과 화면은 dual-truth 없음(확인됨).

---

## 2. 법령 근거

- **§60②·시행령 §49**: 평가액 = 시가 > 감정 > 매매사례 > 보충(기준시가). 본 단일화는 평가 순위 불변.
- **§61⑤·시행령 §50⑦⑧·시행규칙 §15의2**: 임대 부동산 = Max(보충평가, 임대료환산). **평가액 자체의 일부** → 모든 평가 경로가 반영해야 법적 정합.
- **§66·시행령 §63②**: 담보채권 하한. 평가특례(MAX)로 평가액에 반영. 단 **공제 기초(gross)에서의 취급은 §22 금융재산공제 등 개별 규정 확인 필요**(🔎 §66 하한을 공제 기초에 포함할지 — §3-3 검토).

---

## 3. 설계 결정

### 3-1. `computeEffectiveValuation`을 엔진 위임으로 재구현 — hybrid (핵심)

> ⚠️ **Do 환류(2026-06-22)**: 구현 시 "부동산만 위임"으로 축소 확정(주식 §60 우선+§63, deposit 직접,
> cash/financial/기타 §60 chain 보존). 전 카테고리 위임은 financial·무효 category에서 §60 chain을 깨
> 기존 테스트 4건 회귀. 최종 코드·근거: `estate-valuation-single-source.engine.design.md` §2.

⚠️ **실측 정정**: `evaluateAllEstateItems(items)`는 **valuationDate 인자가 없다**(`property-valuation.ts:498`).
반면 `computeEffectiveValuation(item, valuationDate)`의 valuationDate는 **주식 V2 evaluationDate fallback**으로
`computeStockValuation(item, valuationDate)`에 전달된다. 단순 위임 시 이 fallback이 소실돼 **주식 V2 평가 회귀**.
→ **hybrid**: 주식은 기존 경로 유지, **부동산·deposit만** 엔진 위임.

```ts
// lib/calc/estate-item-valuation.ts — 재구현(시그니처·호출처 무변경)
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";

export function computeEffectiveValuation(item: EstateItem, valuationDate?: string): number {
  // 주식: 기존 단일 경로 유지(valuationDate fallback 보존) — evaluateAllEstateItems 미경유
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    return computeStockValuation(item, valuationDate);
  }
  // 부동산·현금·금융·deposit: 엔진 권위값 위임(임대료환산·미임대·담보하한·부수토지 반영)
  try {
    return evaluateEstateItem(item).valuatedAmount;
  } catch {
    return 0; // deposit leaseDeposit 미입력 등 부분입력 throw 가드(입력 단계 추정이므로 0)
  }
}
```

- **8개 호출처 무변경** — 부동산은 자동으로 임대료환산·미임대·담보하한 반영(single-source). 주식은 종전과 동일.
- `evaluateEstateItem`은 주식이면 throw(`property-valuation.ts:454`)이므로 주식 분기를 **먼저** 처리(위 순서 필수).
- ⚠️ **deposit throw 가드**: `evaluateRentalConversion`은 `leaseDeposit<=0`이면 throw. 입력 단계 부분입력에서
  throw → UI 크래시 위험 → try/catch 0 반환. (기존 `computeEffectiveValuation`은 deposit→leaseDeposit??0이라
  throw 없었음 → 위임 후 try/catch로 동등 안전 확보.)
- ⚠️ **성능**: 자산 카드마다 호출(N회) — 순수 함수라 부담 적으나, 사이드바 합계는 `useMemo` 유지.
- ✅ **순환 의존 없음**(실측): `property-valuation.ts`는 `estate-item-valuation.ts`를 import하지 않음 → 위임 안전.

### 3-2. `property-valuation-preview.tsx` 자체 재구현 제거 → 위임

`EstimatedValuePreview`(:17~50)·`TotalEstimatedValue`(:92~133)의 §60 우선순위·appurtenant·§66 MAX
**수동 재구현을 삭제**하고 `computeEffectiveValuation`(3-1로 엔진 위임됨) 호출로 교체. 4번째 경로 소멸.

### 3-3. `resolveEstateItemValue` — 임대료환산·미임대 반영 여부 결정 (🔎 핵심 검토)

`resolveEstateItemValue`는 검증(`inheritance-validate`)·공제 제안(`deduction-suggest`)·결과 화면 별지
(`deduction-besshi`·`financial-rows`·`family-business`)에서 **gross 평가액**으로 쓰인다.

- **임대료환산·미임대(§61⑤)**: 평가액 자체이므로 **반영이 법적 정합**. 미반영 시 공제 기초가 과소.
- **§66 담보하한**: 담보채권이 더 크면 평가액이 올라가는 특례. 공제 기초(§18·§22 등)에 포함할지는
  🔎 **법령 확인 필요** — 통상 평가액(§66 포함)이 상속재산가액이므로 포함이 맞으나, gross 의도가
  "담보 전"이면 별개. **Do 전 §66 하한이 공제 기초에 들어가는지 1건 실측**(조심례/집행기준) 후 결정.
- 결정 옵션: (A) `resolveEstateItemValue`도 엔진 위임(전부 반영) — 단순·일관 / (B) 임대료환산·미임대만
  추가하고 §66 하한은 제외(gross 유지) — 공제 기초 정합. **§3-3 실측 후 A/B 택1.**

### 3-4. Tier A 처리 (차단/배분 정합)

3-1 적용 시 `gift-tax-form-validate.ts:229`(부동산=`computeEffectiveValuation`)·`handleChipClick.ts:90`
협의분할 배분이 자동 엔진값으로 전환 → 차단/배분 정합. `gift-burdened-transfer-api.ts:360`은 **주식 경로**라
임대료환산 무관(별도 조치 불요). `gift-tax-form-validate.ts:229`의 부동산/주식 분기는 위임된
`computeEffectiveValuation`이 양쪽을 일관 처리하므로 분기 자체를 **단순화** 검토(주식도 동일 함수 경유).

---

## 4. Pre-Do Anchor (numeric 실증 우선)

`__tests__/`에 현행 dual-truth를 **실증**(현행 실패 확보):

```ts
// [SS-1] 임대 부동산: computeEffectiveValuation ↔ evaluateEstateItem 괴리 실증(현행)
//   building: standardPrice 321,300,000 + appurtenant 330,000,000, monthlyRent 2,000,000, leaseDeposit 500,000,000
//   현행 computeEffectiveValuation = 651,300,000 (임대료환산 누락)
//   엔진 evaluateEstateItem = 700,000,000 (임대료환산 Max)
//   → hybrid 위임 후 computeEffectiveValuation === 700,000,000 (일치)
// [SS-2] 미임대 포함: 위 + 미임대 3필드 → 위임 후 858,100,000 일치
// [SS-3] 차단 정합(Tier A): gift-tax-form-validate 부동산 채무초과 — 임대 부동산 평가액
//   현행 651,300,000 기준 채무 7억 → "채무>평가액" 경고 발동 / 위임 후 700,000,000 기준 → 경고 해제(정합)
// [SS-4] deposit 부분입력(leaseDeposit 0): computeEffectiveValuation throw 안 함(try/catch 0 반환 가드)
// [SS-5] 주식(회귀 핵심): hybrid라 computeStockValuation(item, valuationDate) 경로 유지 →
//   상장/비상장 V1·V2 평가액 단일화 전후 완전 동일(valuationDate fallback 보존 anchor)
// [SS-6] 시가(marketValue) 입력 부동산: 위임 후에도 marketValue(§60 우선순위 회귀)
// [SS-7] cash·financial·other(marketValue 입력): 위임 후 현행 explicit chain과 동등.
//   ⚠️ evaluateFinancial이 §22 금융재산공제를 평가액에 섞지 않는지 Do 전 실측(섞으면 financial hybrid 분기)
```

> ⚠️ 본 작업은 **세액 numeric 버그가 아님**(§1 실측 정정) — anchor는 표시·차단 **정합**과 주식 회귀 보존이 핵심.
> `feedback_numeric_impact_verify_before_bug_claim`(영향 실증 후 단정) · `pre-do-anchor-verification`("현행 일치 예상" 금지).

---

## 5. 동기화 지점 / 영향 범위

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| 1 | 핵심 위임 | `lib/calc/estate-item-valuation.ts:23` | hybrid 위임 재구현(주식 기존 경로 유지·부동산/deposit `evaluateEstateItem`) + deposit throw 가드 |
| 2 | 미리보기 | `components/calc/property-valuation-preview.tsx` | 수동 §60+§66 재구현 삭제 → `computeEffectiveValuation` 호출 |
| 3 | 검증/공제 | `resolveEstateItemValue` + `deduction-suggest`·`inheritance-validate` | §3-3 결정(A 위임 / B 부분 반영) |
| 4 | 차단 정합 | `gift-tax-form-validate.ts:229` (부동산 경로) | 위임 자동 반영 + 부동산/주식 분기 단순화 검토. `gift-burdened-transfer-api.ts:360`은 주식 경로라 무관 |
| 5 | 협의분할 배분 | `handleChipClick.ts:90`·`EstateChipInlineExpand.tsx:123` | 위임 자동 반영(코드 무변경, anchor만) |
| 6 | 순환 의존 | ✅ 실측 확정 | `property-valuation.ts`는 `estate-item-valuation.ts`를 import 안 함 → 순환 없음(위임 안전) |

---

## 6. 실행 순서 (PDCA Do)

1. **§3-3 법령 1건 실측**: §66 담보하한이 공제 기초(§18·§22)에 포함되는지 → `resolveEstateItemValue` A/B 결정.
2. (순환 의존: ✅ 실측 확정 — 단계 불요)
3. **Pre-Do anchor(§4)** SS-1~SS-5 작성 → 현행 dual-truth 정합·주식 회귀 실증.
4. **`computeEffectiveValuation` hybrid 위임 재구현**(§3-1) + deposit throw 가드 → SS-1·SS-2·SS-4·**SS-5(주식 회귀)** 통과.
5. **`property-valuation-preview` 위임 전환**(§3-2) → 4번째 경로 제거.
6. **Tier A 검증**(§3-4): `gift-tax-form-validate` 부동산 채무초과 정합(SS-3) + 분기 단순화.
7. **`resolveEstateItemValue` 처리**(§3-3 결정 반영).
8. **게이트**: `tsc` 0 · 전체 `vitest`(평가·증여·상속 회귀, **주식 평가·부담부증여·협의분할·공제 제안 회귀 주의**) · E2E.
9. **검증**: 사이드바·미리보기·칩이 임대 부동산에서 엔진값과 일치(브라우저/E2E).

---

## 7. 범위 밖 / 주의

- **성능 회귀**: 대량 자산(수십 건) 사이드바 합계가 자산마다 `evaluateEstateItem`(부동산) → 측정 후 필요 시
  메모이즈. 현재 자산 수 규모상 무시 가능 예상(🔎 측정).
- **`resolveEstateItemValue` gross 의미 변경 리스크**: 공제 기초가 바뀌면 공제액 numeric 변동 → 상속세
  전반 회귀. §3-3 신중 결정 + 전체 회귀 필수.
- **결과 화면**: 이미 엔진값 사용 — 변경 없음.
- **본 계획은 평가 산식 변경 0** — 갈라진 경로를 엔진 단일 진실로 모으는 리팩터링. 엔진 자체 로직 불변.

---

## 부록. dual-truth 자산 예시 (현행)

```
건물 기준시가 321,300,000 + 부수토지 330,000,000, 월 임대료 2,000,000, 임대보증금 500,000,000

computeEffectiveValuation  = 651,300,000  (기준시가 합산만)
property-valuation-preview = 651,300,000  (+ §66 담보 MAX는 처리하나 임대료환산 누락)
resolveEstateItemValue     = 651,300,000  (§60 gross)
evaluateEstateItem(엔진)   = 700,000,000  (임대료환산 Max) ← 정답·결과 화면값

→ 사이드바·칩·테이블·미리보기 "651,300,000" / 결과 화면 엔진값 "700,000,000" = 괴리 4,870만(표시 dual-truth)
→ 차단(채무초과 경고)·협의분할 배분도 651,300,000 기준이라 정합 어긋남(Tier A). **세액 자체는 엔진값으로 계산되므로 numeric 오류 아님**(§1 실측 정정)
```
