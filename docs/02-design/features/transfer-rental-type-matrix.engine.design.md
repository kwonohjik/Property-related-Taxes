# 양도세 다주택 중과 — 장기임대 9유형(가~자목) 매트릭스 설계

> 계획: `docs/00-pm/transfer-multi-house-input.plan.md` 후속 (보류 항목 해제).
> 엔진(`isLongTermRentalHousingExempt` + `checkRentalType_A~I`, helpers:88-296)은 **완비** — 입력 도달만 과제.
> **법령 정확성**: rentalType 설정 시 엔진은 legacy 단순배제를 버리고 유형별 정밀검사 → 필요 필드 누락 시
> false 반환 → 배제 대상 주택이 주택수 산입(과다 중과). 따라서 유형별 필드를 빠짐없이 받아야 한다.

## ★ 유형별 필드 매트릭스 (엔진 checkRentalType_X 실측 — helpers:108-264)

공통(전 유형, P1 기구현): `isRegisteredRental`·`rentalRegistrationDate`·`businessRegistrationDate`·`rentalPeriodYears`.
가액 fallback: `rentalStartOfficialPrice ?? officialPrice` 또는 `acquisitionOfficialPrice ?? officialPrice`.
지역: `isCapitalArea ?? region==="capital"` → **region 재사용(신규 isCapitalArea 불요)**.

| 유형 | 라벨 | 추가 노출 필드 (공통 외) | 엔진 라인 |
|---|---|---|---|
| A 가 | 민간매입임대 5년 | rentalStartOfficialPrice · rentIncreaseUnder5Pct (등록일≤2018.4.2 자동판정) | 109-120 |
| B 나 | 기존사업자 매입임대 | acquisitionOfficialPrice · isNationalSizeHousing · hasMinimum2Units (사업자등록일≤2003.10.29 자동) | 123-132 |
| C 다 | 민간건설임대 5년 | rentalStartOfficialPrice · hasMinimum2Units · landArea · totalFloorArea · rentIncreaseUnder5Pct · isConvertedToSale | 135-148 |
| D 라 | 미분양 매입임대 | acquisitionOfficialPrice · firstSaleContractDate · landArea · totalFloorArea · hasMinimum5UnitsInCity · isExcludedAfter20200711Apt (비수도권=region) | 151-165 |
| E 마 | 장기일반 매입임대 10년 | rentalStartOfficialPrice · rentIncreaseUnder5Pct · isExcluded918Rule · isExcludedAfter20200711Apt · isExcludedShortToLongChange (8/10년 자동) | 171-184 |
| F 바 | 장기일반 건설임대 10년 | rentalStartOfficialPrice · hasMinimum2Units · landArea · totalFloorArea · rentIncreaseUnder5Pct · isConvertedToSale · isExcludedShortToLongChange (9억 자동: 등록일≥2025.2.28) | 190-209 |
| G 사 | 자진·자동 말소 후 양도 | rentalCancellationDate · hasHalfDutyPeriodMet · isSoldWithin1YearOfCancellation | 212-219 |
| H 아 | 단기 매입임대 6년(2025.6.4~) | rentalStartOfficialPrice · rentIncreaseUnder5Pct · isExcluded918Rule · hasContractDepositProof (비아파트=기존 isApartment) | 225-241 |
| I 자 | 단기 건설임대 6년(2025.6.4~) | rentalStartOfficialPrice · hasMinimum2Units · landArea · totalFloorArea · rentIncreaseUnder5Pct (비아파트=isApartment) | 247-264 |

## 신규 HouseEntry 필드 (18종, 전부 optional)

```ts
rentalType?: RentalHousingType;          // "A".."I" 선택 (엔진 RentalHousingType import)
rentIncreaseUnder5Pct?: boolean;          // A·C·E·F·H·I
isNationalSizeHousing?: boolean;          // B
hasMinimum2Units?: boolean;               // B·C·F·I
hasMinimum5UnitsInCity?: boolean;         // D
rentalLandArea?: string;                  // C·D·F·I (㎡ DecimalInput, ≤298) → route에서 엔진 landArea로 매핑
rentalTotalFloorArea?: string;            // C·D·F·I (㎡ DecimalInput, ≤149) → route에서 엔진 totalFloorArea로 매핑
isConvertedToSale?: boolean;              // C·F (분양전환)
firstSaleContractDate?: string;           // D (최초분양계약일)
acquisitionOfficialPrice?: string;        // B·D (취득 당시 공시가, 원)
rentalStartOfficialPrice?: string;        // A·C·E·F·H·I (임대개시 당시 공시가, 원)
hasHalfDutyPeriodMet?: boolean;           // G
isSoldWithin1YearOfCancellation?: boolean;// G
rentalCancellationDate?: string;          // G (자진·자동 말소일, rentalCancelledDate와 별개)
isExcluded918Rule?: boolean;              // E·H (2018.9.14 조정지역 취득 제외)
isExcludedAfter20200711Apt?: boolean;     // D·E (2020.7.11 이후 아파트 제외)
isExcludedShortToLongChange?: boolean;    // E·F (단기→장기 변경 제외)
hasContractDepositProof?: boolean;        // H
```

## UI 설계 (HouseEntryEditor ③ 장기임대 섹션 확장)

- `isLongTermRental` ON → `isRegisteredRental` ON(공통) → **rentalType RadioCardGroup(stack, 9옵션 가~자목)**.
- rentalType 선택 시 **해당 유형의 추가 필드만 조건부 노출**(위 매트릭스). 미선택 시 legacy 경로(기구현) 유지.
- 면적 DecimalInput(㎡)·공시가 CurrencyInput(원)·날짜 DateInput·나머지 ToggleCard.

## Validation (⑧, 유형별 필수)

rentalType 설정 시 해당 유형의 추가 필드 중 **판정 필수값**(가액·면적·날짜)을 미입력 시 차단.
boolean 요건(5%룰·2호 등)은 false=요건 미충족(배제 안 됨)이 유효 상태 → 차단 아님(경고 가능).
- 자동 안분 fallback 금지. rentalType 설정 + 가액/면적/날짜 빈값 → 오류.

## 14 동기화 지점

①HouseEntry ②addHouse(undefined) ③optional ④API(houses map 게이트) ⑤HouseEntryEditor 조건부 ⑥n/a ⑦기존 카드
⑧validate 유형별(가액·면적·날짜 필수) ⑨⑫houseSchema 18필드 ⑬buildHousesPayload(transfer-tax-api-houses.ts, isLongTermRental&&rentalType 게이트)
⑭route mapHousesToEngine: **rentalLandArea→landArea·rentalTotalFloorArea→totalFloorArea 이름 변환** + Date변환(firstSaleContractDate·rentalCancellationDate).

## 구현 상태 (2026-06-16 완료)
HouseEntry 18필드 + houseSchema + buildHousesPayload + mapHousesToEngine(이름변환) + HouseEntryRentalTypeSection(유형별 조건부 UI)
+ validate 유형별 + anchor(E·G·H 충족/미충족 6건) + route 매핑 테스트 + E2E(마목). tsc 0·전체 8318 통과·lint 0.
**주의(회귀 방지)**: 폼 이름 rentalLandArea↔엔진 landArea 불일치 → mapHousesToEngine 매핑 누락 시 침묵 strip(면적 0=298 통과 과대적용).
route 매핑 테스트가 이 변환을 가드.

## 테스트 약속

대표 유형 anchor: E(마목 10년)·G(사목 말소)·H(아목 2025 단기) 최소 3종 + 미입력 시 배제 안 됨(과다산정) 회귀.
엔진 `isLongTermRentalHousingExempt`는 기존 테스트 보유 — 신규는 폼→route→엔진 wiring + 유형별 필드 도달 검증.
