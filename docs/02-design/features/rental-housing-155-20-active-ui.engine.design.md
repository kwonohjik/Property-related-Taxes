# [엔진 설계] §155⑳ 임대주택 요건 능동형 UI — 판정 엔진 개편

> 계획서: `rental-housing-155-20-active-ui.plan.md` (법령 매트릭스 §2·결정 §3·14지점 §5).
> 대상 엔진: `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts` + `types.ts`.
> 원칙: 판정 규칙 단일 소스(파생 순수함수) · 자동 fallback 금지 · 법령 정확성 최우선. 정본 재사용 후보: `multi-house-surcharge-count.ts` `checkRentalType_A~I`.

## 1. 케이스 인벤토리 (엔진 anchor 대상 — 행≥1)

| # | rentalCategory | 취득 | effectiveRegDate | 도출 목 | 의무기간 | cap(수도권/비수도권) | 규모 | 게이트 | anchor 기대 |
|---|---|---|---|---|---|---|---|---|---|
| C1 | long_general | 매입 | 2019-01-01 | 가 | 5년 | 6억/3억 | — | 등록신청≤2020.7.10 | 5년 미만 배제·통과 경계 |
| C2 | long_general | 매입 | 2020-07-11 | 마(준용8) | 8년 | 6억/3억 | — | — | 96개월=통과·95=배제 |
| C3 | long_general | 매입 | 2020-08-18 | 마 | 10년 | 6억/3억 | — | 아파트2020.7.11↑ 제외 | 아파트=배제 |
| C4 | long_general | 건설 | 2021-03-01 | 바 | 10년 | **9억**(지역무관) | 298/149 | 면적초과 배제 | 7억=통과(F2 회귀) |
| C5 | short_6y | 매입 | 2025-07-01 | 아 | 6년 | **4억/2억** | — | 조정신규취득 배제·아파트 제외 | 4.1억 수도권=배제(F1 회귀) |
| C6 | short_6y | 건설 | 2025-07-01 | 자 | 6년 | 6억(지역무관) | 298/149 | 아파트 제외 | 6.1억=배제 |
| C7 | pre_2018 | 매입 | 2017-01-01 | 구법 | 5년 | 6억/3억 | — | — | 5년 경계 |
| C8(회귀) | (migrated short-4) | 매입 | 2019-06-01 | →pre_2018 | 4→**5년** | 6억/3억 | — | — | 4년 임대=배제(F4 회귀) |

> C1~C8은 `__tests__/tax-engine/rental-housing-exception/rh-eligibility-period.test.ts` 확장 대상. 각 cap/기간 경계는 3.9억 통과·4.1억 배제식 ±1원 anchor.

## 2. Input 타입 변경 (`RentalUnitInput`)

```ts
// BEFORE (types.ts:39-61) → AFTER
export type RentalCategory = 'long_general' | 'short_6y' | 'pre_2018';  // 'existing_business'=Phase2
export type RentalRegion = 'seoul-metro' | 'non-metro';                 // 'regulated-area' 제거(축 분리)

export type RentalUnitInput = {
  businessRegistrationDate: Date;      // 세무서 §168 (신규)
  rentalRegistrationDate: Date;        // 지자체 민특법§5 (구 registrationDate 대체)
  rentalCategory: RentalCategory;      // 구 rentalType 대체
  rentalAcquisitionType: 'purchase' | 'construction';
  isApartment: boolean;
  region: RentalRegion;                // 2값
  isRegulatedAreaNewAcq: boolean;      // 아목 게이트 (신규)
  standardPriceAtRentalStart: number;
  landAreaM2?: number;                 // 건설 규모 (신규, ≤298 판정)
  totalFloorAreaM2?: number;           // 건설 규모 (신규, ≤149 판정)
  hasMinimum2Units: boolean;           // 건설 호수 자기확인 (신규)
  rentalMonths: number;
  rentalAutoTermination: boolean;      // Phase2 보류 유지
  requirementsConfirmed: boolean;
};
```

## 3. Result 타입 변경 (echo — P5 결과카드 판정기준 표시)

**`EligibilityResult`에 부착**(결과카드 `RentalHousingExceptionDetailCard`가 `detail.eligibility` 경유로 읽음 — E3). 유닛별 echo(optional, 산식 무변경 — 정책 `echo-field-pattern`):
```ts
perUnitVerdict?: Array<{
  unitIndex: number;
  derivedArticle: '가'|'다'|'마'|'바'|'아'|'자'|'구법';  // 나/라는 Phase2(superset)
  requiredYears: number;      // 파생 의무기간
  stdPriceCap: number;        // 파생 cap
  effectiveRegDate: string;   // max(두 등록일)
  sizeRequired: boolean;      // 건설 규모요건 적용 여부
}>;
```

## 4. 알고리즘 (단일 소스 순수 함수 — UI·validate·엔진 3중 재사용)

```
deriveEffectiveRegDate(u): Date = max(businessRegistrationDate, rentalRegistrationDate)
  // 둘 중 하나라도 없으면 null → 상위에서 "사업자등록등 미완비"로 배제(자동 fallback 금지)

deriveRentalArticle(rentalCategory, acqType, effectiveRegDate): Article
  // 계획 §3-D2 표 그대로. pre_2018→'구법'. long_general은 acqType×effectiveRegDate 경계로 가/마·다/바.

deriveRequiredYears(article, effectiveRegDate): number
  // 가/다=5, 마/바=(≤2020.8.17?8:10), 아/자=6, 구법=5

deriveStdPriceCap(article, region): number   // ⚠ 취득방법·유형·지역 aware (F1·F2 해소)
  // 가/마: region==seoul?6억:3억 | 나/라:3억(취득당시) | 다:6억 | 바:9억 | 아:region==seoul?4억:2억 | 자:6억 | 구법:6억/3억

checkUnitEligibility(u):  // 호별
  1. effectiveRegDate=null(등록 미완비) → fail(BOTH_REG_REQUIRED)
  2. actualYears < deriveRequiredYears → fail(RENTAL_PERIOD_SHORT)
  3. standardPriceAtRentalStart > deriveStdPriceCap → fail(STANDARD_PRICE_EXCEEDED)
  4. isApartmentRestricted(article, effectiveRegDate, isApartment) → fail(APARTMENT_RESTRICTED)
     // 매입장기: effectiveRegDate≥2020.7.11 & isApartment / 아·자(단기)·건설: isApartment 무조건 제외
  5. article∈{아} & isRegulatedAreaNewAcq → fail(SHORT_TERM_REGULATED)
  6. 건설(다/바/자): landAreaM2 or totalFloorAreaM2 undefined → fail(SIZE_REQUIRED)  // E1 — 침묵 통과 차단
     그 외 landAreaM2>298 or totalFloorAreaM2>149 → fail(SIZE_EXCEEDED)             // F3 신규
  7. 건설(다/바/자): !hasMinimum2Units → fail(MIN_UNITS_NOT_MET)
  8. !requirementsConfirmed → fail(REQUIREMENTS_NOT_CONFIRMED)
  → fails.length===0 → pass
```

> **E1 침묵 통과 차단**: 건설 유형에서 면적 미입력(undefined)을 `undefined>298=false`로 통과시키면 과대적용 — 반드시 SIZE_REQUIRED로 fail하고 validate(⑧)도 동일 차단(자동 fallback 금지). 다주택측 함정(계획 §8)과 동형.
> **E2 fail code union 확장**: `RentalUnitFailReason.code`(types.ts:99-108)에 `SIZE_EXCEEDED`·`SIZE_REQUIRED`·`MIN_UNITS_NOT_MET`·`BOTH_REG_REQUIRED` 추가. 기존 `SHORT_TERM_REGULATED`는 아목 게이트로 재사용.

**단일화 경로(Phase2)**: 위 `deriveStdPriceCap`·규모·게이트를 `checkRentalType_A~I`(multi-house-surcharge-count.ts)로 위임. A~I ↔ 가~자 매핑은 **grep 실측 확정 후**(정책 `enum-verification-before-mapping`) — 임의 매핑 금지.

## 5. 14 동기화 지점 (계획 §5 참조) — 엔진측 핵심

- 엔진 input: `RentalUnitInput` 2절.
- 엔진 result: `perUnitVerdict` echo(3절).
- Route 매핑(⑭): `businessRegistrationDate`·`rentalRegistrationDate` `new Date()` 2종 + `landAreaM2`/`totalFloorAreaM2` **이름 일치**(폼 rentalLandArea↔엔진 landAreaM2 변환 시 침묵 strip 주의 — 매핑 단위테스트).

## 6. 회귀 anchor (Pre-Do 우선)

- F1: C5 4.1억 수도권 단기매입 → 배제(현행은 6억 cap으로 통과했음 — 세액 증가 anchor).
- F2: C4 7억 건설 10년 → 통과(현행은 6억 cap으로 배제했음 — 세액 감소 anchor).
- F3: C4 면적 300㎡ → 배제(현행은 면적 미검증으로 통과).
- F4: C8 short-4 4년 임대 → 배제(현행 통과).
- 무변경 회귀: 기존 `rh-eligibility-period.test.ts` long-8/long-10 tier 케이스는 rentalCategory=long_general 재작성 후 동일 결과.
