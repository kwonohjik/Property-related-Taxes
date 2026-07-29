# 장기임대주택 거주주택 비과세 특례(§155⑳) — 임대주택 요건 능동형 UI 수정 계획서

> 대상 화면: 이미지1 (`RentalHousingExceptionSection.tsx` 임대주택 1호 카드 + 거주주택 요건 상태).
> 목표: **임대등록기간(세무서·지자체)** 과 **임대유형** 에 따라 관련 입력만 능동 노출 → 사용자 입력·혼선 최소화 + 법정 요건 자동 판정.
> 근거 법령: 소득세법 시행령 §155⑳ + §167조의3①2호 (KoreanLaw MCP 실측, 시행 2026-07-01, mst 286211).
> 참조 이미지: ②등록신청일별 임대기간(5/8/10) · ③가~자목 상세 매트릭스 · ④2025.6.4 단기임대(6년) 요건.

---

## 0. TL;DR — 무엇을 바꾸나

1. **등록일 1필드 → 2필드 분할**: `임대사업자 등록일`(모호) → **세무서 사업자등록일(§168)** + **지자체 임대사업자등록신청일(민특법 §5)**. 두 등록이 모두 있어야 "사업자등록등" 요건 충족(§167조의3①2호 본문). **등록기준일 = 둘 중 늦은 날**(`max`) — tier·완비·임대개시·아파트 게이트 전반에 사용(Q1 결정 2026-07-25).
2. **임대유형 축 재편**: 현행 5옵션(`장기10/장기8/단기6/단기4/2018전`) 중 "장기 8년 vs 10년"은 **엔진이 무시**(등록일로 파생)하는 유령 선택 → 사용자가 고를 수 없는 값을 입력받고 있음. **취득방법(매입/건설) × 임대구분(장기일반 / 단기6년 / 구 임대주택법)** 2축으로 재편하고, **의무임대기간·기준시가 상한은 입력이 아니라 파생·표시**.
3. **조건부 능동 노출**: 소재지역·아파트여부·규모(대지/연면적)·조정대상지역 필드를 유형에 따라 노출/숨김.
4. **법령 정확성 결함 동반 수정**: 현행 §155⑳ 판정 엔진의 기준시가 상한이 6억/3억 고정 → 단기 매입(4억/2억)·건설 10년(9억) 미반영. **이미 완비된 다주택 중과측 9유형 판정(`multi-house-surcharge-count.ts`)과 단일화**하여 정본 재사용.

---

## 1. 배경 — 현행 실측 (file:line 검증됨)

### 1-A. 화면 구조
`components/calc/transfer/RentalHousingExceptionSection.tsx`
- `RentalUnitCard`(:44-198): 등록일 · 임대유형 · 취득방법 · 소재지역 · 아파트여부 · 임대개시일 기준시가 · 실제 임대기간 · 기타요건 자기확인.
- 메인 섹션(:217-558): 시나리오 A/B, 임대주택 배열, B 시나리오 3시점 기준시가, 거주주택 요건 실시간 표시.

### 1-B. 확인된 문제점

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| P1 | 등록일이 **단일 필드**, hint "지자체 또는 세무서 등록일" — 어느 날짜인지 모호. 실제로는 **둘 다** 필요(§168 + 민특법§5). | `RentalHousingExceptionSection.tsx:71-80` | 사용자 혼선·오입력 |
| P2 | 임대유형 5옵션 중 **"장기 8년"/"장기 10년"은 엔진이 무시** — `lookupRequiredRentalYears`가 등록일로만 파생(long-8/long-10 동일 분기). | `eligibility.ts:57-71` vs UI `:83-98` | 유령 선택·모순 입력(2019 등록인데 "장기10년" 선택) |
| P3 | 기준시가 상한이 **지역만**으로 6억/3억 고정 — 유형·취득방법 미반영. | `eligibility.ts:87-98` | **법령 오판정**(§2-B 참조) |
| P4 | 소재지역·아파트·(규모 미존재) 필드가 **항상 노출** — 유형과 무관하게 전부 표시. | `RentalUnitCard` 전체 | 불필요 입력·혼선 |
| P5 | 결과 카드가 **의무임대기간·기준시가 상한 등 판정 기준을 미표시** — 미충족 사유만 사후 노출. | `RentalHousingExceptionDetailCard.tsx:45-90` | 입력 중 요건 파악 불가 |

### 1-C. 현행 데이터·판정 파이프라인 (14지점 실측)

- ① 폼 타입: `lib/stores/calc-wizard-asset.ts:588-616` (`rentalUnits[]`: registrationDate·rentalType·rentalAcquisitionType·isApartment·region·standardPriceAtRentalStart·rentalMonths·rentalAutoTermination·requirementsConfirmed).
- ② 초기값: `calc-wizard-asset-factory.ts:26-38` (`makeDefaultRentalUnit`).
- ④ API 변환: `lib/calc/transfer-tax-api-helpers.ts:156-192` (`toRentalHousingExceptionApi`).
- ⑧ 검증: `lib/calc/transfer-tax-validate-rental-exception.ts:26-36`.
- ⑨⑫ Zod: `lib/api/transfer-tax-schema.ts:55-75` (`RentalTypeEnum`·`rentalUnitSchema`).
- ⑬⑭ Route: `app/api/calc/transfer/route.ts` · `app/api/calc/transfer/multi/route.ts` (`registrationDate: new Date(u.…)`).
- 엔진 판정: `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts` (`checkEligibility`·`lookupRequiredRentalYears`·`lookupStandardPriceCap`·`isApartmentRestricted`·`isShortTermRegulated`).

---

## 2. 법정 요건 — KoreanLaw MCP 실측 정리

### 2-A. §155⑳ 위임 체인 (mst 286211, 시행 2026-07-01)

- §155⑳ 는 **§167조의3①2호에 따른 주택**(= "장기임대주택")을 정의 차용.
- **거주주택 요건**(제1호): 보유기간 중 거주기간 2년 이상. (직전거주주택보유주택=B 시나리오는 사업자등록·임대사업자등록 한 날 이후 거주기간만 산입 — 기존 엔진 처리, 본 변경 범위 밖.)
- **장기임대주택 요건**(제2호): 양도일 현재 `법§168 사업자등록` + `민특법§5 임대사업자등록`으로 임대 중 + 임대료 증가율 5% 이하(증액 후 1년내 재증액 금지).
- **가목·다목 단서(§155⑳ 고유)**: §167조의3 가목·다목의 "2018.3.31까지 사업자등록등" 기한 제한을 **미적용하되**, 대신 **"2020년 7월 10일 이전에 민특법§5 임대사업자등록 신청을 한 주택"으로 한정**. → 즉 **본 화면(§155⑳)에서 가목·다목(5년 legacy)은 등록신청 ≤ 2020.7.10 인 경우만 성립**하고, 그 이후 등록은 마목·바목(10년)으로 넘어간다. **이 경계는 §2-C tier 날짜 경계(≤2020.7.10 → 5년)와 동일**하므로 Q1의 `effectiveRegDate=max`(§3-D1) 기준으로 tier를 판정하면 자연히 반영된다.

### 2-B. §167조의3①2호 목별 매트릭스 (본 화면 판정 정본)

**본문 진입요건(전 목 공통)**: `법§168 사업자등록` **AND** `민특법§5 임대사업자등록` = "사업자등록등" 둘 다 필수.

> **게이트 열 읽는 법(I2)**: 아래 "지역/기타 게이트"의 가목·다목 값은 **§155⑳ 기준**(2020.7.10 이전 등록신청)이다 — §167조의3 원문의 "2018.3.31" 단서는 §155⑳에서 대체된다(§2-A). 본 화면은 §155⑳ 판정이므로 §155⑳ 값을 정본으로 쓴다.
> **기준시가 상한 열 읽는 법(I3)**: "6억/비수도권 3억", "4억/비수도권 2억"의 수도권/비수도권 구분은 **조정대상지역 여부와 독립**이다. 조정대상지역 주택도 수도권 or 비수도권 중 하나 → cap은 수도권/비수도권 축으로, 조정대상지역은 아목 전용 **게이트**로 분리 판정(§3-D1 `region` 2값 + `isRegulatedAreaNewAcq` boolean).

| 목 | 취득·구분 | 호수 | 규모 | 의무임대기간 | 기준시가 상한(임대개시일) | 지역/기타 게이트 |
|---|---|---|---|---|---|---|
| 가 | 매입 (일반) | 1호+ | 무관 | **5년** | 6억 / 비수도권 3억 | **§155⑳: 등록신청 ≤ 2020.7.10 한정** |
| 나 | 매입 (기존사업자, 2003.10.29 이전) | 2호+ | 국민주택 | 5년 | **취득당시** 3억 (지역무관) | 기존사업자기준일 이전 등록·임대 |
| 다 | 건설 | 2호+ | 대지298·연면적149 | **5년** or 분양전환 | 6억 (지역무관) | **§155⑳: 등록신청 ≤ 2020.7.10 한정** |
| 라 | 매입 (미분양) | 5호+ | 대지298·연면적149 | 5년 | **취득당시** 3억 | 2008.6.11~2009.6.30 분양계약·수도권밖 |
| 마 | 매입 (장기일반) | 1호+ | 무관 | **10년** | 6억 / 비수도권 3억 | 아파트 2020.7.11↑ 등록분 제외(엔진 `isApartmentRestricted` 일치). ⚠️마목 단서 세부 제외목록은 MCP 하위항 미회수 — Do 전 재확인 |
| 바 | 건설 (장기일반) | 2호+ | 대지298·연면적149 | **10년** or 분양전환 | **9억** (지역무관) | 단기→장기 2020.7.11↑ 변경아파트 제외 |
| 아 | 매입 (단기 6호의2, **2025.6.4 신설**) | 1호+ | 무관 | **6년** | **4억 / 비수도권 2억** | **조정대상지역 신규취득 제외 · 아파트 제외** |
| 자 | 건설 (단기, **2025.6.4 신설**) | 2호+ | 대지298·연면적149 | **6년** | 6억 (지역무관) | 아파트 제외 |

> 나목·라목만 cap 시점이 **취득당시**(그 외 목은 임대개시일). existing_business(나목) 입력 축을 유지하려면 취득당시 기준시가 필드가 별도 필요 → §3-D2 결정 참조(I7).
> 사목(G)=자진·자동 말소 후 양도는 §155㉒㉓ 산정특례로 별도 처리(본 화면 유형 축이 아님 — 현행 `rentalAutoTermination` 필드 Phase 2 보류 유지).

### 2-C. 등록기준일별 의무임대기간 tier (이미지② — 장기일반 계열)

> 기준일 = `effectiveRegDate = max(세무서 §168, 지자체 민특법§5 신청일)` (Q1 결정, §3-D1). 이미지②는 "등록신청일"로 표기하나 본 계획은 두 등록 중 늦은 날 사용.

| effectiveRegDate | 의무임대기간 | 대응 목 |
|---|---|---|
| 2020.7.10 이전 | 5년 | 가목/다목 |
| 2020.7.11 ~ 2020.8.17 | 8년 | 마목/바목 계열(민특법 준용 8년) |
| 2020.8.18 이후 | 10년 | 마목/바목 |
| 2025.6.4 이후 (단기 신설) | 단기 6년 / 장기 10년 | 아목/자목(단기) · 마목/바목(장기) |

---

## 3. 핵심 설계 결정

### D1 — 등록일 2필드 분할 + 기준일 파생

**신규 폼 필드**(`rentalUnits[]` 내):
```ts
businessRegistrationDate: string;   // 세무서 §168 사업자등록일 (YYYY-MM-DD)
rentalRegistrationDate: string;     // 지자체 민특법§5 임대사업자등록신청일 (YYYY-MM-DD)
// registrationDate(단일) → 폐지. 마이그레이션: 기존값을 rentalRegistrationDate로 이전(businessRegistrationDate는 빈값→재입력).

// I3 — region 축 재모델링: 3값 enum('regulated-area' 포함)은 "조정 AND 비수도권" 표현 불가 →
region: 'seoul-metro' | 'non-metro';   // 수도권/비수도권 2값 (cap 4억/2억·6억/3억 산정축)
isRegulatedAreaNewAcq: boolean;        // 아목 전용 게이트: 조정대상지역 세대원 신규취득 단기임대 여부
// 기존 region='regulated-area' 데이터 → migration에서 seoul-metro + isRegulatedAreaNewAcq=true로 분해(§9)
```

**파생 규칙**(순수 함수 `deriveEffectiveRegDate` — UI·validate·엔진 3중 동일 소스):
- **등록기준일** `effectiveRegDate = max(businessRegistrationDate, rentalRegistrationDate)` — 세무서·지자체 **둘 중 늦은 날**(사용자 결정 2026-07-25). 두 등록이 모두 완료된 날 = "사업자등록등" 완비일 = 임대개시 가능 시점.
- **의무임대기간 tier 기준일** = `effectiveRegDate`. 2020.7.10 이전 / 7.11~8.17 / 8.18 이후 / 2025.6.4 경계 판정(§2-C)에 이 날짜 사용.
- **아파트 등록 제한 판정** = `effectiveRegDate ≥ 2020.7.11` (매입 장기 아파트).
- **기준시가 as-of(임대개시일)** = `effectiveRegDate` 이후(§167조의3③).
- **사업자등록등 완비 게이트** = 두 날짜 **둘 다 존재**해야 특례 적용(§167조의3①2호 본문). 하나라도 미입력 → validate 차단(자동 fallback 금지).

> **결정됨(§10-Q1, 2026-07-25)**: tier·완비·임대개시·아파트 게이트 모두 **`max(두 등록일)` 단일 기준**으로 통일. (참고: §155⑳ 가목·다목 단서의 엄밀 문언은 "지자체 민특법§5 등록신청일 ≤ 2020.7.10"이나, 두 등록이 tier 경계를 사이에 두고 갈리는 경우는 실무상 드물며 사용자가 늦은 날 통일을 선택. 필요 시 `deriveEffectiveRegDate` 단일 함수만 교체하면 지자체-신청일 기준으로 즉시 전환 가능.)

### D2 — 임대유형 축 재편 (5옵션 → 2축 + 파생)

**현행 입력**: `rentalType: long-10|long-8|short-6|short-4|pre-2018` (사용자가 기간을 직접 선택).
**신규 입력**: 이미 존재하는 `rentalAcquisitionType`(매입/건설) + 신규 `rentalCategory`.

```ts
rentalCategory: 'long_general' | 'short_6y' | 'pre_2018';   // existing_business는 Phase 2로 유보(I7)
//  long_general = 장기일반민간임대 (가/마/다/바목 — 취득방법·effectiveRegDate로 5/8/10 파생)
//  short_6y     = 단기민간임대 6년 (아/자목, 2025.6.4~)
//  pre_2018     = 구 임대주택법 (5년)
```

> **I7 — existing_business(나목) 유보**: 나목은 cap 시점이 **취득당시 3억**(임대개시일 아님)이라 별도 `acquisitionOfficialPrice` 필드가 필요하고, 대상(2003.10.29 이전 등록)이 극소수다. 초기 범위에서 **제외**하고 Phase 2에서 추가(다주택측 checkRentalType_B가 이미 취득당시 cap 처리 — 단일화 시 함께 흡수). 라목(미분양)도 동일 사유로 범위 밖.

**엔진 유형(가~자목) 도출** = `deriveRentalArticle(rentalCategory, rentalAcquisitionType, effectiveRegDate)`:
| 입력 | effectiveRegDate | → 엔진 목 | 의무기간 |
|---|---|---|---|
| long_general × 매입 | ≤ 2020.7.10 | 가 | 5년 |
| long_general × 매입 | 2020.7.11 ~ 8.17 | 마(준용 8년) | 8년 |
| long_general × 매입 | ≥ 2020.8.18 | 마 | 10년 |
| long_general × 건설 | ≤ 2020.7.10 | 다 | 5년 |
| long_general × 건설 | 2020.7.11 ~ 8.17 | 바(준용 8년) | 8년 |
| long_general × 건설 | ≥ 2020.8.18 | 바 | 10년 |
| short_6y × 매입 | (2025.6.4~) | 아 | 6년 |
| short_6y × 건설 | (2025.6.4~) | 자 | 6년 |
| pre_2018 | — | 구법 | 5년 |

**의무임대기간·기준시가 상한·규모·게이트는 사용자 입력이 아니라 위 도출 유형에서 파생** → 화면에 **읽기전용 배지로 표시**("의무임대기간 10년 · 기준시가 상한 6억(수도권)"). 파생은 **useMemo 계산·표시 전용 — store에 write 금지**(useEffect→store 미러링 정책 위반·무한루프 회피, I4).

> 단기 4년(구 `short-4`)은 §167조의3①2호에 대응 목 없음(가목이 5년) → 신규 입력 축에서 제외. 마이그레이션 시 `short-4` → `pre_2018`(5년): 의무기간이 4→5년으로 **상향**되어 기존 통과 유닛이 미충족으로 전환될 수 있음(재입력·재계산 유도). 실무상 4년 단기임대를 5년+ 임대해 가목으로 성립한 케이스는 `long_general × 매입`이 더 정확 — 마이그레이션 시 경고 후 사용자 재선택(§9, I11).

### D3 — 조건부 능동 노출 규칙

| 필드 | 위젯 | 노출 조건 | 근거 |
|---|---|---|---|
| 세무서 사업자등록일 | `DateInput` | 항상 | 사업자등록등 |
| 지자체 임대사업자등록신청일 | `DateInput` | 항상 | tier·단서 |
| 취득방법(매입/건설) | `RadioCardGroup` inline | 항상 | 유형 분기 |
| 임대구분(rentalCategory) | `RadioCardGroup` inline (장기일반/단기6년/구법) | 항상 | 유형 분기 |
| **소재지역(수도권/비수도권)** | `RadioCardGroup` inline, tone rose | 기준시가 상한이 지역별인 유형만 = **매입 장기(가/마)·단기 매입(아)**. 건설(다/바/자)은 지역무관 → **숨김** + 읽기전용 "지역무관" 안내. | §2-B cap |
| **조정대상지역 신규취득(`isRegulatedAreaNewAcq`)** | `ToggleCard` tone rose | **단기 매입(아목)만** — ON이면 특례 배제 | 아목 4) |
| **규모(대지 298㎡ · 연면적/전용 149㎡)** | `DecimalInput` ×2 (㎡) | **건설임대(다/바/자)만** | 다/바/자목 |
| **호수 충족(2호 이상)** | `ToggleCard` | 건설(다/바/자) — 자기확인 | 목별 호수 |
| **아파트 여부** | `RadioCardGroup` tone violet | 매입 장기(가/마): 노출(2020.7.11↑ 등록 제한 판정). 단기(아/자)·건설: **"아파트 제외"** 고정 안내 후 아파트=제한. | 바목 단서·아/자목 |
| 임대개시일 기준시가 | `CurrencyInput` | 항상 (상한 배지 동적 표시) | 가액요건 |
| 실제 임대기간(개월) | `DecimalInput` | 항상 (의무기간 배지 대비 실시간 충족표시) | 기간요건 |

- 파생 배지 카드: "**판정 기준**" 박스에 `유형=마목(장기일반 매입 10년)` · `의무임대기간 10년` · `기준시가 상한 6억(수도권)` · `규모요건 없음` · `아파트 2020.7.11 이후 등록 제한` 을 실시간 표시(입력 즉시). **`<ToneCard>` 사용**(인라인 톤 하드코딩 금지·`tones.ts` 단일 소스), 파생값은 **useMemo 계산**(store 미러링 금지, I4).
- native `<input type="radio|checkbox">` 신규 작성 금지 — RadioCardGroup/ToggleCard 강제(components/calc/CLAUDE.md). OFF 옵션도 tone 배경 유지.

---

## 4. 판정 로직 단일화 (single-source-engine-helper 정책)

**핵심 발견**: 가~자목 9유형의 **정확한 cap·면적·게이트 판정이 이미 완비**되어 있음.
- 다주택 중과 배제측: `lib/tax-engine/multi-house-surcharge-count.ts` (`checkRentalType_A~I`), 유형 `RentalHousingType = "A".."I"` (`lib/tax-engine/types/multi-house-surcharge.types.ts`).
- 설계 문서: `docs/02-design/features/transfer-rental-type-matrix.engine.design.md` (2026-06-16 완료 — 아목 4억/2억·자목 6억·바목 9억 cap 검증됨).

반면 §155⑳측 `rental-housing-exception/eligibility.ts:87-98`은 6억/3억 고정(불완전).

> **I8 — A~I ↔ 가~자 매핑 실측 필수**: Do 진입 전 `multi-house-surcharge-count.ts`의 `checkRentalType_A~I` 각 함수 주석·상수를 grep해 **A~I 문자 ↔ 가~자 목 ↔ cap/면적/기간**을 실측 확정한다(정책 `enum-verification-before-mapping` — 추정 매핑 금지). 본 계획 §2-B 표(아=4억/2억·자=6억·바=9억)와 1:1 대조.

**권장(Phase 2)**: §155⑳ 기준시가 상한·규모·게이트 판정을 `multi-house-surcharge-count.ts`의 유형별 헬퍼로 위임(정본 재사용). 두 특례가 같은 §167조의3①2호를 참조하므로 **판정 규칙 이중 정의 금지**(정책 `single-source-engine-helper`). 위임이 과대 결합이면 최소한 cap/규모 상수를 공용 `legal-codes/transfer.ts`로 추출해 양측이 동일 상수 조회.

**필수(Phase 1)**: 위임 전이라도 `lookupStandardPriceCap`을 **유형·취득방법·지역(수도권/비수도권) aware**로 즉시 보정(§8). 그리고 파생 함수 `deriveRentalArticle`·`deriveRequiredYears`·`deriveStdPriceCap`는 **단일 export 순수 함수**로 두고 **UI(⑤)·validate(⑧)·엔진(판정)이 모두 동일 함수를 import 재사용**(3중 재구현 금지 — dual-truth 회피, 정책 `single-source-engine-helper`·`mirror-pattern`, I5).

---

## 5. 14개 동기화 지점 영향 분석

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | `calc-wizard-asset.ts:588-616` | `registrationDate` 제거 → `businessRegistrationDate`+`rentalRegistrationDate`; `rentalType`(5값) → `rentalCategory`(3값); `region` 3값 → 2값 + `isRegulatedAreaNewAcq: boolean`(I3); (규모용) `rentalLandArea`·`rentalTotalFloorArea` optional; `hasMinimum2Units` boolean |
| ② initial | `calc-wizard-asset-factory.ts:26-38` | `makeDefaultRentalUnit` 신필드 기본값 |
| ③ normalize | 동 파일 마이그레이션 | 기존 `registrationDate`→`rentalRegistrationDate`, `rentalType` 5값→`rentalCategory`, `region='regulated-area'`→2값+`isRegulatedAreaNewAcq` 분해 (§9) |
| ④ API 변환 | `transfer-tax-api-helpers.ts:156-192` | 두 날짜 직렬화; `rentalCategory`+파생 유형(deriveRentalArticle 재사용) 전송; region 2값·isRegulatedAreaNewAcq·면적·호수 |
| ⑤ UI 위젯 | `RentalHousingExceptionSection.tsx` | D1·D2·D3 전면 반영 + 파생 배지 |
| ⑥ 사이드바 | 해당없음(임대주택은 합계 미기여) | — |
| ⑦ 결과 카드 | `RentalHousingExceptionDetailCard.tsx` | 판정 기준(유형·의무기간·cap) echo 표시(P5 해소) |
| ⑧ Validation | `transfer-tax-validate-rental-exception.ts` | 두 날짜 모두 필수(사업자등록등 게이트); 건설=면적 필수; 유형별 필수값(자동 안분 fallback 금지). `deriveRentalArticle`/cap **재사용**(재구현 금지, I5) |
| ⑨⑩ Zod enum | `transfer-tax-schema.ts:55-61` | `RentalTypeEnum`→`RentalCategoryEnum`(3값); `RentalRegionEnum` 2값화; `isRegulatedAreaNewAcq` boolean |
| ⑪ 자산-수준 acqDate fallback | 해당없음 | — |
| ⑫ Zod 입력객체 | `transfer-tax-schema.ts:64-75` | `rentalUnitSchema` 신필드(날짜 2종·region 2값·isRegulatedAreaNewAcq·면적 2종·호수) |
| ⑬ body spread | `transfer-tax-api.ts` · `multi-transfer-tax-api.ts` | 신 payload 통과 |
| ⑭ Route 매핑 | `app/api/calc/transfer/route.ts` · `.../multi/route.ts` | `new Date()` 2종; 면적 이름변환 주의(`rentalLandArea`→엔진 `landArea` — 침묵 strip 위험, 매핑 테스트 가드) |

**엔진 타입**: `rental-housing-exception/types.ts:39-61` `RentalUnitInput` — `registrationDate`→2필드, `rentalType`→`rentalCategory`, `region` 2값+`isRegulatedAreaNewAcq`, 면적 2종·`hasMinimum2Units` 추가. `RentalUnitFailReason.code`(types.ts:99-108)에 `SIZE_EXCEEDED`·`SIZE_REQUIRED`·`MIN_UNITS_NOT_MET`·`BOTH_REG_REQUIRED` 추가. `EligibilityResult`에 `perUnitVerdict[]` echo(⑦ 결과카드 판정기준 표시). 판정 로직 §4 단일화. **상세: `rental-housing-155-20-active-ui.engine.design.md`.**

---

## 6. 법령 정확성 결함 (동반 수정 — 검증 후 확정)

> 정책 `feedback_numeric_impact_verify_before_bug_claim`: 아래는 코드·법령 대조로 확인된 **판정 규칙 결함**. Do 진입 전 anchor로 세액 영향 재확인 필수.

- **F1 — 단기 매입(아목) cap 과대**: `lookupStandardPriceCap`이 6억/3억 반환하나 아목은 4억/2억. → 5억 단기매입 수도권 주택이 **법령상 초과인데 특례 통과**(납세자 유리 오적용·과소과세). `eligibility.ts:87-98`.
- **F2 — 건설 장기(바목) cap 과소**: 바목 9억이나 엔진 6억 적용. → 7억 건설임대가 **법령상 적격인데 특례 배제**(납세자 불리 오적용 — 정책 `feedback_no_unfavorable_application_without_legal_basis` 위반). 
- **F3 — 규모요건 미검증**: 건설임대 대지298·연면적149 상한 판정 자체가 §155⑳측에 없음(필드 부재).
- **F4 — 단기 4년(short-4) 무근거 5년 미만 통과**: `eligibility.ts:49-51`이 short-4→4년. §167조의3①2호에 4년 목 없음(가목 5년). → 4년 임대가 특례 통과 가능(과소과세 소지). §9 마이그레이션에서 제거.

**해소 경로(I10)**: **Phase 1** = `deriveStdPriceCap` 유형·취득방법·지역 aware화(F1·F2 해소) + 규모(대지/연면적) 필드·판정 추가(F3 해소) + short-4 축 제거(F4 해소). **Phase 2** = 다주택측 `checkRentalType_A~I` 위임으로 이중정의 자체를 제거(리팩터 — 신규 결함 방지). 즉 F1~F4는 **Phase 1에서 이미 해소**되고, Phase 2는 단일화(중복 제거)다.

---

## 7. 능동 노출 UI 목업 (요지)

```
[임대주택 1호]
 ├ 세무서 사업자등록일        [YYYY-MM-DD]   (§168)
 ├ 지자체 임대사업자등록신청일 [YYYY-MM-DD]   (민특법§5 · 의무기간 기준일)
 ├ 취득방법  (● 매입  ○ 건설)                    RadioCardGroup
 ├ 임대구분  (● 장기일반  ○ 단기 6년  ○ 구 임대주택법)   RadioCardGroup  ※기존사업자(나목)=Phase2
 │
 ├ ▨ 판정 기준 (읽기전용, useMemo 파생 · ToneCard)
 │    유형: 마목(장기일반 매입 10년)
 │    의무임대기간: 10년   |   기준시가 상한: 6억(수도권)
 │    규모요건: 없음        |   아파트: 2020.7.11 이후 등록 제한
 │
 ├ [매입 장기·단기매입만] 소재지역 (● 수도권  ○ 비수도권)   RadioCardGroup
 ├ [단기매입(아목)만]      □ 조정대상지역 세대원 신규취득(ON=배제)  ToggleCard
 ├ [건설만]               규모: 대지 [__]㎡(≤298) · 연면적/전용 [__]㎡(≤149)
 ├ [건설만]               □ 2호 이상 임대 충족  ToggleCard
 ├ [매입장기]             아파트 여부 (아파트 아님/아파트)   ※단기·건설=아파트 제외 고정
 ├ 임대개시일 기준시가     [____] 원   → 상한 6억 대비 실시간 ✓/✗
 ├ 실제 임대기간           [__] 개월   → 의무 10년(120월) 대비 실시간 ✓/✗
 └ □ 임대료 5% 상한·등록유지·1년내 재증액 금지 자기확인
```

---

## 8. 마이그레이션 · 회귀 리스크

- **sessionStorage 마이그레이션**(`calc-wizard-asset` 저장분, → `calc-wizard-migration.ts`):
  - `registrationDate`→`rentalRegistrationDate` 복사, `businessRegistrationDate`=빈값(재입력 유도).
  - `rentalType` 5값→`rentalCategory`: `long-8/long-10`→`long_general`, `short-6`→`short_6y`, `pre-2018`→`pre_2018`, **`short-4`→`pre_2018`+경고**(의무기간 4→5년 상향·재계산 유발, I11 — long_general 매입 재선택 권고 배너).
  - `region` 3값→2값+boolean: `regulated-area`→`seoul-metro`+`isRegulatedAreaNewAcq=true`, `seoul-metro`/`non-metro`→그대로+`isRegulatedAreaNewAcq=false`(I3).
- **면적 이름 불일치 침묵 strip**: `rentalLandArea`↔엔진 `landArea` — route 매핑 누락 시 0(=298 통과) 과대적용. 다주택 중과측과 동일 함정(설계문서 line 70) → route 매핑 단위테스트 필수.
- **B 시나리오(PHRP) 무영향 확인**: 3시점 기준시가 로직(`:330-451`)은 등록일·유형과 독립 → 회귀 없어야. E2E `transfer-rental-97-3/97-4` + `rental-housing-exception/*` 전량 green 유지.
- **다필지·다건 경로**: `multi/route.ts`도 동일 매핑 필요(단건과 대칭).

---

## 9. 검증 계획 (Pre-Do anchor 우선 — 정책 `pre_do_anchor_verification`)

**Phase 0 (anchor 먼저)**:
1. `lookupRequiredRentalYears` tier 파생: 지자체 신청일 2020.7.10/7.11/8.18/2025.6.4 경계 6케이스.
2. cap 유형 aware: 아목 수도권 4억 경계(3.9억 통과·4.1억 배제)·바목 9억 경계·자목 6억 — 단일화 후 다주택측 anchor와 동일값 확인.
3. F1~F4 회귀: 현행 통과하던 5억 단기매입이 **배제로 전환**됨을 고정(세액 영향 anchor).

**Phase Do (14지점)**: ①~⑭ 구현 → `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/rental-housing-exception/` green → route 매핑 테스트 → **브라우저 수동**(등록일 2필드·유형 전환 시 필드 노출/숨김·배지 파생 확인, Network 탭 신필드 확인).

**마이그레이션 회귀(I11)**: `calc-wizard-migration.ts` 단위테스트 — (a) `registrationDate`→`rentalRegistrationDate` 복사 + `businessRegistrationDate` 빈값, (b) `rentalType` 5값→`rentalCategory` 매핑, (c) `region='regulated-area'`→`seoul-metro`+`isRegulatedAreaNewAcq=true` 분해, (d) `short-4`→`pre_2018` 시 의무기간 4→5년 상향으로 기존 통과 유닛이 미충족 전환됨을 anchor(silent 오적용 방지).

**E2E(I12)**: `e2e/transfer-rental-*.spec.ts` 확장 — 매입 장기(마목)·단기(아목)·건설(자목) 3유형 필드 노출/숨김 + 판정 배지 스냅샷. 신규 필드에 `data-testid` 부여: `rental-biz-reg-date-{i}`·`rental-reg-date-{i}`·`rental-category-{i}`·`rental-region-{i}`·`rental-regulated-newacq-{i}`·`rental-land-area-{i}`·`rental-floor-area-{i}`·`rental-verdict-badge-{i}`. ToggleCard는 `setChecked`(memory `feedback_e2e_togglecard_setchecked`) 셀렉터 사용.

---

## 10. 미결 결정사항 (사용자 확인)

- **Q1 — tier 기준일 [결정됨 2026-07-25]**: **`max(세무서 §168 등록일, 지자체 민특법§5 신청일)` = 둘 중 늦은 날**을 tier·완비·임대개시·아파트 게이트 전반의 단일 기준으로 사용(두 날짜 모두 입력받음). D1 반영 완료.
- **Q2 — 결함 F1~F4 수정 범위**: (권장) 본 UI 작업과 함께 엔진 판정 단일화(§4)로 동시 수정. vs 별도 PR 분리. **동시 수정 권장**(같은 판정면 이중정의 방지).
- **Q3 — 유형 단일화 깊이**: (권장) Phase 1=cap/면적 보정 + Phase 2=다주택측 9유형 위임. vs Phase 1만. **단계 분리 권장**.
- **Q4 — 사목(자진·자동 말소)**: 현행 `rentalAutoTermination` Phase 2 보류 유지(본 계획 범위 외). 이견 시 별도 확장.

---

## 부록 — 파일 인덱스 (검증된 앵커)

| 계층 | 파일 | 라인 |
|---|---|---|
| UI | `components/calc/transfer/RentalHousingExceptionSection.tsx` | 71-198(카드)·330-451(B)·453-555(요건상태) |
| 결과카드 | `components/calc/results/transfer/RentalHousingExceptionDetailCard.tsx` | 45-90 |
| 폼타입 | `lib/stores/calc-wizard-asset.ts` | 588-616 |
| 초기값·팩토리 | `lib/stores/calc-wizard-asset-factory.ts` | 15-38 |
| 엔진 판정 | `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts` | 37-72·87-98·113-134·148-239 |
| 엔진 타입 | `lib/tax-engine/transfer-tax/rental-housing-exception/types.ts` | 23-61 |
| 엔진 step | `lib/tax-engine/transfer-tax-rental-housing-step.ts` | 90-198 |
| API 변환 | `lib/calc/transfer-tax-api-helpers.ts` | 156-192 |
| Validation | `lib/calc/transfer-tax-validate-rental-exception.ts` | 26-36 |
| Zod | `lib/api/transfer-tax-schema.ts` | 55-81 |
| Route | `app/api/calc/transfer/route.ts` · `app/api/calc/transfer/multi/route.ts` | rentalHousingException 블록 |
| 정본 재사용원 | `lib/tax-engine/multi-house-surcharge-count.ts` (`checkRentalType_A~I`) · `docs/02-design/features/transfer-rental-type-matrix.engine.design.md` | — |
