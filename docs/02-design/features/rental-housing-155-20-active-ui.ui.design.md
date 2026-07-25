# [UI 설계] §155⑳ 임대주택 요건 능동형 UI

> 계획서: `rental-housing-155-20-active-ui.plan.md` · 엔진설계: `.engine.design.md`.
> 대상: `components/calc/transfer/RentalHousingExceptionSection.tsx` `RentalUnitCard`(:44-198).
> 공용 컴포넌트 강제: `DateInput`·`RadioCardGroup`·`ToggleCard`·`DecimalInput`·`CurrencyInput`·`ToneCard`. native radio/checkbox 신규 금지.

## 1. 위젯 레이아웃 (RentalUnitCard 개편)

```
┌ 임대주택 {i+1}호 ────────────────────────────────── [삭제]
│ 세무서 사업자등록일(§168)     DateInput   testid=rental-biz-reg-date-{i}
│ 지자체 임대사업자등록신청일    DateInput   testid=rental-reg-date-{i}   hint="민특법§5 · 늦은 날이 판정기준"
│ 취득방법   RadioCardGroup inline emerald  (매입/건설)   testid=rental-acq-type-{i}
│ 임대구분   RadioCardGroup inline emerald  (장기일반/단기6년/구법)   testid=rental-category-{i}
│
│ ▨ 판정 기준  (ToneCard tone=sky, 읽기전용, useMemo 파생)   testid=rental-verdict-badge-{i}
│    유형 마목 · 의무임대기간 10년 · 기준시가 상한 6억(수도권) · 규모요건 없음 · 아파트 2020.7.11↑ 제한
│    ※ 두 등록일 중 하나라도 미입력 → "사업자등록등 미완비 — 특례 불가" (rose)
│
│ [매입 장기/단기매입]  소재지역  RadioCardGroup inline rose (수도권/비수도권)  testid=rental-region-{i}
│ [건설]                (숨김) "소재지역 무관 (건설임대)" 안내만
│ [단기매입(아목)]      조정대상지역 세대원 신규취득  ToggleCard rose  testid=rental-regulated-newacq-{i}
│ [건설]                규모: 대지 DecimalInput(≤298) · 연면적/전용 DecimalInput(≤149)  testid=rental-land-area-{i}/rental-floor-area-{i}
│ [건설]                2호 이상 임대 충족  ToggleCard   testid=rental-min2units-{i}
│ [매입 장기]           아파트 여부  RadioCardGroup violet  testid=rental-apartment-{i}
│ [단기·건설]           "아파트 제외 유형" 안내 + 아파트 선택 시 rose 경고
│ 임대개시일 기준시가    CurrencyInput  → 상한 배지 대비 ✓/✗ 실시간
│ 실제 임대기간(개월)    DecimalInput   → 의무기간 배지 대비 ✓/✗ 실시간
│ □ 임대료 5%·등록유지·1년내 재증액 금지 자기확인  ToggleCard violet  testid=rental-req-confirm-{i}
└──────────────────────────────────────────────────
```

## 2. 조건부 노출 파생 (useMemo — store 미러링 금지)

```ts
// RentalUnitCard 내부. 단일 소스 순수함수 재사용(엔진설계 §4와 동일 import)
const effectiveRegDate = useMemo(() => deriveEffectiveRegDate(unit), [unit.businessRegistrationDate, unit.rentalRegistrationDate]);
const article  = useMemo(() => deriveRentalArticle(unit.rentalCategory, unit.rentalAcquisitionType, effectiveRegDate), [...]);
const showRegion   = article ∈ {가,마,아,구법};      // 매입 계열(cap 지역별) — 건설=숨김. 구법 포함(U1: 6억/3억 지역별)
const showRegulated= article === 아;                 // 단기매입만
const showSize     = unit.rentalAcquisitionType === 'construction';
const showApartment= article ∈ {가,마,구법};         // 매입 계열(U2). 단기·건설은 "아파트 제외" 고정안내
const cap = deriveStdPriceCap(article, unit.region);
const reqYears = deriveRequiredYears(article, effectiveRegDate);
```
- 파생값은 **표시 전용** — `set()`으로 store에 쓰지 않는다(useEffect→store 미러링 금지·무한루프 회피).
- `deriveRentalArticle` 등은 엔진과 **동일 export 함수 import**(3중 재사용 — dual-truth 회피).

## 3. 클라이언트 8 동기화 지점 (계획 §5 중 ①~⑧)

| # | 위치 | 변경 |
|---|---|---|
| ① FormData | `calc-wizard-asset.ts:588-616` | rentalUnits 필드 개편(엔진설계 §2 대응 string형) |
| ② initial | `calc-wizard-asset-factory.ts:26-38` | `makeDefaultRentalUnit`: businessRegistrationDate="", rentalRegistrationDate="", rentalCategory="long_general", region="seoul-metro", isRegulatedAreaNewAcq=false, rentalLandArea="", rentalTotalFloorArea="", hasMinimum2Units=false |
| ③ normalize | `calc-wizard-migration.ts` | 계획 §8 마이그레이션(registrationDate·rentalType·region 분해) |
| ④ API 변환 | `transfer-tax-api-helpers.ts:156-192` | 2날짜 직렬화·rentalCategory·region 2값·boolean·면적 parseDecimal |
| ⑤ UI 위젯 | 본 문서 §1·§2 | RentalUnitCard 개편 |
| ⑥ 사이드바 | — | 해당없음 |
| ⑦ 결과 카드 | `RentalHousingExceptionDetailCard.tsx:45-90` | `eligibility.perUnitVerdict` 있으면 유형·의무기간·cap 표(P5) |
| ⑧ Validation | `transfer-tax-validate-rental-exception.ts:26-36` | 2날짜 필수·건설 면적 필수·유형별 필수값. `deriveRentalArticle` 재사용(재구현 금지) |

## 4. 검증(⑧) 규칙 — UI 통과↔validate 차단 모순 금지

- 두 등록일 중 하나라도 빈값 → 차단("세무서·지자체 등록일을 모두 입력").
- 건설(rentalCategory·acqType=construction) & 면적 빈값 → 차단(엔진 SIZE_REQUIRED와 동일 — 침묵 통과 금지).
- 기준시가·실제임대기간 빈값 → 차단(기존 유지).
- **API fallback ↔ validate 동기화**: API 변환이 값을 넣는 필드는 validate도 동일 필수. UI 노출된 필드만 validate(숨김 필드는 검증 skip — 건설이면 region 검증 skip).

## 5. E2E (계획 §9)

- 유형 전환(장기일반↔단기6년↔건설) 시 region/조정/규모/아파트 필드 노출·숨김 스냅샷.
- 판정 배지(`rental-verdict-badge-{i}`) 텍스트가 유형별로 갱신되는지.
- ToggleCard는 `setChecked`(memory `feedback_e2e_togglecard_setchecked`).
