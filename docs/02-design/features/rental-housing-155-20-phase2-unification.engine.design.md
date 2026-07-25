# [엔진 설계] §155⑳ Phase 2 — 공용 rental-article 판정 단일화 + 나목

> 계획서: `rental-housing-155-20-phase2-unification.plan.md`.
> ⚠️ **contingency**: 본 설계는 권장안 **T2(canonical predicate) + D-1 max + D-2 2필드(isExcluded918Rule) + D-3 F5 조건부 cap** 기준. Q-P2 확정 시 해당 지점만 조정.
> 신규 모듈: `lib/tax-engine/rental-article/{rules,types,check,derive}.ts`. 소비: §155⑳ `eligibility.ts` + 다주택 `multi-house-surcharge-count.ts`.

## 1. 케이스 인벤토리 (anchor 대상 — 행≥1)

| # | article | 취득 | 등록기준일 | cap(수도권/비수도권) | 면적 | 의무기간 | 특수게이트 | 사용 feature |
|---|---|---|---|---|---|---|---|---|
| N1 | 가 | 매입 | ≤2018.4.2 | 6억/3억 | — | 5 | 5%룰 | 둘 다 |
| N2 | 나 | 매입(기존사업자) | biz≤2003.10.29 | **취득당시 3억**(지역무관) | — | 5 | 국민주택·2호 | **Phase2 신규(§155⑳)** |
| N3 | 다 | 건설 | ≤2018.4.2 | 6억 | 298/149 | 5 | 2호·분양전환 | 둘 다 |
| N4 | 마 | 매입 | 2020.8.18경계 | 6억/3억 | — | 8/10 | 5%·918·아파트·단→장 | 둘 다 |
| N5 | 바 | 건설 | 2025.2.28경계 | **6억(pre)/9억(post)** ⚠F5 | 298/149 | 10 | 2호·5%·단→장 | 둘 다 |
| N6 | 아 | 매입 | ≥2025.6.4 | **4억/2억** | — | 6 | 아파트제외·918+계약금 | 둘 다 |
| N7 | 자 | 건설 | ≥2025.6.4 | 6억 | 298/149 | 6 | 아파트제외·2호 | 둘 다 |
| N8 | 구법 | 매입 | pre-2018 | 6억/3억 | — | 5 | — | §155⑳ |
| F5a | 바 | 건설 | 2024 등록 7억 | → 6억 초과=**배제** | ok | 10 | — | F5 회귀 |
| F5b | 바 | 건설 | 2025.3 등록 7억 | → 9억 이하=**통과** | ok | 10 | — | F5 회귀 |
| D1a | 마 | 매입 | biz2020-09·rent2020-07 | 6억/3억 | — | **max→10년** | — | D-1 divergence |

> 라(D)·사(G)는 다주택 전용(§155⑳ 미도출) — check.ts에 분기 유지, §155⑳ 어댑터는 생성 안 함.

## 2. 신규 타입 (`rental-article/types.ts`)

```ts
export type RentalArticle = "가"|"나"|"다"|"라"|"마"|"바"|"사"|"아"|"자"|"구법";

export type NormalizedRentalUnit = {
  businessRegistrationDate: Date | null;   // 나목 게이트(≤2003.10.29)·완비 판정
  rentalRegistrationDate: Date | null;
  acquisitionType: "purchase" | "construction";
  isApartment: boolean;
  isCapitalArea: boolean;                  // 다주택 region==="capital" / §155⑳ "seoul-metro" 정규화
  rentalStartOfficialPrice: number;        // 임대개시일 기준시가
  acquisitionOfficialPrice: number;        // 취득당시(나·라목)
  rentalYears: number;                     // 분수 보존 (§155⑳ rentalMonths/12·정수반올림 금지)
  landAreaM2?: number; totalFloorAreaM2?: number;
  hasMinimum2Units: boolean; hasMinimum5UnitsInCity?: boolean; isNationalSizeHousing?: boolean;
  rentIncreaseUnder5Pct: boolean;
  isExcluded918Rule: boolean; hasContractDepositProof?: boolean;   // 아목 게이트(D-2 정본)
  firstSaleContractDate?: Date; isConvertedToSale?: boolean;
  rentalCancellationDate?: Date; hasHalfDutyPeriodMet?: boolean; isSoldWithin1YearOfCancellation?: boolean; // 사목
  isExcludedAfter20200711Apt?: boolean; isExcludedShortToLongChange?: boolean;
};

// C2 구현(deviation): failCode 단수 → failCodes[] 배열 (§155⑳ 다중 사유 표시 보존).
// C2 구현 코드 집합(§155⑳ 현행): BOTH_REG_REQUIRED·RENTAL_PERIOD_SHORT·STANDARD_PRICE_EXCEEDED·
//   APARTMENT_RESTRICTED·SHORT_TERM_REGULATED·SIZE_REQUIRED·SIZE_EXCEEDED·MIN_UNITS_NOT_MET·REQUIREMENTS_NOT_CONFIRMED.
//   (SHORT_TO_LONG_CHANGE·NATIONAL_SIZE_REQUIRED·REG_DATE_GATE는 C4 확장.)
export type ArticleCheckResult = {
  passed: boolean;
  failCodes: ArticleFailCode[];
  requiredYears: number; stdPriceCap: number;
};
```

## 3. 상수 단일화 (`rental-article/rules.ts`) — 이중정의 제거

```ts
export const RENTAL_ARTICLE_RULES = {
  가: { cap: (cap)=>cap?6e8:3e8, years: 5, size: false, priceAt: "rentalStart" },
  나: { cap: ()=>3e8,            years: 5, size: false, priceAt: "acquisition", bizRegDateMax: "2003-10-29", national: true, min2: true },
  다: { cap: ()=>6e8,            years: 5, size: true,  priceAt: "rentalStart", min2: true },
  마: { cap: (cap)=>cap?6e8:3e8, yearsFn: (d)=> d<"2020-08-18"?8:10, size: false, priceAt: "rentalStart" },
  바: { capFn: (d)=> d>="2025-02-28"?9e8:6e8, years: 10, size: true, priceAt: "rentalStart", min2: true }, // ⚠F5·D-3
  아: { cap: (cap)=>cap?4e8:2e8, years: 6, size: false, priceAt: "rentalStart", apartmentExcluded: true, regulated918: true, regDateMin: "2025-06-04" },
  자: { cap: ()=>6e8,            years: 6, size: true,  priceAt: "rentalStart", apartmentExcluded: true, min2: true, regDateMin: "2025-06-04" },
  구법: { cap: (cap)=>cap?6e8:3e8, years: 5, size: false, priceAt: "rentalStart" },
  // 라·사는 다주택 전용 상수
};
```
- 양측(§155⑳ `deriveStdPriceCap`·다주택 `checkRentalType_*`)이 이 상수만 조회 → **6억/3억/9억/4억/2억·298/149·5/6/8/10 단일 출처**.

## 4. Canonical predicate (`check.ts`)

```
checkRentalArticle(article, u: NormalizedRentalUnit): ArticleCheckResult
  rule = RENTAL_ARTICLE_RULES[article]
  effRegDate = deriveEffectiveRegDate(u)              // max(biz, rent) — D-1
  // (a) 등록 완비
  if effRegDate == null → fail BOTH_REG_REQUIRED
  // (b) regDate 경계 게이트
  if rule.regDateMin && effRegDate < regDateMin → fail REG_DATE_GATE   // 아·자
  if rule.bizRegDateMax && u.businessRegistrationDate > bizRegDateMax → fail REG_DATE_GATE   // 나(biz기준·P4)
  // (c) 기간
  requiredYears = rule.yearsFn ? rule.yearsFn(effRegDate) : rule.years
  if u.rentalYears < requiredYears && !(rule.size && u.isConvertedToSale) → fail PERIOD_SHORT
  // (d) cap (측정시점 분기)
  price = rule.priceAt==="acquisition" ? u.acquisitionOfficialPrice : u.rentalStartOfficialPrice
  cap = rule.capFn ? rule.capFn(effRegDate) : rule.cap(u.isCapitalArea)
  if price > cap → fail PRICE_EXCEEDED
  // (e) 규모 (건설)
  if rule.size: landAreaM2/totalFloorAreaM2 undefined → fail SIZE_REQUIRED; >298/>149 → SIZE_EXCEEDED
  // (f) 호수
  if rule.min2 && !hasMinimum2Units → fail MIN_UNITS_NOT_MET
  // (g) 국민주택 (나)
  if rule.national && !isNationalSizeHousing → fail NATIONAL_SIZE_REQUIRED
  // (h) 아파트 — ⚠F6: 아·자(단기)만 blanket 제외 / 마(매입장기)는 2020.7.11 date조건 / 다·바(건설장기)는 blanket 제외 없음(바=단→장변경만)
  if rule.apartmentExcluded && isApartment → fail APARTMENT_RESTRICTED     // 아·자 only
  if (article==="마") && isApartment && effRegDate≥2020-07-11 → fail APARTMENT_RESTRICTED
  // 바목 단기→장기 변경 아파트는 (i2) SHORT_TO_LONG_CHANGE에서 처리(중복 제거)
  // 다목·바목 일반 아파트는 허용(다주택 checkRentalType_C/F에 isApartment 검사 없음 — Phase 1 §155⑳ blanket 제한은 F6 버그)
  // (i) 918 조정취득 배제 — 마목=hard(U2, checkRentalType_E:174) / 아목=carve-out(D-2 2필드)
  if (article==="마") && isExcluded918Rule → fail SHORT_TERM_REGULATED             // 마목 hard
  if (article==="아") && isExcluded918Rule && !hasContractDepositProof → fail SHORT_TERM_REGULATED
  // (i2) 단기→장기 변경 배제 — 마·바 (U1, E:176·F:201)
  if (article∈{마,바}) && isExcludedShortToLongChange → fail SHORT_TO_LONG_CHANGE
  // (j) 5%룰·기타 배제
  if !rentIncreaseUnder5Pct → fail (5% — §155⑳는 requirementsConfirmed 매핑)
  → passed, requiredYears, stdPriceCap=cap
```

## 5. 어댑터 (양 feature)

```ts
// §155⑳: RentalUnitInput → NormalizedRentalUnit (eligibility.ts)
toNormalized_155_20(u): { ...; isCapitalArea: u.region==="seoul-metro"; rentalYears: parseMonths/12;
  rentalStartOfficialPrice: u.standardPriceAtRentalStart; acquisitionOfficialPrice: u.acquisitionOfficialPrice;
  rentIncreaseUnder5Pct: u.requirementsConfirmed;   // D-4 매핑(묶음 확인)
  isExcluded918Rule: u.isExcluded918Rule; hasContractDepositProof: u.hasContractDepositProof; ... }
// checkEligibility: 호별 article=deriveRentalArticle(category,acq,effRegDate) → checkRentalArticle → EligibilityResult+perUnitVerdict wrap

// 다주택: HouseInfo → NormalizedRentalUnit (multi-house-surcharge-count.ts)
toNormalized_house(house): { isCapitalArea: house.isCapitalArea ?? house.region==="capital";
  rentalStartOfficialPrice: house.rentalStartOfficialPrice ?? house.officialPrice; rentalYears: calcRentalPeriodYears(house); ... }
// isLongTermRentalHousingExempt: article=house.rentalType(A~I→가~자 매핑) → checkRentalArticle(...).passed
```
> A~I ↔ 가~자 매핑(실측 `getRentalTypeLabel`): A가·B나·C다·D라·E마·F바·G사·H아·I자.

## 6. 14 동기화 지점 (§155⑳ 나목·rename — 계획 §6)

- 신규 필드: `acquisitionOfficialPrice`(string)·`isNationalSizeHousing`(bool)·rentalCategory `existing_business`.
- rename(D-2): `isRegulatedAreaNewAcq`→`isExcluded918Rule` + `hasContractDepositProof`(bool)·`isExcludedShortToLongChange`(bool·U1) 신규.
- ⑧ validate: `deriveRentalArticle` 재사용해 나목=취득당시 기준시가·국민주택 필수(3중 패턴). ⑭ route 이름변환 주의(rentalLandArea↔landAreaM2 기존 + acquisitionOfficialPrice).
- 다주택측: HouseInfo 무변경(어댑터 내부) → 다주택 14-sync 무영향, 단 판정 위임 → 회귀 재anchor.
- **derive 이관 blast-radius(계획 §3 P7)**: `deriveRentalArticle`·`deriveEffectiveRegDate`·`deriveStdPriceCap`·`deriveRequiredYears`를 `eligibility.ts`→`rental-article/derive.ts` 이관 시 import 2곳(`RentalHousingExceptionSection.tsx`⑤·`transfer-tax-validate-rental-exception.ts`⑧) 갱신 + `eligibility.ts` re-export로 테스트 import 하위호환.

## 7. anchor (Pre-Do 우선 — 계획 §8)

- N1~N8 통과/경계 + F5a(2024 7억 배제)·F5b(2025.3 7억 통과) 교차(§155⑳·다주택 동일결과).
- D1a: split-date 마목 max→10년(양측 일치).
- N2 나목: 2003.10.29 이전·국민주택·2호·취득당시 3억 통과 / 3.1억 배제 / 등록 2004 REG_DATE_GATE.
- **F6 아파트**: 바목(건설 장기) 일반 아파트 → **통과**(Phase 1은 배제했음·불리 오적용 회귀) / 바목 단→장변경 아파트(isExcludedShortToLongChange) → 배제 / 아·자 아파트 → 배제(현행 유지).
- 무회귀: 다주택 `rental-type-matrix.test.ts` + §155⑳ 173 green.
