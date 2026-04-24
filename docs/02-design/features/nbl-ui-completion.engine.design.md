# Design (엔진 편): 비사업용 토지 판정 엔진 Gap 해소

> **Parent Design**: `nbl-ui-completion.design.md`
> **작성일**: 2026-04-24
> **범위**: 엔진 Gap 6건 해소 + Form ↔ Input 매퍼 + 타입 확장

---

## 1. 타입 확장

### 1.1 `TransferFormData` (flat 필드)

기존 `nbl*` prefix 컨벤션 유지. zustand persist 직렬화 호환성을 위해 모든 필드를 primitive · 배열 · 단순 객체로 제한.

```ts
// lib/stores/calc-wizard-store.ts
export interface TransferFormData {
  // ── NBL 단순 경로 (기존) ──
  isNonBusinessLand: boolean;

  // ── NBL 상세 판정 활성화 (신규) ──
  nblUseDetailedJudgment: boolean;

  // ── NBL 공통 (기존 유지) ──
  nblLandType: "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land";
  nblLandArea: string;
  nblZoneType: string;
  nblBusinessUsePeriods: BusinessUsePeriodInput[];

  // ── NBL 위치·거주 (신규) ──
  nblLandSigunguCode: string;
  nblLandSigunguName: string;
  nblResidenceHistories: ResidenceHistoryInput[];

  // ── 무조건 면제 §168-14③ (신규) ──
  nblExemptInheritBefore2007: boolean;
  nblExemptInheritDate: string;
  nblExemptLongOwned20y: boolean;
  nblExemptAncestor8YearFarming: boolean;
  nblExemptPublicExpropriation: boolean;
  nblExemptPublicNoticeDate: string;
  nblExemptFactoryAdjacent: boolean;
  nblExemptJongjoongOwned: boolean;
  nblExemptJongjoongAcqDate: string;
  nblExemptUrbanFarmlandJongjoong: boolean;

  // ── 도시편입 유예·수도권·공동상속 (신규) ──
  nblUrbanIncorporationDate: string;
  nblIsMetropolitanArea: "" | "yes" | "no" | "unknown";
  nblOwnershipRatio: string;

  // ── 농지 세부 ──
  nblFarmingSelf: boolean;
  nblFarmerResidenceDistance: string;
  nblFarmlandIsWeekendFarm: boolean;
  nblFarmlandIsConversionApproved: boolean;
  nblFarmlandConversionDate: string;
  nblFarmlandIsMarginalFarm: boolean;
  nblFarmlandIsReclaimedLand: boolean;
  nblFarmlandIsPublicProjectUse: boolean;
  nblFarmlandIsSickElderlyRental: boolean;

  // ── 임야 세부 ──
  nblForestHasPlan: boolean;
  nblForestIsPublicInterest: boolean;
  nblForestIsProtected: boolean;
  nblForestIsSuccessor: boolean;
  nblForestInheritedWithin3Years: boolean;

  // ── 목장 세부 ──
  nblPastureIsLivestockOperator: boolean;
  nblPastureLivestockType: string;
  nblPastureLivestockCount: string;
  nblPastureLivestockPeriods: BusinessUsePeriodInput[];
  nblPastureInheritanceDate: string;
  nblPastureIsSpecialOrgUse: boolean;

  // ── 주택·별장·나대지 세부 ──
  nblHousingFootprint: string;
  nblVillaUsePeriods: BusinessUsePeriodInput[];
  nblVillaIsEupMyeon: boolean;
  nblVillaIsRuralHousing: boolean;
  nblVillaIsAfter20150101: boolean;
  nblOtherPropertyTaxType: "" | "exempt" | "comprehensive" | "separate" | "separated";
  nblOtherBuildingValue: string;
  nblOtherLandValue: string;
  nblOtherIsRelatedToResidence: boolean;

  // ── 부득이한 사유 ──
  nblGracePeriods: GracePeriodInput[];
}

export interface BusinessUsePeriodInput {
  startDate: string; endDate: string; usageType: string;
}
export interface ResidenceHistoryInput {
  sigunguCode: string; sigunguName: string;
  startDate: string; endDate: string;
  hasResidentRegistration: boolean;
}
export interface GracePeriodInput {
  type: "inheritance" | "legal_restriction" | "sale_contract" | "construction" | "unavoidable" | "preparation" | "land_replotting";
  startDate: string; endDate: string; description: string;
}
```

### 1.2 엔진 `NonBusinessLandInput` 확장

```ts
// lib/tax-engine/non-business-land/types.ts — 추가분만
export interface OwnerProfile {
  residenceHistories: OwnerResidenceHistory[];
  /** 신규 — 공동상속·공동소유 지분 (1=100%). 미지정 시 1. */
  ownershipRatio?: number;
}
```

**하위 호환**: 추가만 있고 삭제·rename 없음. 기존 14 테스트 통과.

---

## 2. Form ↔ Input 매퍼

```ts
// lib/tax-engine/non-business-land/form-mapper.ts (신규)
export function mapFormToNblInput(
  form: TransferFormData,
  context: {
    acquisitionDate: Date;
    transferDate: Date;
    parseDate: (s: string) => Date | undefined;
    parseNumber: (s: string) => number | undefined;
  },
): NonBusinessLandInput | null {
  if (!form.nblUseDetailedJudgment || !form.nblLandType) return null;
  return {
    landType: form.nblLandType,
    landArea: context.parseNumber(form.nblLandArea),
    zoneType: form.nblZoneType || undefined,
    acquisitionDate: context.acquisitionDate,
    transferDate: context.transferDate,
    businessUsePeriods: form.nblBusinessUsePeriods
      .filter((p) => p.startDate && p.endDate)
      .map((p) => ({
        startDate: context.parseDate(p.startDate)!,
        endDate: context.parseDate(p.endDate)!,
        usageType: p.usageType,
      })),
    landLocation: form.nblLandSigunguCode
      ? { sigunguCode: form.nblLandSigunguCode }
      : undefined,
    ownerProfile: {
      residenceHistories: form.nblResidenceHistories.map(/* ... */),
      ownershipRatio: context.parseNumber(form.nblOwnershipRatio) ?? 1,
    },
    unconditionalExemption: buildUnconditional(form, context),
    urbanIncorporationDate: context.parseDate(form.nblUrbanIncorporationDate),
    isMetropolitanArea: form.nblIsMetropolitanArea === "yes",
    farmlandDeeming: buildFarmlandDeeming(form, context),
    forestDetail: buildForestDetail(form),
    pasture: buildPasture(form, context),
    villa: buildVilla(form, context),
    otherLand: buildOtherLand(form, context),
    gracePeriods: buildGracePeriods(form, context),
    isFarmingSelf: form.nblFarmingSelf,
    farmerResidenceDistance: context.parseNumber(form.nblFarmerResidenceDistance),
  };
}
```

**API 스키마 변경 없음**. UI의 flat 필드는 Orchestrator 진입 직전 매퍼를 통해 nested 구조로 변환되어 기존 API 타입에 그대로 전달.

---

## 3. Gap 해소 — grace-period.ts (신규)

```ts
// lib/tax-engine/non-business-land/grace-period.ts
import type { GracePeriod, DateInterval } from "./types";
import { mergeOverlappingPeriods, sumDaysInWindow } from "./utils/period-math";

/**
 * 부득이한 사유 유예기간을 effectiveBusinessDays에 가산.
 * §168-14①에 따라 해당 기간은 사업용 사용 기간으로 간주.
 */
export function calculateGraceDaysInWindow(
  gracePeriods: GracePeriod[],
  window: DateInterval,
): number {
  const intervals = gracePeriods.map((g) => ({ start: g.startDate, end: g.endDate }));
  const merged = mergeOverlappingPeriods(intervals);
  return sumDaysInWindow(merged, window);
}
```

`period-criteria.ts` 연동:
```ts
if (rules.gracePeriods && rules.gracePeriods.length > 0) {
  const graceDays3y = calculateGraceDaysInWindow(rules.gracePeriods, window3Years);
  const graceDays5y = calculateGraceDaysInWindow(rules.gracePeriods, window5Years);
  effectiveBusinessDays3y += graceDays3y;
  effectiveBusinessDays5y += graceDays5y;
  totalBusinessDays += calculateGraceDaysInWindow(rules.gracePeriods, windowFull);
}
```

**테스트**: 상속 유예 / 법령 제한 / 질병 + 자경 겹침 중복 제거.

---

## 4. Gap 해소 — co-ownership.ts (신규)

```ts
// lib/tax-engine/non-business-land/co-ownership.ts
/**
 * 공동소유 지분을 반영한 판정 결과 조정.
 *
 * 대법원 판례 (2015두39439 등):
 * 공동상속인의 비사업용 토지 판정은 각 공유자별 독립 판단.
 * 단, 면적·금액 안분은 지분 비례.
 */
export function applyCoOwnershipRatio(
  judgment: NonBusinessLandJudgment,
  ownershipRatio: number,
): NonBusinessLandJudgment {
  if (ownershipRatio >= 1) return judgment;
  return {
    ...judgment,
    areaProportioning: judgment.areaProportioning
      ? {
          ...judgment.areaProportioning,
          businessArea: judgment.areaProportioning.businessArea * ownershipRatio,
          nonBusinessArea: judgment.areaProportioning.nonBusinessArea * ownershipRatio,
        }
      : undefined,
    warnings: [
      ...judgment.warnings,
      `공동소유 지분 ${(ownershipRatio * 100).toFixed(1)}% 반영 — 면적 안분은 지분 비례, 사업용/비사업용 판정은 공유자 개인 기준.`,
    ],
  };
}
```

---

## 5. Gap 해소 — livestock-standards.ts (신규)

```ts
// lib/tax-engine/non-business-land/data/livestock-standards.ts
/**
 * 축산법 시행규칙 별표2 기준 1마리당 표준 사육면적 (㎡).
 * 목장용지 표준면적 초과분 비사업용 안분 (§168-10).
 */
export const LIVESTOCK_STANDARD_AREA: Readonly<Record<string, number>> = Object.freeze({
  hanwoo: 10,
  dairy: 15,
  pig_sow: 2.5,
  pig_fattening: 0.8,
  poultry: 0.05,
  horse: 20,
  sheep: 2,
  goat: 2,
});

export function getLivestockStandardArea(
  livestockType: string,
  count: number,
): number {
  const perHead = LIVESTOCK_STANDARD_AREA[livestockType] ?? 0;
  return perHead * count;
}
```

`pasture.ts` 수정: 기존 하드코딩 제거 → import 사용.

---

## 6. Gap 해소 — Villa REDIRECT 자동 재분류

`engine.ts` orchestrator:

```ts
const villaResult = judgeVillaLand(input, ...);
if (villaResult.action === "REDIRECT_TO_CATEGORY") {
  // 자동으로 housing으로 재호출
  return judgeHousingLand({
    ...input,
    landType: "housing_site",
  }, categoryGroup);
}
```

---

## 7. Gap 해소 — 수도권 기본값 처리

`housing-land.ts`:
```ts
if (input.isMetropolitanArea === undefined) {
  warnings.push("수도권 여부가 지정되지 않음 — 보수적으로 수도권(3배)으로 간주");
  input = { ...input, isMetropolitanArea: true };
}
```

---

## 8. 테스트 전략

### 8.1 엔진 신규 테스트

| 파일 | 케이스 수 | 커버 범위 |
|---|---|---|
| `grace-period.test.ts` | 8 | 7가지 사유 + 중복 제거 |
| `co-ownership.test.ts` | 5 | 지분 100%/50%/33.3%, 면적 안분, 판정 불변 |
| `form-mapper.test.ts` | 12 | 각 nested 구조 변환, 빈값 처리 |

### 8.2 통합 테스트 (17 시나리오)

`integration.test.ts`에 Plan §1.2의 17개 시나리오 각 1건씩:

```ts
describe("NBL Integration — 17 scenarios", () => {
  it("Scenario 1: 2006 이전 상속 농지 무조건 면제", () => { ... });
  it("Scenario 2: 도시편입 농지 3년 유예", () => { ... });
  it("Scenario 3: 상속 임야 3년 내 양도", () => { ... });
  // ... 14건 더
});
```

파이프라인: **Form 입력 → 매퍼 변환 → 엔진 판정 → 결과 검증**.

### 8.3 UI 테스트

`nbl-wizard.test.tsx` (vitest + jsdom):
- 토글 ON/OFF 전환
- 지목 변경 시 조건부 렌더링
- 충돌 경고 표시
- 무조건 면제 체크 시 하위 섹션 음영

### 8.4 Regression
기존 14 엔진 테스트 + 1,407 전체 테스트 100% 통과 필수. Additive change only로 깨지지 않아야 함.

---

## 9. 리스크 및 완화 (Engine-level)

| 리스크 | 완화책 |
|---|---|
| `TransferFormData` 필드 30개 증가 → 타입 길이 폭증 | 주석 섹션 구분 + TypeScript group 커멘트 |
| zustand persist 직렬화 크기 증가 | 기본값이 모두 falsy·빈배열이라 JSON 크기 minimal |
| 시군구 자동완성 성능 (250개 × typing) | 빌드타임 pre-indexed Trie 고려 (일단 linear filter) |
| 엔진 regression | 기존 14 테스트 그대로 통과 확인 (additive change only) |
| 지분 판례 해석 불확실 | `inheritance-gift-tax-nontax-teacher` 에이전트로 판례 검증 |
