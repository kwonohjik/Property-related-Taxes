# 종합부동산세 직전연도 다주택 중과 — 엔진 설계

> 계획서: `docs/01-plan/features/comprehensive-tax-prior-year-multi-house.plan.md`
> 대상 모듈: `lib/tax-engine/comprehensive-prior-year.ts` + `types/comprehensive.types.ts`
> 작성일: 2026-06-15 · 13단계 STEP 5

---

## 1. 케이스 인벤토리 (전수 — 엔진 관점)

| # | 케이스 | 입력(직전연도 자동) | 세율 분기 | 재산세 합산 | 기대 핵심값 |
|---|---|---|---|---|---|
| M-1 | 단일 물건(기존 보존) | `priorHouseValues` 미입력, `isOneHouseOwner=false` | 일반(count=1) | `[assessedValue]` 단일 | 현행값 동일 — 회귀 0 |
| M-2 | **사례4 일시적2주택** | `priorHouseValues=[12억,13억]`, `isOneHouseOwner=false`, `isMultiHouseInAdjustedArea=true` | **중과 3.6%** | 2,250,000+2,490,000 | 나 44,296,223 · ⓐ 43,380,000 · 재산세 4,740,000 · 종부세 39,556,223 |
| M-3 | 직전 3주택(조정무관) | 3채, `taxableHouseCount=3` | 중과(count≥3) | 3채 합산 | `isMultiHouseRate(2022,3,false)=true` |
| M-4 | 직전 비조정 2주택 | 2채, `isMultiHouseInAdjustedArea=false`, count=2 | **일반**(2<3 且 비조정) | 2채 합산 | `isMultiHouseRate(2022,2,false)=false` |
| M-5 | 직전 1세대1주택 | `isOneHouseOwner=true`, 연령·보유 | 일반(11억 공제) | 단일/배열 | 기존 연령·보유 재판정 보존 |
| M-6 | 직접입력 모드 | `previousYearTotalTax` | prior-year **미호출** | — | `applyTaxCap` 직접(무변경) |
| M-7 | 2023+ 귀속 자동 다주택 | 직전=2022, 조정2주택 | 2022 중과 / 2023+ 3주택만 | 합산 | `isMultiHouseRate` 연도분기 |

> 의제 자동추적은 범위 외 — 직전연도 "일반 2주택"은 사용자가 `isOneHouseOwner=false`+`isMultiHouseInAdjustedArea=true`로 명시(§1-2 계획서).

---

## 2. 타입 정의 (`types/comprehensive.types.ts:323`)

```ts
export interface PreviousYearAutoInput {
  assessedValue: number;          // (유지) 직전 공시 합산 — 종부세 과표·ⓑ분모(합산 단일 누진)용
  isOneHouseOwner: boolean;
  birthDate?: Date;
  acquisitionDate?: Date;
  reductionRate?: number;
  ownershipRatio?: number;
  // ── 신규 ──
  priorHouseValues?: number[];           // 직전 주택별 공시(원) — 재산세상당액 주택별 합산. 미입력=[assessedValue]
  isMultiHouseInAdjustedArea?: boolean;  // 직전 조정대상지역 2주택(≤2022 중과 2축). 미입력=false
  taxableHouseCount?: number;            // 직전 세율 주택수(3주택 중과). 미입력=priorHouseValues.length ?? 1
}
```

- **`PreviousYearEquivalentResult`는 변경 불요** — `detail.appliedRate`(types:482)·`propertyTaxEquiv`·`comprehensiveTaxEquiv` 모두 기존 존재. 결과뷰 Buppyo5Sub가 이미 렌더(`:147,182,258` 실측).
- **하위호환**: 3필드 전부 optional. 미입력 시 현행 동작 100% 보존(M-1).

---

## 3. 알고리즘 — `calcPreviousYearEquivalent` 2지점 변경

### 3-0. import 추가 (현행 :19-26에 `isMultiHouseRate` 부재)
```ts
import { getComprehensiveParams, getPropertyFmrForProration, isMultiHouseRate } from "./data/comprehensive-historical";
```
순환참조 없음 — historical은 `types`·`legal-codes`만 의존(leaf, 실측 :18-19).

### 3-1. GAP-A — 세율 분기 (현행 :68-72 교체)
```ts
const houseCount = auto.taxableHouseCount ?? auto.priorHouseValues?.length ?? 1;
const useMulti = isMultiHouseRate(py, houseCount, auto.isMultiHouseInAdjustedArea ?? false);
const brackets = useMulti ? p.housingBracketsMulti : p.housingBracketsGeneral;
const { calculatedTax, appliedRate } = calcHousingTaxAmount(taxBase, brackets);
```
- `p.housingBracketsMulti` 2021·2022 모두 존재(`historical.ts:128,141` BRACKETS_PRE2023_MULTI).
- `isMultiHouseRate(py, ...)` — py=직전연도(2021). ≤2022: `count≥3 || adjusted` / 2023+: `count≥3` (`:215-224`).

### 3-2. GAP-B — 재산세상당액 주택별 합산 (현행 :80-89 교체)

★ **두 합산 방식 공존** (probe 확정):

| 항목 | 합산 방식 | 코드 기준 |
|---|---|---|
| 재산세상당액(나①) | **주택별** 표준세율 합산 | `priorHouseValues` 순회 |
| 종부세 과표(④)·ⓑ분모(⑨) | 합산 단일 누진 | `effectiveAssessedValue`(현행 무변경) |

**단일 원천(E-1)**: `priorHouseValues` 입력 시 종부세 과표용 합산도 `Σ priorHouseValues`로 도출 — `assessedValue`(합산)와의 이중 입력 불일치를 원천 차단. `assessedValue`는 `priorHouseValues` 미입력 시 fallback(M-1 하위호환).

```ts
// 직전 주택군 — priorHouseValues 우선, 미입력 시 [assessedValue] 단일(하위호환)
const priorHouses = auto.priorHouseValues ?? [auto.assessedValue];
const priorSum = priorHouses.reduce((a, b) => a + b, 0);  // 종부세 과표·ⓑ분모용 합산(단일 원천)

// (재산세상당액 나①) 주택별 표준세율 재산세 합산 — 누진이므로 합산 단일 ≠ 주택별 합산
const propertyTaxEquivRaw = priorHouses.reduce((sum, v) => {
  const base = Math.floor((v * Math.round(propertyFMR * 100)) / 100);
  return sum + calcHousingTax(base, v, false).tax;  // 표준세율 강제
}, 0);
const propertyTaxEquiv = applyEffectiveFactor(propertyTaxEquivRaw, rate, ratio);
```
- ★ 현행 `effectiveAssessedValue = applyEffectiveFactor(auto.assessedValue, ...)`(:55)를 **`priorSum` 기준으로 교체** → 종부세 과표(`taxBase` :67)·ⓑ분모(`stdTaxDenominator` :101-105)가 `priorSum` 합산 단일로 산정. (M-1: priorSum = assessedValue → 무변경)
- ★ **`detail.assessedValue` echo(:133)도 `priorSum`으로 교체** — 부표① 직전 공시가격이 합산값 표시(주택별만 입력해도 0 표시 방지). M-1: priorSum=assessedValue → 무변경.
- 검산(probe): 재산세 12억→2,250,000 + 13억→2,490,000 = **4,740,000**(교재 나①, 주택별). 종부세 과표 = priorSum 25억 → 18.05억(합산 단일). ⓑ분모 = 25억 단일 5,370,000.
- `effectiveFactor`(감면·지분)는 합산 후 1회 적용 — 현행 단일값 동작과 동일(법령 원칙3, 주택별 감면 상이는 범위 외).

### 3-3. 변경하지 않는 것 (명시)
- `applyTaxCap`(`comprehensive-tax-helpers.ts:181`) — `min(③, capAmount−ⓐ)`가 교재 `⑤=③−max(가−다,0)`와 수학적 동치(계획서 §3 증명). `prevTotal` 정확도만 개선되면 가/나/다/④/⑤ 자동 정합.
- `comprehensive-tax.ts:476-481` capRate(당해 의제 150%)·prevTotalForCap 분기 — 무변경.
- 결과뷰 Buppyo5Sub — `detail.appliedRate` 등 이미 렌더(값만 정확해짐).

---

## 4. anchor 명세 (Phase 0 — 현행 실패 확보 → Phase 1 통과)

`__tests__/tax-engine/comprehensive-special-cases.test.ts` 또는 신규 `comprehensive-prior-year-multi.test.ts`:

```ts
// PY-M2 (사례4 직전연도 자동, 2022 귀속 → 직전 2021)
const r = calculateComprehensiveTax({
  assessmentYear: 2022,
  isOneHouseOwner: false,
  properties: [
    { propertyId: "p1", assessedValue: 1_300_000_000, exclusionType: "none" },
    { propertyId: "p2", assessedValue: 1_400_000_000, exclusionType: "none", section8para4Type: "temporary_two_house" },
  ],
  previousYearAuto: {
    assessedValue: 2_500_000_000,
    priorHouseValues: [1_200_000_000, 1_300_000_000],
    isOneHouseOwner: false,
    isMultiHouseInAdjustedArea: true,
  },
});
expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(4_740_000);       // 나① 주택별 합산
expect(r.previousYearEquivalent?.detail.appliedRate).toBe(0.036);        // 중과세율
expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(43_380_000); // ⓐ 종부세
expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(39_556_223);// ② 종부세상당액
expect(r.previousYearEquivalent?.total).toBe(44_296_223);                // 나
expect(r.determinedHousingTax).toBe(6_464_123);                          // ⑤ 불변(회귀)
expect(r.taxCap?.capAmount).toBe(66_444_334);                            // 다(floor — R-1)
expect(r.taxCap?.isApplied).toBe(false);

// PY-M1 (단일 물건 회귀 — priorHouseValues 미입력)
//   기존 자동 케이스 값 그대로 (회귀 0 확인)
```

**Phase 0 실패 확인**: 현행은 `appliedRate=0.016`·`propertyTaxEquiv≈5,370,000`·`total≈22,118,000`(probe 22,118,000) → anchor 전건 실패가 정상(갭 실증).

---

## 5. 동기화 지점 (엔진→타입 경계)

| 지점 | 내용 |
|---|---|
| 타입 | `PreviousYearAutoInput` +3필드(§2) |
| 엔진 | `calcPreviousYearEquivalent` 2지점(§3-1·3-2) + import 1줄 |
| Zod(⑨⑫) | `previousYearAutoSchema`에 `priorHouseValues: z.array(z.number().nonnegative()).optional()` · `isMultiHouseInAdjustedArea: z.boolean().optional()` · `taxableHouseCount: z.number().int().positive().optional()` |
| Result | 무변경(기존 detail 필드 재사용) |

> UI/API/Route/결과뷰 동기화는 `comprehensive-tax-prior-year-multi-house.ui.design.md` 참조.

---

## 6. 리스크(엔진 한정)

| # | 항목 | 처리 |
|---|---|---|
| E-1 ✅ | `priorHouseValues` 합산 ≠ `assessedValue` 이중 원천 | **해소**: `priorHouseValues` 입력 시 `priorSum=Σ` 자동 도출이 종부세 과표·ⓑ분모 단일 원천(§3-2). `assessedValue`는 미입력 fallback. UI는 주택별만 입력(합산 표시는 read-only) |
| E-2 | 직전 3주택+조정 동시 → 중과 중복 적용 아님 | `isMultiHouseRate`는 OR 판정(`count≥3 || adjusted`) — 단일 bool, 중복 없음 |
| E-3 | R-1 다 floor 1원차 | `applyTaxCap` capAmount=`Math.floor`(:188) — binding 무관. KoreanLaw §5 절사 확인 후 표시정책 |
