# 양도세 다주택 중과 — 세대 보유 주택 상세 입력 위젯 계획

> 작성: 2026-06-16 · 브랜치 `feat/transfer-multi-house-surcharge`
> PDCA: 설계는 워크플로 합성으로 진행 → 본 문서는 13단계 자가 검토 산출물(plan)로 사후 정합화.

## Context

다주택 중과 엔진(`lib/tax-engine/multi-house-surcharge.ts` 356줄 + helpers 795줄 + types 411줄)은
배제 14종·임대유형 A~I·중과 한시 유예까지 **완비**돼 있으나, 양도세 마법사 입력 계층이
`householdHousingCount`(단순 주택수 정수)만 받아 **엔진의 정밀 판정 경로가 UI에서 도달 불가**였다.

- `form.houses`(HouseEntry[])는 store·API변환·route·결과카드까지 배선돼 있었으나, 전송 필드가
  9종(id/region/취득일/공시가격/isInherited/isLongTermRental/isApartment/isOfficetel/isUnsoldHousing)뿐이라
  상속 5년 배제·임대 배제·한시 유예 판정에 필요한 입력이 부재.
- `isUnsoldHousing`는 store/API에 있으나 **chip이 JSX에서 누락**(기존 버그) → 미분양 배제 항상 미작동.
- 한시 유예(`gracePeriod`)는 엔진 `determineSurchargeExclusion`이 소비하나(helpers.ts:783),
  `TransferTaxInput`에 필드 부재 + `transfer-tax.ts` mhInput 미연결 → UI·엔진 모두 부재.

## 목표

양도세 마법사 Step4(보유 상황)에서 세대 보유 개별 주택 + 한시 유예 조건을 입력해
완비된 엔진 판정 경로(상속 5년·장기임대 배제·한시 유예)를 **실제 도달 가능**하게 한다.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| HouseEntry 확장 범위 | **P0 + P1** | 사용자 선택 |
| 장기임대(rentalType) 방식 | **Legacy 등록임대 경로** (9유형 매트릭스 보류) | 9유형 정밀검사는 ~20 조건부 필드 필요·오입력 시 법령 부정확(over-count) 위험. legacy 분기(등록+5년)는 ~5필드·정확·저위험 |
| UI 패턴 | **테이블 + 모달** | 상속 자산/채무/주식 카드의 확립 패턴. rentalType 보류로도 P0+P1 필드는 인라인 카드엔 과다 |
| gracePeriod 배치 | HousesListSection 하단 (`isOneHousehold && householdHousingCount≥2 && houses.length>0` 조건부) | houses[] 경로 전용이므로 위젯·API·검증·엔진 사용을 houses>0로 일치(silent-omission 차단, 13단계 검토 M1) |

### Legacy 등록임대 경로 — 왜 9유형을 보류했나 (법령 정확성)

엔진 `countEffectiveHouses`(helpers.ts:399-401): `rentalType`이 설정되면 legacy 단순배제를 버리고
유형별 정밀검사(`isLongTermRentalHousingExempt`)를 수행 → 유형별 필요 필드(가~자목, ~20종)가 비면
`false` 반환 → 배제 대상 임대주택이 **주택수에 산입(과다 중과)**. 따라서 rentalType을 노출하면서
필드를 다 받지 않으면 법령 부정확. → rentalType **미노출**, `isLongTermRental` + 등록정보(legacy 분기,
helpers.ts:275-282: 등록사업자+등록일2종+임대기간≥5년)만 노출하여 정확한 단순배제를 제공.

## 신규 입력 필드

### HouseEntry (lib/stores/calc-wizard-asset-nbl.ts) — P0+P1, 전부 optional

| 필드 | 타입 | 용도 | 우선순위 |
|---|---|---|---|
| `inheritedDate` | string | 상속 5년 배제 기산 (소령 §167의3①7호, helpers:383) | P0 |
| `isRegisteredRental` | boolean | 임대사업자 정식 등록 여부 (legacy 분기 게이트) | P1 |
| `rentalRegistrationDate` | string | 임대사업자 등록일 | P1 |
| `businessRegistrationDate` | string | 사업자 등록일 | P1 |
| `rentalPeriodYears` | string | 임대기간(년) — 5년↑ 배제 | P1 |
| `rentalCancelledDate` | string | 말소일 (양도 전 말소 시 배제 해제, helpers:397) | P1 |
| `isUnsoldHousing` | boolean (기존) | chip 누락 버그 수정 | P0 |

### TransferFormData.gracePeriod (lib/stores/calc-wizard-store.ts) — 폼-전역 3-state optional

`{ contractDate: string; isLandPermitArea: boolean; hasTenantInResidence: boolean; areaDesignatedDate?: string }`
- undefined = 미입력(blanket 유예) / 객체 = 정밀 조건 판정.
- 엔진 타입: `MultiHouseGracePeriodInput`(Date) — 폼은 string, route에서 Date 변환.

## 엔진 변경 (최소 wiring)

1. `TransferTaxInput.gracePeriod?: MultiHouseGracePeriodInput` 추가 (types/transfer.types.ts).
2. `transfer-tax.ts` STEP 0.5 mhInput에 `gracePeriod: workingInput.gracePeriod` 1줄.
3. `MultiHouseGracePeriodInput` 명명 타입 추출(multi-house-surcharge.types.ts) — 엔진/폼 변환 공유 + dedup.
4. **[13단계 검토 — 적대적 리뷰 적발]** `checkGracePeriodExemption` contractDate **하한(2022-05-10) 누락** 정정
   (helpers:563, `SURCHARGE_EXCLUSION_WINDOW.start` 재사용). 누락 시 유예 시행 전 계약도 조건B/C 충족 시
   잘못 배제. UI가 노출시킨 pre-existing 엔진 버그 → anchor A3d 회귀 추가. (gracePeriod 소비 로직 자체는 무변경.)

## Definition of Done — 14개 동기화 지점

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① | 폼 상태 타입 | calc-wizard-asset-nbl.ts(HouseEntry)·calc-wizard-store.ts(gracePeriod) | ✅ |
| ② | initial | 3-state optional undefined (HouseEntry 신규필드·gracePeriod 미설정) | ✅ |
| ③ | normalize | optional undefined-safe (마이그레이션 불요) | ✅ |
| ④ | API 변환 | transfer-tax-api.ts (houses payload 게이트·gracePeriod body) | ✅ |
| ⑤ | UI 위젯 | HouseEntryEditor.tsx·HousesListSection.tsx(테이블+모달)·gracePeriod | ✅ |
| ⑥ | 사이드바 | houses 합산 대상 아님 (n/a) | ✅ |
| ⑦ | 결과 카드 | MultiHouseSurchargeDetailCard·isSurchargeSuspended (기존) | ✅ |
| ⑧ | validation | transfer-tax-validate.ts step1 (상속개시일·등록정보·계약일 필수) | ✅ |
| ⑨ | Zod 메인 | transfer-tax-schema.ts gracePeriod | ✅ |
| ⑩ | companion Zod | n/a (단건 입력) | ✅ |
| ⑪ | acqDate fallback | houses filter(h.acquisitionDate) 유지 | ✅ |
| ⑫ | Zod 입력객체 | transfer-tax-schema-sub.ts houseSchema 6필드 | ✅ |
| ⑬ | body spread | transfer-tax-api.ts (housesPayload && form.gracePeriod) | ✅ |
| ⑭ | Route 매핑 | transfer-route-multi-house.ts mapHousesToEngine/mapGracePeriodToEngine (Date 변환) | ✅ |

## 케이스 인벤토리 / 테스트 약속

엔진 설계 문서(`docs/02-design/features/transfer-multi-house-input.engine.design.md`) 참조.

## 후속 (별도 PR)

- ✅ **rentalType 9유형(가~자목) 매트릭스** (2026-06-16 완료): HouseEntry 18필드 + 유형별 조건부 UI
  (`HouseEntryRentalTypeSection`) + 유형별 validation + 이름변환(rentalLandArea→landArea) + anchor(E·G·H).
  설계: `docs/02-design/features/transfer-rental-type-matrix.engine.design.md`.
- ✅ **presaleRights(분양권/입주권) 입력 위젯** (2026-06-16 완료): `PresaleRightEntry` + `PresaleRightsSection`
  + 전 계층 배선 + housesPayload 게이트 확장(`houses>0 || presaleRights>0`).
- ✅ **P2 특수 배제 사유** (2026-06-16 완료): 양도주택 3주택+ 전용(저당권·사원주택·조특·문화재·어린이집 —
  폼-전역 `sellingHouseExclusion` + `SellingHouseExclusionSection`, householdCount≥3 노출) +
  다른주택 2주택 전용·인구감소(부득이·소송·정비구역·인구감소 세컨드홈 — HouseEntry 8필드 +
  `HouseEntrySpecialExclusionSection`). anchor 9건(3주택+·2주택·인구감소) + route 매핑 + E2E 2.
- **다주택 중과 입력 위젯 전 범위 완료** — 엔진 배제 14종·임대 9유형·한시유예·분양권 모두 UI 도달 가능.
