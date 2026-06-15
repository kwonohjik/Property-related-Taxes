# 종합부동산세 직전연도 자동계산 — 다주택 중과세율 + 주택별 합산 계획서

> 작성일: 2026-06-15 · worktree `cpt-test`
> 대상: 교재 제3편 종합부동산세 **사례4 — 일시적 1세대 2주택자(=1세대1주택)**, 2022 귀속
> 선행: §8④ 일시적 2주택 의제 ✅(`comprehensive-tax-section8-4.plan.md`, 2026-06-12) · 감면율 ✅PR#197 · 공유지분 ✅PR#199 · 안분 round ✅PR#201
> 사용자 결정(2026-06-15): **옵션 A — 직전연도 자동 중과 풀 구현** (자동계산 모드만으로 사례4 세부담상한 내역 100% 재현)

---

## 1. 배경 · 범위

### 1-1. 사례4의 특수성 (이미지 8·9)

일시적 2주택을 **1세대1주택자로 의제**(주택 수 산정 제외)하되 **과세표준은 두 주택 모두 합산**하는 케이스. 핵심은 **당해연도와 직전연도의 취급이 완전히 다르다**:

| 구분 | 당해연도(2022) | 직전연도(2021) |
|---|---|---|
| 취급 | 1세대1주택 의제(§8④2호) | **일반 2주택**(특례 2022 신설, 직전연도 미적용) |
| 기본공제 | 11억 | **6억** |
| 세율 | 일반 1.2% | **조정지역 2주택 중과 3.6%** |
| 주택분 종부세 | ① 8,520,000 | ⓐ 43,380,000 |

### 1-2. 현황 — 실측 확정 (probe)

| 영역 | 상태 | 근거 |
|---|---|---|
| §8④2호 일시적 2주택 의제(11억·일반세율·과표합산) | ✅ 완비 | `comprehensive-tax.ts:250-307` · anchor D2-2(`comprehensive-special-cases.test.ts:325-342`) |
| UI 입력(주택2개 + 일시적2주택 토글 + 신규취득일) | ✅ 완비 | `PropertyListInput.tsx:286-379` |
| **당해연도 납부할세액 ⑤ = 6,464,123** | ✅ **이미 정확** | probe 실측(자동·직접 모드 동일) |
| 2022 조정 2주택 중과세율 3.6% 세율표 | ✅ 존재 | `data/comprehensive-historical.ts:81-88` BRACKETS_PRE2023_MULTI |
| `isMultiHouseRate(year, count, isMultiHouseInAdjustedArea)` | ✅ 존재 | `comprehensive-historical.ts:215-224` |
| `housingBracketsMulti` (연도별 params) | ✅ 존재 | `getComprehensiveParams(2021)` 키 확인(probe) |
| **직전연도 자동계산 종부세상당액 — 다주택 중과세율** | ❌ **미구현** | `comprehensive-prior-year.ts:68-72` `housingBracketsGeneral` 고정 |
| **직전연도 자동계산 재산세상당액 — 주택별 합산** | ❌ **미구현** | `PreviousYearAutoInput.assessedValue`(types:323) 단일값 → 누진 합산 오류 |

### 1-3. 범위

- **In**: 직전연도 자동계산 모드의 (A) 다주택 중과세율 재계산, (B) 직전연도 주택별 공시·재산세 합산.
- **Out**: 토지분 직전연도 다주택(주택분 전용) · 직전연도 §8④ 의제 자동추적(직전엔 일반 2주택이므로 불요) · 법인 직전연도(법인 상한 배제 §10 단서).
- **결과값 영향**: 사례4는 세부담상한 미적용(가 11,684,123 ≪ 다 66,444,335 → ④=0) → ⑤ 불변. 본 작업의 목적은 **① 세부담상한 직전연도 내역(나·다)의 교재 충실 재현 + ② 세부담상한이 binding하는 다주택 케이스의 정확성 확보**. (사용자 옵션 A 명시)

---

## 2. 법령 근거 · 실측 검산 (probe — 추정 금지)

### 2-1. 시행령 §5② (직전연도 종부세상당액)

직전연도 「지방세법」·종부세법(§10 제외)을 적용한 직전연도 세액상당액. **직전연도 세율·공제·FMR 기준** → 직전연도가 일반 2주택이면 직전연도 다주택 중과세율 적용.

### 2-2. probe 실측값 (검산 일치 — `_p3.ts` throwaway, 삭제됨)

```
직전 재산세상당액 (주택별 표준세율 합산):
  12억 → 2,250,000  (교재 2,250,000) ✓
  13억 → 2,490,000  (교재 2,490,000) ✓
  주택별 합산 = 4,740,000  (교재 나① 4,740,000) ✓
  ★ 25억 단일 = 5,370,000  ← 현행 prior-year 단일값 방식 = 오류

직전 종부세상당액 ⓐ:
  과표 = (25억 − 6억) × 95%(2021 FMR) = 18.05억  ✓
  중과세율 3.6% 산출 = 43,380,000  (교재 ⓐ 43,380,000) ✓
  ★ 일반세율 1.6% 산출 = 21,080,000  ← 현행 = 오류
  housingBracketsMulti 키: getComprehensiveParams(2021)에 이미 존재 ✓

직전 종부세상당액 ⓑ(공제할 재산세):
  분자 = 18.05억 × 60% × 0.4% = 4,332,000
  분모(총표준세율) = 25억 × 60% × 0.4% − 630,000 = 5,370,000  ← 합산 단일 누진
  ⓑ = round(4,740,000 × 4,332,000 / 5,370,000) = 3,823,777  (교재 3,823,777) ✓
  직전 종부세상당액 = 43,380,000 − 3,823,777 = 39,556,223  (교재 ②) ✓

나(직전 총세액상당액) = 4,740,000 + 39,556,223 = 44,296,223  (교재 나) ✓
다(세부담상한액) = 나 × 150% = 66,444,335  (교재; 엔진 floor 66,444,334 — 1원차, R-1)
가(당해 총세액상당액) = ⓐ당해재산세 5,220,000 + ③ 6,464,123 = 11,684,123  (교재 가) ✓
④ 초과세액 = max(가 − 다, 0) = 0  → ⑤ = ③ = 6,464,123 ✓
```

### 2-3. 핵심 설계 발견 — **두 합산 방식 공존**

| 산출 항목 | 합산 방식 | 값 |
|---|---|---|
| 직전 **재산세상당액**(나①) | **주택별** 표준세율 재산세 합산 | 2,250,000 + 2,490,000 = 4,740,000 |
| 직전 종부세 **과세표준** | 합산 단일(25억 → 6억 공제) | 18.05억 |
| ⓑ 분모(**총표준세율재산세액**) | 합산 단일 누진(25억) | 5,370,000 |

→ 현행 `comprehensive-prior-year.ts`는 단일 `auto.assessedValue`로 **둘 다** 계산 → 재산세상당액이 누진 합산 오류(5,370,000 ≠ 4,740,000).

---

## 3. 갭 상세 · 현행 코드 실측

| ID | 갭 | 현행 위치 | 미구현 내용 |
|---|---|---|---|
| **GAP-A** | 직전연도 세율 = 일반 고정 | `comprehensive-prior-year.ts:68-72` | `calcHousingTaxAmount(taxBase, p.housingBracketsGeneral)` 하드코딩 → 중과 분기 부재 |
| **GAP-B** | 재산세상당액 단일값 누진 | `comprehensive-prior-year.ts:80-89` | `auto.assessedValue` 단일 → 주택별 합산 불가 |
| **GAP-C** | 입력 타입 다주택 미표현 | `types/comprehensive.types.ts:323-340` | `PreviousYearAutoInput`에 주택별 공시 배열·`isMultiHouseInAdjustedArea`·주택수 부재 |
| **GAP-D** | API 변환 단일·properties[0] | `lib/calc/comprehensive-api.ts:246-264` | 단일 `assessedValue` + properties[0] 기준만 |
| **GAP-E** | UI 직전 공시 단일 입력 | `app/calc/comprehensive-tax/page.tsx:292` Step5TaxCap | 직전 주택별 공시·재산세 입력란·조정2주택 토글 부재 |

★ **불변 확인(실측)**: `comprehensive-tax.ts:476-479` `capRate`는 **당해연도** 의제 기준(사례4 = `taxCapRateGeneral` 150% — `historical.ts:129`)이라 직전 중과와 무관 — 직전 중과는 `prevTotalForCap`(:481)에만 영향. **본 작업은 `prevTotalForCap` 정확도만 개선**.

**`applyTaxCap` 무변경 — 교재 가/나/다 ↔ 엔진 동치 증명** (`comprehensive-tax-helpers.ts:181-200` 실측):
```
엔진:  capAmount = floor(prevTotal × capRate)              // = 다 (floor)
       cappedTax = max(min(③, capAmount − ⓐ), 0)          // ③=comprehensiveTaxAfterCredit, ⓐ=당해 부과재산세
교재:  ④ = max(가 − 다, 0) = max(ⓐ + ③ − 다, 0)
       ⑤ = ③ − ④
동치:  ⓐ+③ ≤ 다 → 교재 ⑤=③ / 엔진 min(③, 다−ⓐ)=③ (다−ⓐ≥③)              ✓
       ⓐ+③ > 다 → 교재 ⑤=다−ⓐ / 엔진 min(③, 다−ⓐ)=다−ⓐ (다−ⓐ<③)         ✓
검증:  prevTotal 44,296,223 → 다 66,444,334(floor) → min(6,464,123, 61,224,334)=6,464,123 ✓ (probe)
```
→ `prevTotal`만 정확해지면 가/나/다/④/⑤ 전부 자동 정합. 산식 코드 변경 불요.

---

## 4. 엔진 설계 초안

### 4-1. 타입 확장 (`types/comprehensive.types.ts`)

```ts
export interface PreviousYearAutoInput {
  assessedValue: number;          // (유지) 직전연도 공시 합산 — 종부세 과표·ⓑ분모용
  isOneHouseOwner: boolean;
  birthDate?: Date;
  acquisitionDate?: Date;
  reductionRate?: number;
  ownershipRatio?: number;
  // ── 신규 (다주택 직전연도) ──
  /** 직전연도 주택별 공시가격(원). 재산세상당액 주택별 합산용.
   *  미입력 = [assessedValue] 단일 1채로 처리 (하위호환). */
  priorHouseValues?: number[];
  /** 직전연도 조정대상지역 2주택 여부 (≤2022 중과 2축). 미입력 = false. */
  isMultiHouseInAdjustedArea?: boolean;
  /** 직전연도 세율 주택 수 (3주택 이상 중과 판정). 미입력 = priorHouseValues.length ?? 1. */
  taxableHouseCount?: number;
}
```

> 설계 결정: 직전연도 **§8④ 의제 자동추적은 범위 외** — 직전연도가 일반 2주택이라는 사실(공제 6억·중과)을 사용자가 `isOneHouseOwner=false` + `isMultiHouseInAdjustedArea=true`로 지정. 의제 여부 자동판정은 후속.

### 4-2. `calcPreviousYearEquivalent` 변경 (2지점)

**import 추가** (현행 prior-year.ts:19-26에 `isMultiHouseRate` 미존재 — 실측): `import { getComprehensiveParams, getPropertyFmrForProration, isMultiHouseRate } from "./data/comprehensive-historical";` (순환참조 없음 — historical은 leaf 모듈).

```ts
// (1) GAP-A — 세율 분기 (line 68-72 교체)
const houseCount = auto.taxableHouseCount ?? auto.priorHouseValues?.length ?? 1;
const useMulti = isMultiHouseRate(py, houseCount, auto.isMultiHouseInAdjustedArea ?? false);
const brackets = useMulti ? p.housingBracketsMulti : p.housingBracketsGeneral;
const { calculatedTax, appliedRate } = calcHousingTaxAmount(taxBase, brackets);

// (2) GAP-B — 재산세상당액 주택별 합산 + priorSum 단일 원천 (line 55·80-89·133 교체)
const priorHouses = auto.priorHouseValues ?? [auto.assessedValue];
const priorSum = priorHouses.reduce((a, b) => a + b, 0);   // 종부세 과표·ⓑ분모용 합산(단일 원천)
const propertyTaxEquivRaw = priorHouses.reduce((sum, v) => {
  const base = Math.floor((v * Math.round(propertyFMR * 100)) / 100);
  return sum + calcHousingTax(base, v, false).tax;   // 표준세율 강제 (나① 주택별 합산)
}, 0);
const propertyTaxEquiv = applyEffectiveFactor(propertyTaxEquivRaw, rate, ratio);
```

- **`priorSum` 단일 원천**(E-1): `effectiveAssessedValue`(:55)·`detail.assessedValue` echo(:133)를 `auto.assessedValue` → **`priorSum` 기준으로 교체** → 종부세 과표(`taxBase` :67)·ⓑ분모(`stdTaxDenominator` :101-105)가 priorSum 합산 단일로 산정. `priorHouseValues`만 입력해도 과표·부표① 정확(이중 입력 불일치 차단).
- ⓑ 분모·과표 = **합산 단일**(priorSum) / 재산세상당액(나①) = **주택별 합산** — 두 방식 공존(probe 확정).
- 하위호환: `priorHouseValues` 미입력 → `priorSum = assessedValue` → **기존 동작 100% 보존**(M-1 anchor 무영향).

### 4-3. `effectiveFactor`(감면·지분) 적용 일관성

`priorHouseValues` 각 주택에 동일 `rate`·`ratio` 적용(현행 단일값과 동일 — 법령 원칙3). 다주택 케이스에서 주택별 감면율 상이는 범위 외(properties[0] 기준 — 현행 정책 유지).

---

## 5. 14지점 동기화

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/comprehensive-wizard-store.ts` | `previousYearAutoIsMultiAdjusted: boolean` + 직전 주택별 공시 입력(`previousYearAutoHouseValues: string[]` 또는 properties 직전공시 필드) |
| ② | initial | 동상 makeProperty/initial | 신규 필드 기본값(`false`/`[]`) |
| ③ | normalize | 동상 onRehydrateStorage | `?? false`/`?? []` |
| ④⑬ | API 변환 | `lib/calc/comprehensive-api.ts:246-264` | `priorHouseValues`·`isMultiHouseInAdjustedArea`·`taxableHouseCount` 추가 |
| ⑤ | UI 위젯 | `app/calc/comprehensive-tax/page.tsx:292` Step5TaxCap | 자동모드 시 직전 주택별 공시 입력 + 조정2주택 ToggleCard |
| ⑥ | 사이드바 | (해당 없음 — 직전연도는 합계 미표시) | — |
| ⑦ | 결과뷰 | `ComprehensiveTaxResultView.tsx` · `comprehensive-filing/ComprehensiveFilingFormBuppyo5{,Sub}.tsx` | 직전 상당액 내역(나·ⓐ·ⓑ). `PreviousYearEquivalentResult.detail.appliedRate`(부표⑤ 세율, types:482 확인) 사용 — dual-truth 금지. **★설계 STEP에서 Buppyo5Sub가 `detail.appliedRate`를 실제 렌더하는지 검증**(현재 표시 여부 미확인). ※ 교재 "가"(당해 총세액상당액)는 엔진 `currentYearTotalEquivalent`(`comprehensive-tax.ts:507` = `aValue`+③)에 **이미 존재** — 재계산 금지 |
| ⑧ | validation | `lib/validators/comprehensive-input.ts` 또는 `lib/calc/comprehensive-validate.ts` | 자동모드 다주택 시 직전 주택별 공시 입력 검증(UI 차단 ↔ Zod 동기) |
| ⑨⑫ | Zod 입력 객체 | `lib/validators/comprehensive-input.ts` previousYearAutoSchema | `priorHouseValues: z.array(z.number()).optional()` 등 |
| ⑩ | Zod refine | 동상 | 자동·직접 상호배타 유지(무변경) |
| ⑭ | Route Date 변환 | `app/api/calc/comprehensive/route.ts` | previousYearAuto 신규 필드 pass-through(숫자·boolean — Date 변환 불요) |

> ⑫⑬⑭ TS 미감지 침묵 strip 주의 — grep 자가점검 필수(memory `feedback_api_zod_schema_sync`).

---

## 6. 케이스 매트릭스 (전수 enumerate — 단순부터)

| # | 케이스 | 직전 입력 | 기대 |
|---|---|---|---|
| M-1 | 단일 물건 자동(기존) | `priorHouseValues` 미입력 | **기존 동작 보존**(일반세율·단일 재산세) — 회귀 0 |
| M-2 | 사례4 일시적2주택 자동 | 직전 [12억,13억], 일반2주택, 조정 ON | 나 44,296,223 · ⓐ 43,380,000 · 재산세 4,740,000 · 다 66,444,33X |
| M-3 | 직전 3주택(조정 무관) 자동 | 직전 3채, count=3 | `isMultiHouseRate`=true(중과) |
| M-4 | 직전 비조정 2주택 자동 | 직전 [a,b], 조정 OFF, count=2 | 2022 일반세율(중과 아님 — `taxableHouseCount<3 && !adjusted`) |
| M-5 | 직전 1세대1주택 자동 | `isOneHouseOwner=true` | 11억 공제·일반세율·연령보유 재판정(기존) |
| M-6 | 직접입력 모드 | `previousYearTotalTax` 직접 | prior-year 미호출(무변경) |
| M-7 | 2023+ 귀속 자동 다주택 | 직전 2022, 조정 2주택 | 2022는 중과, 2023+는 3주택만 중과(`isMultiHouseRate` 연도분기) |

---

## 7. Phase 계획

### Phase 0 — Pre-Do anchor (게이트, 실패 확보)
- **PY-M2** (사례4 직전 자동) anchor 작성 → **현행 실패 실증**(현행 나 22,118,000 vs 목표 44,296,223). 신규 파일 `__tests__/tax-engine/comprehensive-prior-year-multi.test.ts`(설계 §4).
- PY-M2 anchor: `previousYearEquivalent.total` 44,296,223 · `.detail.appliedRate` 0.036 · `.detail.calculatedTax` 43,380,000(ⓐ) · `propertyTaxEquiv` 4,740,000 · `comprehensiveTaxEquiv` 39,556,223 · 당해 `determinedHousingTax` 6,464,123(불변 회귀) · `taxCap.capAmount` 66,444,334.
- **PY-M1** 단일 물건 회귀 anchor(`priorHouseValues` 미입력 — 기존 자동 케이스 회귀 0).

### Phase 1 — 엔진 (`comprehensive-prior-year.ts` + 타입)
- §4-1 타입 + §4-2 2지점 변경. import `isMultiHouseRate`.
- 회귀: `npx vitest run __tests__/tax-engine/comprehensive-*.test.ts` (188+ 회귀 0).

### Phase 2 — 14지점 (store·api·UI·Zod·route·결과뷰)
- §5 표. grep 자가점검(⑫⑬⑭).

### Phase 3 — E2E
- 사례4 자동모드 풀 입력 → 결과뷰 직전 상당액 내역(나 44,296,223) 검증.
- 기존 사례2·3·12 회귀(REGR).

---

## 8. 리스크 · 확인 필요

| # | 항목 | 처리 |
|---|---|---|
| R-1 | 다(세부담상한액) 1원차 — 엔진 `floor` 66,444,334 vs 교재 66,444,335 (`comprehensive-tax-helpers.ts:188` `Math.floor(prevTotal×capRate)`) | binding 무관(⑤ 불변). 결과뷰 표시값 정책: KoreanLaw §5 절사방식 확인 후 floor 유지 vs round 결정. 안분공제는 §4의3 절사 미규정→round였으나(PR#201 [[project_comprehensive_property_tax_reduction_rate]]) **세부담상한액은 별도 조문** — 동일 적용 단정 금지, 축자 확인 |
| R-2 ✅ | 재산세=주택별 / 종부세=합산 단일 | **probe 확정**(§2-2): 12억+13억=4,740,000, 25억 합산 5,370,000(ⓑ분모) |
| R-3 ✅ | capRate는 당해 의제 기준(150%) 불변 | **실측 확정**(`comprehensive-tax.ts:476-479`) — 직전 중과는 prevTotal에만 영향 |
| R-4 | 단일 물건 하위호환 | `priorHouseValues` 미입력 → `[assessedValue]` fallback. M-1 회귀 anchor |
| R-5 | 직전 주택별 공시 입력 UX(당해 properties와 행 수 일치?) | **디자인 STEP 12에서 단일 확정**: (안1) 당해 주택 카드별 "직전연도 공시" 필드 — 행 수 자동 정합 / (안2) Step5 별도 배열 입력. 현행 store는 `previousYearAutoAssessedValue` 단일(store:138) → 신규 `previousYearAutoHouseValues: string[]` 또는 안1 채택. **① 지점 필드명은 디자인 확정 후 단일화** |
| R-6 | 직전 재산세 직접입력 허용 여부(자동 역산 vs 고지서값) | 1차 자동 역산(probe 4,740,000 정합). 고지서 직접입력은 직접입력 모드 권장 |
| R-7 | `isMultiHouseRate` 2023+ 연도분기 | M-7 anchor — 2022 조정2주택 중과, 2023+ 3주택만 |

---

## 9. 완료 기준 (DoD)

- [ ] Phase 0 게이트 — 사례4 직전 자동 anchor 현행 실패 확보 + 목표값 확정
- [ ] Phase 1 — prior-year 세율분기 + 주택별 합산, 회귀 0(comprehensive-* 전체)
- [ ] Phase 2 — 14지점 전부(⑫⑬⑭ grep 자가점검) + api fallback ↔ validate 동기
- [ ] Phase 3 — 사례4 자동모드 E2E(나 44,296,223) + 사례2·3·12 회귀
- [ ] `npx tsc --noEmit` 0 · 800줄 준수 · 전체 `npm test` green
- [ ] 결과뷰 직전 상당액 중과세율 echo(dual-truth 금지 — `detail.appliedRate` 사용)
- [ ] R-1 다 1원차 정책 확정(KoreanLaw §5 절사) · 메모리 환류

---

## 관련 메모리

- [[project_comprehensive_tax]] — 과세연도별 세법(historical) · isMultiHouseRate 2축
- [[project_comprehensive_case12_filing_replica]] — 직전연도 상당액 자동계산(§5②) 선례
- [[project_comprehensive_property_tax_reduction_rate]] — 안분공제 round(PR#201) · effectiveFactor
- [[feedback_pre_anchor_verification]] · [[feedback_numeric_impact_verify_before_bug_claim]] — Pre-Do anchor 우선
- [[feedback_api_zod_schema_sync]] — 14지점 ⑫⑬⑭ 침묵 strip
