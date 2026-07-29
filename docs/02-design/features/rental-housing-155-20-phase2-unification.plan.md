# §155⑳ Phase 2 — 다주택 중과측 9유형 판정 단일화 + 나목(기존사업자) 추가 계획서

> 선행: `rental-housing-155-20-active-ui.plan.md`(Phase 1 완료·PR#774). 본 계획은 그 §4·Q3에서 유보한 Phase 2.
> 목표: §167조의3①2호 가~자목 판정 규칙이 **§155⑳ 거주주택특례**와 **다주택 중과 배제** 두 곳에 이중 정의된 것을 단일 소스로 통합 + §155⑳에 **나목(existing_business)** 추가.
> 근거: 소득세법 시행령 §155⑳ · §167조의3①2호 (KoreanLaw MCP 실측, mst 286211).

---

## 0. TL;DR

1. **핵심 문제**: 두 feature가 같은 조문의 cap·면적·기간·게이트를 **각자 하드코딩** → Phase 1에서 이미 **바목 cap divergence 버그** 발생(§155⑳=9억 고정 vs 다주택=6억 pre-2025.2.28). 단일화로 재발 차단.
2. **단일화 아키텍처**: 공용 모듈 `lib/tax-engine/rental-article/`(상수 `rules.ts` + canonical predicate `check.ts`). 두 feature가 얇은 **어댑터**로 자기 입력을 `NormalizedRentalUnit`으로 변환해 호출. §155⑳는 rich `EligibilityResult`로, 다주택은 boolean으로 wrap.
3. **미해결 divergence 4종 결정 필요**: 날짜 의미(max vs 지자체/개별)·아목 조정게이트(1필드 vs 2필드)·바목 cap(역사 개정)·다주택 UX(A~I 입력 유지 vs 도출 전환).
4. **나목 추가**: `existing_business` rentalCategory + `취득당시 기준시가`·`국민주택규모` 필드(취득당시 3억·2003.10.29 이전 등록). §155⑳ 14-sync 소규모 재실행.

---

## 1. 현행 실측 — 두 엔진 divergence (file:line 검증)

| 축 | 다주택 중과 (`multi-house-surcharge-count.ts`) | §155⑳ (`rental-housing-exception/eligibility.ts`) |
|---|---|---|
| 목 선택 | **입력** `house.rentalType: "A".."I"`(사용자가 9옵션 선택, `HouseEntryRentalTypeSection.tsx`) | **도출** `deriveRentalArticle(category, acq, effRegDate)` |
| 반환형 | `boolean`(`isLongTermRentalHousingExempt`:264) | rich `EligibilityResult`(호별 failReasons + `perUnitVerdict` echo) |
| 등록완비 | `hasBasicRegistration`:94 (isRegisteredRental + 두 날짜) | `deriveEffectiveRegDate` null 체크 |
| 날짜 의미 | **비일관** — A/C=개별(`biz>cut ‖ rent>cut`:107,133)·**E=지자체만**(`rentalRegistrationDate`:167)·F/H/I=**max**(:193,223,245) | **max 균일**(Q1 결정) |
| 아목 조정 | `isExcluded918Rule && !hasContractDepositProof`:233 (2필드·계약금 carve-out) | `isRegulatedAreaNewAcq`:1필드 (**필드명 불일치 — P8 통일 필요**) |
| 가격필드 | `rentalStartOfficialPrice ?? officialPrice` / 나·라 `acquisitionOfficialPrice` | `standardPriceAtRentalStart` |
| 면적 | `landArea`·`totalFloorArea` | `landAreaM2`·`totalFloorAreaM2` |
| 지역 | `isCapitalArea ?? region==="capital"` (**region: `"capital"\|"non_capital"` 2값**, types:48) | `region: "seoul-metro"\|"non-metro"` 2값 |
| 기간 | `calcRentalPeriodYears`(년 or start/end) | `rentalMonths/12` |
| 5%룰 | `rentIncreaseUnder5Pct`(독립 boolean) | `requirementsConfirmed`(5%+등록유지+재증액 묶음) |

**A~I ↔ 가~자 매핑 (실측 — `getRentalTypeLabel`:292 + 함수 주석)**:
A=가(매입5년)·B=나(기존사업자)·C=다(건설5년)·D=라(미분양)·E=마(장기매입10년)·F=바(장기건설10년)·G=사(말소후양도)·H=아(단기매입6년)·I=자(단기건설6년).

---

## 2. 핵심 발견

### F5 — 바목 cap divergence (Phase 1 잠재 버그) ✅ C1 수정 완료
> **✅ 정정(C1, 2026-07-26)**: `rental-article/rules.ts` `rentalStdPriceCap`에서 바목 = 등록기준일 2025.2.28 경계로 6억/9억 분기. §155⑳ `deriveStdPriceCap`가 위임(3-arg: article·region·effectiveRegDate). anchor 2건(2025.2.27→6억 배제·2025.2.28→9억). 다주택측 rules 위임은 C3.
> ⚠️ 2025.2.28 경계일·등록일기준은 MCP amendment_track 미확인(다주택 tested 값 정렬) — Do 후속서 재확인.

- 다주택 `checkRentalType_F`:196 — `latestRegDate ≥ 2025-02-28 ? 9억 : 6억` (역사 개정: 6억→9억).
- §155⑳ `deriveStdPriceCap("바")` — **9억 고정**(Phase 1). → **2025.2.28 이전 등록 건설 장기임대에서 §155⑳가 6억 대신 9억 적용 = 과대적용(납세자 유리 오적용)**.
- ⚠️ **Do 전 2건 재확인(korean-law-citation-verify·`feedback_historical_statute_value_via_tribunal`)**: (a) 개정 시행일 `2025-02-28`(다주택 코드 출처 — MCP `amendment_track`로 확인), (b) **cap 6억→9억 상향의 경계 기준일이 "등록일" vs "임대개시일"** 중 무엇인지(다주택 코드는 `latestRegDate`=등록일 사용하나 법문은 "임대개시일 당시 9억" — 개정 부칙의 적용례 확인). 미확인 시 "확인 필요" 유지.

### 상수 이중정의
- cap(6억/3억/9억/4억/2억)·면적(298/149)·기간(5/8/10/6)·경계일(2018.4.2·2020.8.18·2025.2.28·2025.6.4)이 **양 파일에 하드코딩**. F5는 이 이중정의의 직접 산물.

### F6 — 다·바(건설 장기) 아파트 blanket 제한 (Phase 1 §155⑳ 버그) ✅ hotfix 완료
- Phase 1 `eligibility.ts` `isApartmentRestricted`가 `article ∈ {아,자,다,바}` 시 아파트 제한 → 건설 장기 아파트 근거 없이 배제(불리 오적용).
- **✅ 정정(hotfix, 2026-07-26)**: `isApartmentRestricted`에서 다·바 제거(아·자만 blanket·가/마=2020.7.11 date·다/바/구법=허용) + UI `showApartment`·배지 텍스트 정정 + anchor 3건(바목·다목 아파트 통과·아자 배제 유지). Phase 2는 F6 재수정 불요.
- **잔여(Phase 2)**: 바목 "단기→장기 변경 아파트" 제외는 `isExcludedShortToLongChange` 입력 필요(U1) — hotfix 범위 밖(입력 필드 없이 전면 허용 = 유리 default, 다주택과 동일 동작).

### 날짜 의미 비일관 (다주택 내부)
- E(마목)는 `rentalRegistrationDate`(지자체)만으로 8/10 판정 → §155⑳ max와 divergent. 예: biz=2020-09·rent=2020-07 → 다주택 E=8년(rent<8.18), §155⑳=10년(max≥8.18). **법령상 tier 기준일=지자체 신청일**이므로 E가 더 정확할 수 있으나 사용자 Q1은 max 선택 → 통합 시 택일 필요.

---

## 3. 통합 아키텍처

### 신규 공용 모듈 `lib/tax-engine/rental-article/`
```
rules.ts   — RENTAL_ARTICLE_RULES: 목별 cap(지역·역사 개정 함수)·면적·의무기간·경계일 단일 상수
types.ts   — RentalArticle("가".."자"·"구법") · NormalizedRentalUnit(정규화 입력)
check.ts   — checkRentalArticle(article, NormalizedRentalUnit): { passed, failCode?, requiredYears, stdPriceCap }
derive.ts  — deriveRentalArticle · deriveEffectiveRegDate · deriveRequiredYears · deriveStdPriceCap (Phase 1 §155⑳서 이관)
```

`NormalizedRentalUnit`(양 feature 어댑터 타깃):
```ts
type NormalizedRentalUnit = {
  businessRegistrationDate: Date | null;
  rentalRegistrationDate: Date | null;
  acquisitionType: "purchase" | "construction";
  isApartment: boolean;
  isCapitalArea: boolean;          // 수도권 여부 (다주택 region:"capital" / §155⑳ "seoul-metro" 정규화)
  rentalStartOfficialPrice: number; // 임대개시일 기준시가
  acquisitionOfficialPrice: number; // 취득당시 기준시가 (나·라목 — 별도 시점)
  rentalYears: number;              // ⚠ P6: §155⑳는 rentalMonths/12(분수) 그대로 — 71개월=5.916<6 배제 정밀도 보존(정수 반올림 금지)
  landAreaM2?: number; totalFloorAreaM2?: number;
  hasMinimum2Units: boolean; hasMinimum5UnitsInCity?: boolean; isNationalSizeHousing?: boolean;
  rentIncreaseUnder5Pct: boolean;
  // 아목 게이트 (P8 정본: 다주택 2필드 모델 채택 — §155⑳ isRegulatedAreaNewAcq → isExcluded918Rule로 통일 rename)
  isExcluded918Rule: boolean;       // 조정대상지역 신규취득 해당
  hasContractDepositProof?: boolean; // 조정 공고일 이전 취득·계약금 증빙 carve-out
  firstSaleContractDate?: Date; isConvertedToSale?: boolean;
  // 사목(말소) 필드: rentalCancellationDate·hasHalfDutyPeriodMet·isSoldWithin1YearOfCancellation (다주택 전용)
};
```
> **P8 아목 게이트 통일**: 다주택은 `isExcluded918Rule && !hasContractDepositProof`(carve-out 반영), §155⑳ Phase 1은 `isRegulatedAreaNewAcq` 1필드. 통합 정본은 **다주택 2필드 모델**(법령 아목 4) 단서의 carve-out을 표현). D-2 채택 시 §155⑳ 폼 필드 `isRegulatedAreaNewAcq`→`isExcluded918Rule` **rename + `hasContractDepositProof` 추가**(14-sync·마이그레이션 필드명 변경).

### 소비 방식
- **§155⑳** `eligibility.ts`: `deriveRentalArticle`로 목 도출 → 어댑터로 `NormalizedRentalUnit` 생성 → `checkRentalArticle` 호출 → 결과를 호별 `EligibilityResult`+`perUnitVerdict`로 wrap.
- **다주택** `multi-house-surcharge-count.ts`: `house.rentalType`(입력 A~I)를 article로 매핑 → 어댑터로 `HouseInfo → NormalizedRentalUnit` → `checkRentalArticle` → `.passed` boolean 반환. **9개 `checkRentalType_*` 폐지·`check.ts` 위임**.

> **P7 derive 이관 blast-radius**: `derive*` 4함수를 Phase 1 `eligibility.ts`에서 `rental-article/derive.ts`로 이관하면, **현재 이를 import하는 2곳**(`components/calc/transfer/RentalHousingExceptionSection.tsx` ⑤ · `lib/calc/transfer-tax-validate-rental-exception.ts` ⑧)의 import 경로를 갱신해야 한다(실측 확인). `eligibility.ts`는 re-export로 하위호환 유지 권장(테스트 import 경로 보존).

### 통합 깊이 — 단계 선택 (Simplicity First)
| Tier | 범위 | 위험 | 권장 |
|---|---|---|---|
| T1 | 상수만 `rules.ts` 단일화(양측 cap/면적/기간을 상수 조회로 치환). 예측 로직은 각자 유지 | 낮음 (숫자 무변경 시 회귀 0) | F5 즉시 해소·최소 |
| **T2** | **canonical predicate `check.ts` 단일화** + 어댑터. 9개 `checkRentalType_*` 폐지 | 중 (다주택 날짜의미·아목게이트 재정렬 → 다주택 회귀 재anchor) | **★ 사용자 요청 "단일화"의 본질** |
| T3 | 다주택 UI도 A~I 입력 → 도출 전환(§155⑳ UX 이식) | 높음 (다주택 14-sync 전면) | 별도 기능·범위 밖 |

→ **권장: T2**(사용자 "단일화" 의도). T1은 T2의 선행 커밋으로 포함. T3는 제외.

---

## 4. 결정 필요 사항 (Do 전 확정)

- **D-1 날짜 의미**: 통합 `deriveRequiredYears`/경계 판정 = **max(두 등록일)** 균일 채택 권장(§155⑳ Q1 계승). → 다주택 E(마목)가 지자체-only에서 max로 바뀜 = **다주택 회귀**(split-date 유닛). 영향 유닛 anchor로 세액 영향 확인 후 확정. (대안: 지자체-신청일 정본 채택 시 §155⑳ Q1 재협의)
- **D-2 아목 조정게이트**: **다주택 2필드 모델(`isExcluded918Rule` + `hasContractDepositProof` carve-out) 정본** 채택 권장(법령 아목 4) 단서 carve-out 반영·다주택 정합). → §155⑳ Phase 1 `isRegulatedAreaNewAcq`를 **`isExcluded918Rule`로 rename + `hasContractDepositProof` 추가**(14-sync·아래 §7 마이그레이션). 어댑터에서 다주택 HouseInfo는 동명 필드 직결.
- **D-3 바목 cap(F5)**: `rules.ts`에서 `바 cap = latestRegDate ≥ 2025.2.28 ? 9억 : 6억`로 단일화. §155⑳·다주택 동시 정합. 시행일 MCP 재확인.
- **D-4 5%룰 표현**: 통합 입력은 `rentIncreaseUnder5Pct` 독립 필드로. §155⑳는 `requirementsConfirmed`(묶음)를 유지하되 어댑터에서 `rentIncreaseUnder5Pct = requirementsConfirmed`로 매핑(현행 의미 보존) — 또는 §155⑳ UI도 5%룰 분리(범위 확대, 비권장).

---

## 5. 나목(existing_business) 추가 설계

**신규 rentalCategory 값** `existing_business`(→ `deriveRentalArticle(existing_business, purchase) = "나"`).

**나목 요건(§167조의3①2호 나목·`checkRentalType_B`:117 실측)**: **사업자등록일 ≤ 2003.10.29**(기존사업자기준일, biz-date 개별 판정 — `effectiveRegDate`=max 아님) · 국민주택규모 · 2호+ · **취득당시** 기준시가 3억(지역무관) · 5년.
> **P3 deeming rule**: §167조의3①2호 본문 괄호 — 2003.10.29 현재 민특법§5 등록했으나 §168 미등록이던 자가 **2004.6.30까지 §168 등록** 시 민특법 등록일에 §168 등록한 것으로 봄. 현행 다주택 `checkRentalType_B`:119는 이 deeming을 미구현(`biz > 2003.10.29`만) → 통합 시 반영 여부 결정(경미·대상 극소수, "확인 필요").

**신규 필드(`RentalUnitInput`·폼)**:
- `acquisitionOfficialPrice`(취득당시 기준시가, string) — 나·라목 전용. 임대개시일 기준시가(`standardPriceAtRentalStart`)와 **별도 필드**(cap 측정시점 상이).
- `isNationalSizeHousing`(국민주택규모 자기확인 boolean).
- (`hasMinimum2Units` 기존 재사용 — 단 P5: Phase 1 UI는 이 토글을 `isConstruction`으로 게이트 → 나목(매입)에도 노출되도록 조건 확장.)

**P4 나목 판정**: `checkRentalArticle("나", u)`는 **`businessRegistrationDate ≤ 2003.10.29`**(effectiveRegDate 아님) + `acquisitionOfficialPrice ≤ 3억` + `isNationalSizeHousing` + `hasMinimum2Units` + `rentalYears ≥ 5`. `deriveStdPriceCap("나")` = 300_000_000(취득당시·지역무관).

**Px 취득방법**: `existing_business`는 매입임대 전용 → 선택 시 **취득방법을 "매입"으로 고정(라디오 disabled/숨김)**. `existing_business × construction` 무효조합 차단.

**UI 조건부(§3-D3 확장)**:
- 임대구분 RadioCardGroup에 "기존사업자" 옵션 추가(→ existing_business).
- 나목 선택 시: **기준시가 위젯 스왑** — `standardPriceAtRentalStart`(임대개시일) 숨김, `acquisitionOfficialPrice`(취득당시) `CurrencyInput` 노출(`data-testid=rental-acq-official-price-{i}`, hint "취득 당시 기준시가 3억 이하").
- 국민주택규모 `ToggleCard`(`rental-national-size-{i}`) · 2호+ `ToggleCard`(나목·건설 공통).
- **P14 아파트**: 나목(2003.10.29 이전 등록)은 아파트 허용 → `showApartment`에 나목(구법 계열) 포함(아파트 여부 라디오 노출, 제한 없음).
- 소재지역: 나목 cap은 지역무관(취득당시 3억) → 소재지역 라디오 **숨김**(showRegion 나목 제외).
- 판정 배지 "나목 · 의무 5년 · 취득당시 3억(지역무관)".

### 마·바목 배제사유 보완 (Phase 1 §155⑳ 미완결 — U1·U2)
Phase 1 §155⑳는 마목 배제사유 중 아파트 date-gate만 구현. 다주택 `checkRentalType_E`(마)·`F`(바) 실측 대비 **누락 2건**:
- **U2 마목 918**: `isExcluded918Rule`(2018.9.14 이후 조정대상지역 취득) → 마목 **hard 배제**(E:174). 아목은 carve-out(계약금증빙), 마목은 무조건. §155⑳에 `isExcluded918Rule` 입력을 마·아 공통으로 노출.
- **U1 단기→장기 변경**: `isExcludedShortToLongChange`(단기민간임대를 2020.7.11 이후 장기일반으로 변경신고) → 마·바 배제(E:176·F:201). F6(바 아파트 허용) 정정과 짝 — 이 필드 없이 바 아파트 전면허용하면 단→장변경분 오허용.
- 신규 필드 `isExcluded918Rule`(마·아 이미 D-2서 도입)·`isExcludedShortToLongChange`(마·바) → 14-sync(§6).

> 라목(미분양)은 5호+·미분양확인서 등 특수 → 본 계획 범위 밖(Phase 3 후보).

---

## 6. 14 동기화 지점 영향

### §155⑳ 나목 신규 필드 (`acquisitionOfficialPrice`·`isNationalSizeHousing`·existing_business enum)
①폼타입 ②factory ③migrate ④api-helpers ⑤UI(취득당시 기준시가 스왑·국민주택 토글·2호 게이트 확장·취득방법 고정·마아 918·마바 단→장변경 토글) ⑥N/A ⑦결과카드(나목 배지) ⑧validate(나목=취득당시 기준시가·국민주택 필수) ⑨⑩⑫Zod(enum+신필드) ⑬⑭route. **D-2/U1/U2 채택 시 `isRegulatedAreaNewAcq`→`isExcluded918Rule` rename + `hasContractDepositProof`·`isExcludedShortToLongChange` 추가도 동일 14-sync.**

> **P9 3중 패턴(강제)**: 나목 판정 필수값(취득당시 기준시가·국민주택·2호)은 validate(⑧)가 **`deriveRentalArticle` 재사용해 나목 감지**(Phase 1 건설 SIZE_REQUIRED와 동형) — 재구현 금지. API 변환(④) fallback ↔ validate 동기화(UI 통과↔validate 차단 모순 금지). existing_business 취득방법 고정도 UI·validate·엔진 3층 일치.

### 다주택측 (T2 위임)
- `multi-house-surcharge-count.ts`: `checkRentalType_A~I`→`check.ts` 위임(내부 리팩터, HouseInfo 입력 무변경 → **다주택 14-sync 무영향**, 단 판정 로직 변경 → 회귀 재anchor 필수).
- `HouseInfo` 필드·`HouseEntryRentalTypeSection` UI·Zod·route **무변경**(T3 아님).

---

## 7. 마이그레이션·회귀 리스크

- **양 feature 테스트 green 유지 필수(회귀 0)**: `__tests__/tax-engine/rental-housing-exception/`(2 dir·173) + `__tests__/tax-engine/multi-house-surcharge/`(특히 `rental-type-matrix.test.ts`) + `transfer-rental-type-matrix.engine.design.md` anchor.
- **다주택 날짜의미 변경(D-1)**: E(마목) 지자체→max 전환 시 split-date 유닛 회귀. `multi-house-surcharge/` 기존 E anchor가 지자체-only 가정이면 **재작성** 필요 → 세액 영향 확인 후.
- **바목 cap(F5)**: §155⑳ 바 9억→조건부. Phase 1 anchor(F2 7억 건설 통과)가 2021 등록 → 6억 cap이면 **7억=배제로 전환**. F2 anchor 재작성 필요(2025.2.28 이후 등록으로 조정 or 6억 경계로 변경).
- **existing_business 마이그레이션**: 구 데이터엔 없음(신규 enum) → 무영향. `acquisitionOfficialPrice`/`isNationalSizeHousing` backfill 빈값·false.
- **P8 필드 rename 마이그레이션(D-2 채택 시)**: Phase 1 sessionStorage 데이터의 `isRegulatedAreaNewAcq`(boolean) → `isExcluded918Rule`로 이전(값 보존) + `hasContractDepositProof` backfill false. `calc-wizard-asset-migrate.ts`에 rename 마이그레이션 추가. Phase 1 E2E/테스트의 `isRegulatedAreaNewAcq` 참조도 일괄 rename(테스트 fixture·`rh-eligibility-period.test.ts`·E2E `rental-regulated-newacq-*` testid).

---

## 8. 검증·anchor 계획 (Pre-Do 우선)

1. **F5 바목 cap**: 2024 등록 건설 장기 7억 → 배제(6억), 2025.3 등록 7억 → 통과(9억). §155⑳·다주택 **동일 결과** 교차 anchor.
2. **D-1 날짜의미**: split-date(biz 2020-09·rent 2020-07) 마목 → max 채택 시 양측 10년 일치 anchor.
3. **D-2 아목 게이트**: 조정 신규취득 + 계약금증빙 → 통과(carve-out), 증빙없음 → 배제. 양측 일치.
4. **나목**: 2003.10.29 이전 등록·국민주택·2호·취득당시 3억 → 통과 / 3.1억 → 배제 / 등록 2004 → 배제.
4b. **F6 아파트**: 바목(건설 장기) 일반 아파트 → 통과(Phase 1 배제 회귀 정정) / 아·자 아파트 → 배제 유지.
5. **통합 무회귀**: `check.ts` 도입 후 다주택 `rental-type-matrix.test.ts` + §155⑳ 173 전건 green.
6. **전체**: `tsc 0`·`lint 0`·`npm test` green·E2E(§155⑳ 나목 조건부 노출 + 다주택 A~I 무변경).

---

## 9. 단계별 롤아웃 (커밋 분리)

1. **C1 (=T1, T2의 선행 substep)** ✅**완료(2026-07-26)** — `rental-article/rules.ts`+`types.ts` 신설(SharedRentalArticle·rentalStdPriceCap·rentalRequiredYears·RA_CUT). §155⑳ `deriveStdPriceCap`(3-arg)·`deriveRequiredYears`가 rules 위임 + F5 바목 조건부 cap 해소. tsc 0·rental 158 green. **다주택 `checkRentalType_*`의 rules 치환은 C3와 함께**(shipped 다주택 회귀 위험 → 전체 predicate 위임 시 일괄).
2. **C2** ✅**완료(2026-07-26)** — `rental-article/check.ts`(`checkRentalArticle`·`NormalizedRentalUnit`·`ArticleFailCode`·`isApartmentRestrictedForArticle`·`isConstructionArticle`) 신설. §155⑳ `checkEligibility`가 목 도출→어댑터→`checkRentalArticle` 위임 + `buildFailMessage`로 한국어 메시지 매핑(동작 동일). `isApartmentRestricted`는 check.ts 재수출(UI 하위호환). **편차**: `ArticleCheckResult.failCodes: []`(배열 — §155⑳ 다중 사유 표시 보존). C2는 §155⑳ 현행 목(가/다/마/바/아/자/구법)·게이트만 — 나·라·사·마목918·단→장변경은 C3/C4. tsc 0·rental 158+check 8·transfer-tax 2020 green.
3. **C3** ✅**완료(2026-07-26)** — 다주택 `checkRentalType_A~I`(9함수) 삭제·`isLongTermRentalHousingExempt`가 `ARTICLE_BY_RENTAL_TYPE`(A~I→가~자)+`toNormalizedFromHouse` 어댑터→`checkRentalArticle(...).passed` 위임. `check.ts` predicate를 나·라·사목 + REG_DATE_GATE·NATIONAL_SIZE_REQUIRED·SHORT_TO_LONG_CHANGE·REGION_RESTRICTED 게이트로 superset 확장. `NormalizedRentalUnit`=biz/rent raw(내부 effRegDate=max)+취득당시·라/사 필드. D-1 max 채택(다주택 E 앵커 동일날짜라 무회귀). tsc 0·lint 0·전체 11438 green.
   - **실측 편차 3건(설계 §4 대비)**: ①**가·다목 등록상한 2018.4.2는 공용 predicate 미적용**(§155⑳ derive가 2020.7.11 경계로 가/다목 도출 — 기본 makeUnit reg 2019가 가목이라 공용 적용 시 §155⑳ 다수 앵커 회귀) → **다주택-side 잔여 게이트**로 유지. ②**마목 아파트 = date-derived ∥ isExcludedAfter20200711Apt(flag) OR결합**(§155⑳ date·다주택 flag 양립). MH-16 앵커 `isApartment:false` 재anchor(makeHouse 기본 아파트가 2021등록 마목을 date-derived 제한으로 flip — 요건충족 시나리오는 비아파트가 정본, 법령상 아파트 장기일반 등록 불가). ③아목 918 게이트 = 다주택 `isExcluded918Rule && !hasContractDepositProof` ∥ §155⑳ `isRegulatedAreaNewAcq`(C3 병존·C4 rename로 통일).
4. **C4** ✅**완료(2026-07-26)** — 나목(`existing_business`) 14-sync + D-2 rename + U1/U2. 엔진 `RentalCategory`+existing_business·`RentalArticle`+나·`RentalUnitInput` rename(`isRegulatedAreaNewAcq`→`isExcluded918Rule`)+신규 필드(취득당시 기준시가·국민주택·계약금증빙·단→장변경, optional·Zod required). `deriveRentalArticle` existing_business→나. check.ts `isRegulatedAreaNewAcq` 제거(양 feature 아목 게이트 `isExcluded918Rule`+carve-out 통일). 14지점: ①폼 ②factory ③migrate(rename 값보존+backfill) ④api-helpers ⑤UI(취득당시 기준시가 스왑·국민주택/2호 토글·취득방법 고정·918/carve-out/단→장변경 토글·소재지역 숨김) ⑦결과카드(자동 나목) ⑧validate(나목 분기) ⑨⑫Zod ⑬⑭route(+`_rental-engine-input.ts` 추출로 route.ts 800↓). tsc 0·lint 0·전체 11444 green·E2E 3 pass. **U1/U2**(마목918 hard·마·바 단→장변경) §155⑳ 편입 완료.
5. **C5** ✅**완료(2026-07-26)** — E2E 3 pass(마목918 토글·나목 스왑·미완비 경고)·전체 회귀 11444 green. C4에 통합 검증·ship.

---

## 10. 미결(사용자 확인)

- **Q-P2-1**: D-1 날짜의미 — **max 균일**(§155⑳ Q1 계승, 다주택 E 회귀 감수) vs 지자체-신청일 정본(§155⑳ Q1 재협의). **권장: max**.
- **Q-P2-2**: 통합 깊이 — **T2**(predicate 단일화, 권장) vs T1(상수만, 최소). 
- **Q-P2-3**: 라목(미분양)·사목(말소) §155⑳ 편입 — ✅**Phase 3 종결(2026-07-26)**. 법령 실측(§167조의3①2호·§155⑳ 전문): **사목은 §155⑳ 구조적 편입 불가**(사목=임대주택 자체를 말소 후 1년내 양도하는 다주택 중과배제 개념 → 임대주택 보유·거주주택 양도인 §155⑳와 상충·§155⑳ 2호 "양도일 현재 임대중" 위배). §155⑳ 말소 실질대응 = **㉓**(가·다·라·마목 자진말소 1/2↑·자동말소 후 말소 후 5년내 거주주택 양도 → 의무기간 간주). 구현: ㉓ 말소특례(rentalAutoTermination 실배선·RENTAL_PERIOD_SHORT 억제) + 라목(unsold_08_09·firstSaleContractDate·hasMinimum5UnitsInCity 14-sync). tsc 0·전체 11450 green·E2E 4. RentalUnitCard.tsx 추출(800정책).

---

## 부록 — 검증된 앵커

| 대상 | 파일 | 라인 |
|---|---|---|
| 다주택 9유형 predicate | `lib/tax-engine/multi-house-surcharge-count.ts` | `checkRentalType_A~I` 103-258 · `isLongTermRentalHousingExempt` 264 · `getRentalTypeLabel` 292 |
| 다주택 HouseInfo 임대필드 | `lib/tax-engine/types/multi-house-surcharge.types.ts` | 27(RentalHousingType)·44·46·99·115·119·129·131·133·135·137·139·141·143·145·147·149·179 |
| 다주택 유형 UI | `components/calc/transfer/HouseEntryRentalTypeSection.tsx` | TYPE_FIELDS·A~I RadioCardGroup |
| §155⑳ Phase 1 판정 | `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts` | deriveEffectiveRegDate·deriveRentalArticle·deriveStdPriceCap·checkEligibility |
| §155⑳ Phase 1 계획 | `docs/02-design/features/rental-housing-155-20-active-ui.plan.md` | §4·§6 F1~F4·Q3 |
| 다주택 매트릭스 설계 | `docs/02-design/features/transfer-rental-type-matrix.engine.design.md` | 8-24 매트릭스 |
