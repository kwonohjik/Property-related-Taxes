# 종합부동산세 §8④ 의제 + 세액공제 안분 — 엔진 설계

> Plan: `docs/01-plan/features/comprehensive-tax-section8-4.plan.md`
> UI 설계: `comprehensive-tax-section8-4.ui.design.md`
> 작성: 2026-06-12 · 13단계 자가 검토 STEP 5 산출물

---

## Context

선행(전부 머지): 연도별 세법·§4의3 안분(주택 합산 단일 누진 분모)·법인 §9②·부부 §10의2. 본 설계는 **GAP-1(세액공제 순서 — 기머지 버그)** 와 **GAP-2·3(§8④ 의제·안분·주택 수 제외)** 의 엔진 변경을 정의한다.

불변 조건: 신규 필드 optional("none" 기본) — 기존 anchor 영향은 **SC-C1 1건**(법령 재산정)뿐. 정수 연산 분수·`safeMultiplyThenDivide`. 800줄.

## ★ 케이스 인벤토리

| ID | 케이스 | 입력 골자 | 기대 산출 | 출처 |
|---|---|---|---|---|
| D1-1 | GAP-1 순서 — 순수 1세대1주택 | 2024, 15억 1채, 71세·16년 (구 SC-C1 입력) | 재산세 공제 432,000 → base 468,000 × 80% = 공제 **374,400** → 결정 **93,600** (SC-C1 재산정) | §9⑥⑧ 축자 + 직접 산식 |
| D1-2 | GAP-1 — §10의2 단독 (안분 없음) | 사례5 입력에서 §8④ 미지정 | 공제 base = 1,498,644 (재산세 공제 후) — `oneHouseDeduction` base 검증 | 사례5 pdf13 (base 명시) |
| D1-3 | 세액공제 없는 케이스 무변경 | 기존 YA-6(사례1)·SC-B 전부 | 불변 (birthDate 미입력 — 공제 0) | 회귀 |
| D2-1 | **사례5 full** — §10의2 + §8④4호 | 2022, [15억(none), 2억(regional_low_price)], joint, 70세·4년5월 | 공제 = floor(1,498,644 × 15억/17억 × 0.40) = **528,933** → 결정 **969,711** | 사례집 pdf13 |
| D2-2 | **사례4** — §8④2호 일시적 2주택 | 2022, [18.1억(none), 8.9억(temporary_two_house)], isOneHouseOwner=false, 공제 대상 아님(연령·보유 미달) | 공제 11억(의제) → 산출 8,520,000 → 안분 공제 2,055,87X(R-1) → 결정 **6,464,12X** | 사례집 pdf9~10 |
| D2-3 | §8④3호 상속주택 직접 산식 | 2024, [12억(none), 6억(inherited_house)], 71세·16년 | 공제 12억 → 과표 (18억−12억)×60%=3.6억 → 0.7%−60만=1,920,000 → 재산세 공제 후 base × **12억/18억** × 0.8 | §9⑦3호 직접 산식 (Do 전 원단위 확정) |
| D2-4 | 주택 수 제외 — **상속주택**(나목, 무전제) 포함 3주택 | 2024, [10억(none), 10억(none), 6억(inherited_house)] — 의제 미성립(일반 2주택)이어도 나목 제외 | `rateHouseCount = 2` → multi 표 **미적용** + `oneHouseTreatment = false`(일반주택 2채 — 의제 아님 ※ 1차: 지정만으로 의제하지 않도록 일반주택 수 검사) | 령 §4의3③3호 나목 (★라·마목과 달리 "1세대1주택자로 보는 자" 전제 없음) |
| D2-4b | 라·마목 — 의제 성립 시만 제외 | 2024, [12억(none), 3억(regional_low_price·non_metro)] | `rateHouseCount = 1` → general + 의제 적용 | 마목 축자 "법 §8④4호에 따라 1세대 1주택자로 보는 자가 소유한 … 지방 저가주택" |
| D2-5 | 1호 부속토지 — 주택 수 포함 + 안분 | 2024, [15억(none), 부속토지 2억(appurtenant_land_only)], 71세·16년 | `rateHouseCount = 2`(제외 없음 — R-8) + 공제 안분 15억/17억 | §9⑦1호 + STEP 1 #1 |
| D2-6 | 의제 oneHouseTreatment | [12억(none), 2억(regional_low_price)], isOneHouseOwner=false | `basicDeduction = 12억` (hasSection8para4 → 의제) + `section8para4Detail` echo | §8④ 본문 |
| D2-7 | 법인 + §8④ 잔존 | corporate_special + 4호 지정 | 의제 무시 (공제 0 유지) + count 제외도 미적용 여부 — 설계 결정 (아래 §4) | 3중 패턴 |
| D2-8 | 합산배제 주택과 교차 | 임대 합산배제 주택 + 4호 주택 | 합산배제가 우선 (배제 주택은 안분 분모·분자 자체에서 빠짐) | §8② 우선 |

> D2-2 기대값은 Phase 0 R-1(1원) 확정 후 toBe 고정. D2-4 보충: 의제 자체는 "1주택 + 특례주택" 구성이 요건이므로 3주택 구성에서 4호 지정은 **검증 오류 후보** — ⑧에서 "none 제외 주택 수 ≥ 2 && 일반주택(none) 수 ≠ 1" 차단 여부는 UI 설계와 함께 확정 (1차: 경고, 차단 아님 — §8④ 요건 판정은 사용자 책임 입력).

## 법령 근거 (Plan §2 — 축자 확보분)

- §8④ 1~4호 + §8⑤ 신청(2~4호만) · 령 §4의2①(3년)·②(5년/40%/6억·3억)·③(4억+소재지)
- §9⑥⑧: 공제 base = "제1항·**제3항**·제4항에 따라 산출된 세액" → **재산세 공제 후** (GAP-1)
- §9⑦⑨: §8④ 해당 시 base에서 각 호 산출세액(공시가격합계액으로 안분) 제외 → `base × main/total`
- 령 §4의3③3호: 나(상속)·라(2호 신규)·마(4호 지방저가) 주택 수 제외 — **1호 제외 근거 없음** (R-8)
- 잔여: R-2 지방저가 기준액 연혁(2022=3억?) · R-3 구법 호 매핑 — Phase 0

## 엔진 설계

### 1. 타입 — `types/comprehensive.types.ts`

```ts
export type Section8Para4Type =
  | "none" | "appurtenant_land_only" | "temporary_two_house"
  | "inherited_house" | "regional_low_price";

interface ComprehensiveProperty {
  // ... 기존 ...
  section8para4Type?: Section8Para4Type;   // 미입력 = "none"
}

interface ComprehensiveTaxResult {
  // ... 기존 ...
  section8para4Detail?: {                   // §8④ 적용 시만
    appliedTypes: Section8Para4Type[];      // 적용 유형 목록 (중복 제거)
    mainHouseAssessedValue: number;         // 안분 분자 (특례주택 제외 공시 합산)
    excludedAssessedValue: number;          // 특례주택 공시 합산
  };
}
```

※ 요건 필드(신규 취득일·상속개시일·지분율)는 **UI·Zod 검증 전용** — 엔진 input에 넣지 않음 (1차: 엔진은 유형 지정을 신뢰. 자동 요건 판정은 후속).

### 2. `applyOneHouseDeduction` 시그니처 — `comprehensive-tax-helpers.ts:61`

```ts
export function applyOneHouseDeduction(
  taxAfterPropertyCredit: number,   // ★ GAP-1: 재산세 비율안분 공제 후 세액 (§9⑥ "제3항에 따라 산출된 세액")
  birthDate: Date,
  acquisitionDate: Date,
  assessmentDate: Date,
  apportionment?: {                 // ★ GAP-2: §8④ 의제 시 §9⑦⑨ 안분
    mainHouseAssessedValue: number;
    totalAssessedValue: number;
  },
): OneHouseDeductionResult
// 내부: rate = min(senior + longTerm, 0.8)
//   deduction = apportionment
//     ? Math.floor(safeMultiplyThenDivide(
//         taxAfterPropertyCredit * /*분수 정수*/ Math.round(rate * 100),
//         apportionment.mainHouseAssessedValue,
//         apportionment.totalAssessedValue * 100))
//     : Math.floor(taxAfterPropertyCredit * rate)   // 기존 산식 (rate는 0.2/0.3/…/0.8 — ×rate 직접 곱은
//       기존 구현 유지(0.8×468,000=374,400.0 정확) — 단 안분 결합 시 분수 정수 필수
// OneHouseDeductionResult에 apportionmentRatio?: { main, total } echo 추가 (결과뷰 산식용)
```

> 정밀도: 사례5 검산 floor(1,498,644 × 15/17 × 0.4) = 528,933 — 곱 순서·절사 위치는 **사례5 원단위 anchor가 강제** (연산 순서: `floor(base × main × rate정수 / (total × 100))` 단일 floor — 중간 절사 금지).

### 3. `comprehensive-tax.ts` Step 재배치 (GAP-1)

```
Step 5 산출세액 (무변경)
Step 6 (구 Step 7) 재산세 비율안분 공제 — calculatePropertyTaxCreditProration(..., 상한 = calculatedTax)
       → taxAfterPropertyCredit
Step 7 (구 Step 6) 1세대1주택 세액공제 — oneHouseTreatment && birthDate && acquisitionDate 시
       applyOneHouseDeduction(taxAfterPropertyCredit, ..., section8para4 안분?)
Step 8 상한 (무변경 — 입력 세액은 공제 모두 반영 후)
```

헤더 주석(`:8~17`)의 Step 목록도 동기 갱신 (기존 헤더 드리프트 정리 겸).

### 4. §8④ 게이트·안분·주택 수 (GAP-2·3)

```ts
// 합산배제 제외 후 특례주택 집계 (isExcluded 반영 — D2-8)
const s84Properties = input.properties.filter(
  (p) => (p.section8para4Type ?? "none") !== "none" && !excludedSet.has(p.propertyId));
const normalHouseCount = aggregationExclusion.includedCount - s84Properties.length;

// §8④ 의제 성립: "1주택과 … 함께 소유" — 일반주택(none)이 정확히 1채일 때만 (STEP 6 #5 파급)
//   지정만으로 의제하지 않음. 미성립 시 warnings("§8④ 의제는 일반주택 1채 구성에서만 적용…")
const isSection8para4Applied = !isCorporate &&
  s84Properties.length > 0 && normalHouseCount === 1;

const oneHouseTreatment = !isCorporate &&
  (input.isOneHouseOwner || isJointApplied || isSection8para4Applied);

// 안분 (의제 성립 시 — 전 유형, 1호 포함, §9⑦ 각 호)
const excludedAssessed = Σ s84Properties.assessedValue;
const mainHouseAssessed = includedAssessedValue - excludedAssessed;  // isSection8para4Applied 시만 사용

// 주택 수 제외 — 이원화 (STEP 6 #5: 라·마목은 "1세대1주택자로 보는 자" 전제, 나목은 무전제)
const inheritedCount = s84Properties.filter(p => p.section8para4Type === "inherited_house").length;
const conditionalCount = s84Properties.filter(p =>
  p.section8para4Type === "temporary_two_house" || p.section8para4Type === "regional_low_price").length;
const rateHouseCount = aggregationExclusion.includedCount
  - inheritedCount                                          // 나목: 무조건 제외
  - (isSection8para4Applied ? conditionalCount : 0);        // 라·마목: 의제 성립 시만
// 1호(appurtenant_land_only)는 미제외 (R-8)
// → isMultiHouseRate(year, rateHouseCount, adjArea)
```

**법인 + §8④ 잔존 (D2-7)**: `isCorporate`면 의제(oneHouseTreatment)는 자동 무시. **주택 수 제외(rateHouseCount)는 법령상 §4의3③이 §9 전체에 적용**되므로 법인에도 적용 — 단 나·라·마목 요건이 §8④ 의제(개인 1세대 전제)와 결부되는지 축자 모호 → 1차: **법인은 count 제외도 미적용**(보수적 — 법인 multi 과대 방지보다 정확성 우선, R-9로 디자인 단계 확인).

### 5. Zod·route (⑨⑫⑭)

- property 스키마(⑫): `section8para4Type` enum optional + `newHouseAcquisitionDate`·`inheritanceOpenDate`(YYYY-MM-DD)·`inheritanceShareRatio`(0~100) optional — UI 검증용 통과 필드(엔진 미전달).
- refine(⑧ — property 수준): **Do 환류** — 4호 지정 시 `location !== "metro"`(비수도권)만 차단. 공시 기준액(현행 §4의2③1호 4억)은 2022 귀속 축자 불가(R-2)로 **금액 비차단**(엔진 신뢰 입력 + UI 안내). 3호 지분율은 0~100 범위만(요건 자동판정 후속).
- route ⑭: property 변환 블록에 `section8para4Type` 1:1 (요건 필드는 엔진 미전달이므로 매핑 불요 — ⑬에서만 Zod 통과).

## Silent fallback 점검

- `section8para4Type ?? "none"` — 하위호환 기본값 ✓
- 의제 파생은 엔진 1곳 (`oneHouseTreatment`) — UI/API 파생 금지 (Plan §4-2)
- 3주택 구성 + 4호 지정 등 요건 의심 조합 → **경고**(warnings) 우선, 차단은 UI 설계와 동기 확정

## 테스트 약속

- Phase D-1: D1-1~D1-3 + SC-C1 재산정(374,400) + 전체 회귀(영향 1건 외 무변경) + CPT-E2E-2 실측
- Phase D-2: D2-1~D2-8 (사례5 969,711·사례4 6,464,12X 원단위) + 기존 E2E 12 회귀

## Phase 0 해소 (KoreanLaw 축자 + 구현후 probe — 2026-06-12)

1. R-1 ✅ 사례4: ⓐ5,220,000·⑤2,304,000·⑥5,850,000 → floor 2,055,876·결정 **6,464,124** (PDF 2,055,877 반올림)
2. R-2 ✅ 현행 §4의2③1호 4억(KoreanLaw). 2022 금액 fetch 불가 → ⑧ location만 차단·금액 UI 안내
3. R-3 ✅ §4의2 ①2호·②3호·③4호 — 2022.9~현행 안정
4. R-8 ✅ §4의3③3호 다목="무허가·무권원 부속토지" 전용 → §8④1호 일반 부속토지 제외 근거 부재 → 포함
5. R-9 ✅ 라·마목 "1세대1주택자로 보는 자"(개인) 한정 → 법인 §8④ 기반 제외 미적용 (gate `!isCorporate`)
6. D2-3 ✅ 상속 직접 산식: 산출 1,920,000 → 재산세 716,487 → 안분(12억/18억×0.8) 641,873 → 결정 **561,640** (probe 확정)

> **GAP-1 anchor 정정**: SC-C1 정확값 = deduction **374,400** · 결정 **93,600** (design D1-1 = 정확). creditRaw 432,000이 구 코드선 세액공제 후 잔액 180,000으로 capped됐던 것 — 재배치로 432,000 전액공제 → base 468,000 × 0.8.
